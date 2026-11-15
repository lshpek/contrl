"""Bridge endpoints for @botvexdev_bot integration & Telegram profile sync."""
from __future__ import annotations

import hmac
import secrets
import httpx
import sqlite3
import tempfile
import time
import zipfile
from collections import defaultdict
from pathlib import Path
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import AccessContext, hash_password, require_permission
from .config import settings
from .database import get_db
from .models import (
    ActivityEvent, Client, Order, Project, Role, Service, User,
)
from .notifier import notify_customer_telegram, notify_staff_telegram
from .schemas import BotIntakeRequest, BotIntakeResponse, BotOrderSyncRequest, BotUserRegisterRequest, TelegramSyncResponse

router = APIRouter(tags=["bot bridge"])

_BRIDGE_HITS: dict[str, list[float]] = defaultdict(list)


def _check_bridge_rate_limit(request: Request, limit: int = 60, window: int = 60) -> None:
    ip = (request.client.host if request.client else "unknown") or "unknown"
    now = time.monotonic()
    hits = [t for t in _BRIDGE_HITS[ip] if now - t < window]
    if len(hits) >= limit:
        _BRIDGE_HITS[ip] = hits
        raise HTTPException(status_code=429, detail="Слишком много запросов к интеграции")
    hits.append(now)
    _BRIDGE_HITS[ip] = hits



def _normalize_tg_username(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = raw.strip().lstrip("@")
    return f"@{cleaned}" if cleaned else None


def _verify_bridge_secret(secret_header: str | None) -> None:
    expected = settings.botvex_intake_secret or settings.botvex_control_secret
    if expected:
        if not secret_header or not hmac.compare_digest(secret_header, expected):
            raise HTTPException(status_code=403, detail="Неверный X-Botvex-Secret")
    elif not settings.local_dev_mode:
        raise HTTPException(status_code=503, detail="BOTVEX_CONTROL_SECRET не настроен")


def _next_order_number(db: Session) -> str:
    last_id = db.scalar(select(Order.id).order_by(Order.id.desc()).limit(1)) or 0
    return f"BVX-{last_id + 101:04d}"


def _fetch_telegram_chat(telegram_user_id: str) -> dict:
    token = settings.telegram_bot_token
    if not token:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN не настроен в .env")
    try:
        resp = httpx.get(
            f"https://api.telegram.org/bot{token}/getChat",
            params={"chat_id": telegram_user_id},
            timeout=6.0,
        )
        data = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка запроса к Telegram Bot API: {exc}") from exc
    if not data.get("ok"):
        desc = data.get("description") or "Пользователь не найден или не запускал бота"
        raise HTTPException(status_code=400, detail=f"Telegram API: {desc}")
    return data.get("result") or {}


@router.get("/api/v1/integrations/bot/status")
def bot_bridge_status(_ctx: AccessContext = Depends(require_permission("settings:view"))):
    return {
        "bot_username": f"@{settings.telegram_bot_username}",
        "bot_token_configured": bool(settings.telegram_bot_token),
        "admin_chat_configured": bool(settings.admin_telegram_chat_id),
        "mini_app_url": settings.mini_app_url,
        "bridge_secret_configured": bool(settings.botvex_intake_secret or settings.botvex_control_secret),
    }


@router.post("/api/v1/integrations/bot/intake", response_model=BotIntakeResponse, status_code=201)
def bot_intake_order(
    payload: BotIntakeRequest,
    request: Request,
    x_botvex_secret: str | None = Header(None, alias="X-Botvex-Secret"),
    db: Session = Depends(get_db),
):
    """Receives new order / new bot registration from @botvexdev_bot, auto-creates Client, User, Order, and notifies owner."""
    _check_bridge_rate_limit(request)
    _verify_bridge_secret(x_botvex_secret)
    tg_id = payload.telegram_user_id.strip()
    tg_user = _normalize_tg_username(payload.telegram_username)
    full_name = payload.full_name.strip()

    client = db.scalar(select(Client).where(Client.telegram_user_id == tg_id))
    contact_line = " · ".join(part for part in [tg_user, f"TG ID: {tg_id}", payload.contacts] if part)
    if client is None:
        client = Client(
            name=full_name,
            contact_person=full_name,
            contacts=contact_line[:500],
            telegram_user_id=tg_id,
            telegram_username=tg_user,
            status="active",
            notes=f"Автоматически зарегистрирован через @{settings.telegram_bot_username}",
        )
        db.add(client)
        db.flush()
    else:
        client.name = full_name or client.name
        client.contact_person = full_name or client.contact_person
        if tg_user:
            client.telegram_username = tg_user
        client.contacts = contact_line[:500]
        client.status = "active"

    user = db.scalar(select(User).where(User.telegram_user_id == tg_id))
    if user is None:
        client_role = db.scalar(select(Role).where(Role.slug == "client", Role.is_active.is_(True)))
        base_slug = (tg_user.lstrip("@").lower() if tg_user else f"tg_{tg_id}")[:60]
        candidate = base_slug
        suffix = 1
        while db.scalar(select(User.id).where(User.username == candidate)) is not None:
            suffix += 1
            candidate = f"{base_slug[:52]}_{suffix}"
        user = User(
            username=candidate,
            password_hash=hash_password(secrets.token_urlsafe(24)),
            is_active=True,
            is_owner=False,
            must_change_password=False,
            customer_id=client.id,
            telegram_user_id=tg_id,
            roles=[client_role] if client_role else [],
        )
        db.add(user)
        db.flush()
    else:
        if user.customer_id is None:
            user.customer_id = client.id

    project_id: int | None = None
    service_id: int | None = None
    if payload.bot_name and payload.bot_name.strip():
        project = Project(
            name=payload.bot_name.strip(),
            description=payload.order_scope[:2000],
            client_id=client.id,
            status="active",
            priority="high",
        )
        db.add(project)
        db.flush()
        project_id = project.id

        service = Service(
            name=payload.bot_name.strip(),
            type="bot",
            project_id=project.id,
            status="healthy",
            is_enabled=True,
            control_mode="manual_flag",
            url=payload.service_url,
            notes=f"Создан из заказа @{settings.telegram_bot_username}",
        )
        db.add(service)
        db.flush()
        service_id = service.id

    order = Order(
        order_number=_next_order_number(db),
        client_id=client.id,
        project_id=project_id,
        title=payload.order_title.strip(),
        scope=payload.order_scope.strip(),
        client_visible_summary=((f"Бюджет: {payload.budget_label.strip()}\n" if payload.budget_label else "") + payload.order_scope.strip())[:1000],
        amount=payload.amount,
        paid_amount=0,
        currency=payload.currency.upper(),
        status="brief",
        client_visible=True,
    )
    db.add(order)
    db.flush()

    db.add(
        ActivityEvent(
            actor=f"bot:{settings.telegram_bot_username}",
            entity_type="order",
            entity_id=order.id,
            action="bot_intake",
            summary=f"Новый заказ {order.order_number} от {tg_user or tg_id} ({full_name})",
        )
    )
    db.commit()

    owner_msg = (
        f"🆕 Новый заказ {order.order_number} из @{settings.telegram_bot_username}\n"
        f"Клиент: {full_name} ({tg_user or 'без username'}, ID: {tg_id})\n"
        f"Заказ: {order.title}\n"
        f"Сумма: {order.amount} {order.currency}"
    )
    if payload.bot_name:
        owner_msg += f"\nБот: {payload.bot_name.strip()} (добавлен в базу панели)"
    notify_staff_telegram(db, owner_msg, include_panel_button=True)
    notify_customer_telegram(
        db,
        client.id,
        f"✅ Заказ {order.order_number} принят! Нажмите «Панель», чтобы отслеживать статус и управлять ботом.",
        include_panel_button=True,
    )

    return BotIntakeResponse(
        client_id=client.id,
        user_id=user.id,
        username=user.username,
        order_id=order.id,
        order_number=order.order_number,
        project_id=project_id,
        service_id=service_id,
        mini_app_url=settings.mini_app_url,
    )


@router.post("/api/v1/clients/{client_id}/sync-telegram", response_model=TelegramSyncResponse)
def sync_client_telegram(
    client_id: int,
    ctx: AccessContext = Depends(require_permission("clients:edit")),
    db: Session = Depends(get_db),
):
    client = db.get(Client, client_id)
    if client is None:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    tg_id = client.telegram_user_id
    if not tg_id:
        linked_user = db.scalar(
            select(User).where(User.customer_id == client.id, User.telegram_user_id.is_not(None)).limit(1)
        )
        if linked_user:
            tg_id = linked_user.telegram_user_id
            client.telegram_user_id = tg_id
    if not tg_id:
        raise HTTPException(status_code=422, detail="У клиента не указан Telegram ID")

    chat = _fetch_telegram_chat(tg_id)
    tg_user = _normalize_tg_username(chat.get("username"))
    full_name = " ".join(p for p in [chat.get("first_name"), chat.get("last_name")] if p).strip() or None

    if tg_user:
        client.telegram_username = tg_user
    if full_name:
        client.contact_person = full_name
    contact_parts = [p for p in [tg_user, f"TG ID: {tg_id}"] if p]
    if contact_parts:
        client.contacts = " · ".join(contact_parts)

    db.add(
        ActivityEvent(
            actor=ctx.actor,
            entity_type="client",
            entity_id=client.id,
            action="telegram_synced",
            summary=f"Обновлены Telegram-данные клиента #{client.id}: {tg_user or tg_id}",
        )
    )
    db.commit()
    return TelegramSyncResponse(
        telegram_user_id=tg_id,
        telegram_username=tg_user,
        full_name=full_name,
        updated=True,
    )


@router.post("/api/v1/admin/users/{user_id}/sync-telegram", response_model=TelegramSyncResponse)
def sync_user_telegram(
    user_id: int,
    ctx: AccessContext = Depends(require_permission("admin:users:edit")),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if not user.telegram_user_id:
        raise HTTPException(status_code=422, detail="К аккаунту не привязан Telegram ID")

    chat = _fetch_telegram_chat(user.telegram_user_id)
    tg_user = _normalize_tg_username(chat.get("username"))
    full_name = " ".join(p for p in [chat.get("first_name"), chat.get("last_name")] if p).strip() or None

    if user.customer_id:
        client = db.get(Client, user.customer_id)
        if client is not None:
            client.telegram_user_id = user.telegram_user_id
            if tg_user:
                client.telegram_username = tg_user
            if full_name:
                client.contact_person = full_name
            client.contacts = " · ".join(p for p in [tg_user, f"TG ID: {user.telegram_user_id}"] if p)

    db.add(
        ActivityEvent(
            actor=ctx.actor,
            entity_type="user",
            entity_id=user.id,
            action="telegram_synced",
            summary=f"Обновлены Telegram-данные аккаунта {user.username}: {tg_user or user.telegram_user_id}",
        )
    )
    db.commit()
    return TelegramSyncResponse(
        telegram_user_id=user.telegram_user_id,
        telegram_username=tg_user,
        full_name=full_name,
        updated=True,
    )


@router.post("/api/v1/integrations/bot/register-user")
def bot_register_user(
    payload: BotUserRegisterRequest,
    request: Request,
    x_botvex_secret: str | None = Header(None, alias="X-Botvex-Secret"),
    db: Session = Depends(get_db),
):
    """Registers or refreshes a Telegram user in the panel on /start before they even open the Mini App."""
    _check_bridge_rate_limit(request)
    _verify_bridge_secret(x_botvex_secret)
    tg_id = payload.telegram_user_id.strip()
    tg_user = _normalize_tg_username(payload.telegram_username)
    full_name = payload.full_name.strip()

    client = db.scalar(select(Client).where(Client.telegram_user_id == tg_id))
    contact_line = " · ".join(part for part in [tg_user, f"TG ID: {tg_id}"] if part)
    if client is None:
        client = Client(
            name=full_name,
            contact_person=full_name,
            contacts=contact_line[:500],
            telegram_user_id=tg_id,
            telegram_username=tg_user,
            status="lead",
            notes=f"Зашёл в @{settings.telegram_bot_username}",
        )
        db.add(client)
        db.flush()
    else:
        if full_name:
            client.contact_person = full_name
        if tg_user:
            client.telegram_username = tg_user
        if contact_line:
            client.contacts = contact_line[:500]

    user = db.scalar(select(User).where(User.telegram_user_id == tg_id))
    if user is None:
        client_role = db.scalar(select(Role).where(Role.slug == "client", Role.is_active.is_(True)))
        base_slug = (tg_user.lstrip("@").lower() if tg_user else f"tg_{tg_id}")[:60]
        candidate = base_slug
        suffix = 1
        while db.scalar(select(User.id).where(User.username == candidate)) is not None:
            suffix += 1
            candidate = f"{base_slug[:52]}_{suffix}"
        user = User(
            username=candidate,
            password_hash=hash_password(secrets.token_urlsafe(24)),
            is_active=True,
            is_owner=False,
            must_change_password=False,
            customer_id=client.id,
            telegram_user_id=tg_id,
            roles=[client_role] if client_role else [],
        )
        db.add(user)
    elif user.customer_id is None:
        user.customer_id = client.id

    db.commit()
    return {"ok": True, "client_id": client.id, "user_id": user.id, "username": user.username}


_BOT_TO_PANEL_STATUS = {
    "new": "brief",
    "in_progress": "in_progress",
    "waiting": "review",
    "done": "completed",
    "completed": "completed",
    "cancelled": "cancelled",
}


@router.post("/api/v1/integrations/bot/sync-order")
def bot_sync_order(
    payload: BotOrderSyncRequest,
    request: Request,
    x_botvex_secret: str | None = Header(None, alias="X-Botvex-Secret"),
    db: Session = Depends(get_db),
):
    """Two-way sync: updates latest matching client order when status or price is changed in @botvexdev_bot admin."""
    _check_bridge_rate_limit(request)
    _verify_bridge_secret(x_botvex_secret)
    tg_id = payload.telegram_user_id.strip()
    client = db.scalar(select(Client).where(Client.telegram_user_id == tg_id))
    if client is None:
        raise HTTPException(status_code=404, detail="Клиент с таким Telegram ID не найден")
    query = select(Order).where(Order.client_id == client.id, Order.is_archived.is_(False))
    if payload.order_title:
        query = query.where(Order.title == payload.order_title.strip())
    order = db.scalar(query.order_by(Order.id.desc()).limit(1))
    if order is None:
        order = db.scalar(
            select(Order).where(Order.client_id == client.id, Order.is_archived.is_(False)).order_by(Order.id.desc()).limit(1)
        )
    if order is None:
        raise HTTPException(status_code=404, detail="Активный заказ клиента не найден")
    if payload.amount is not None:
        order.amount = payload.amount
    if payload.status:
        mapped = _BOT_TO_PANEL_STATUS.get(payload.status.strip().lower(), payload.status.strip().lower())
        order.status = mapped
    db.add(
        ActivityEvent(
            actor=f"bot:{settings.telegram_bot_username}",
            entity_type="order",
            entity_id=order.id,
            action="bot_synced",
            summary=f"Синхронизация заказа {order.order_number} из бота (статус: {order.status}, сумма: {order.amount})",
        )
    )
    db.commit()
    return {"ok": True, "order_id": order.id, "order_number": order.order_number, "status": order.status}


@router.post("/api/v1/admin/backup-now")
def admin_backup_now(
    ctx: AccessContext = Depends(require_permission("settings:edit")),
    db: Session = Depends(get_db),
):
    """Creates hot SQLite + uploads ZIP backup and optionally sends it to ADMIN_TELEGRAM_CHAT_ID."""
    root = Path(__file__).resolve().parents[2]
    backups_dir = root / "backups"
    backups_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    zip_name = f"botvex_full_backup_{stamp}.zip"
    zip_path = backups_dir / zip_name

    db_url = settings.database_url
    db_file = Path(db_url.replace("sqlite:///", "")) if db_url.startswith("sqlite:///") else None
    if db_file and not db_file.is_absolute():
        db_file = (root / db_file).resolve()

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_db = Path(tmpdir) / "botvex.db"
        if db_file and db_file.is_file():
            src = sqlite3.connect(str(db_file))
            dst = sqlite3.connect(str(tmp_db))
            with dst:
                src.backup(dst)
            dst.close()
            src.close()
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            if tmp_db.is_file():
                zf.write(tmp_db, "botvex.db")
            uploads_dir = root / "uploads"
            if uploads_dir.is_dir():
                for p in uploads_dir.rglob("*"):
                    if p.is_file():
                        zf.write(p, Path("uploads") / p.relative_to(uploads_dir))

    tg_sent = False
    target_chat = settings.admin_telegram_chat_id or (ctx.user.telegram_user_id if ctx.user else None)
    if settings.telegram_bot_token and target_chat and zip_path.stat().st_size < 45 * 1024 * 1024:
        try:
            with zip_path.open("rb") as f:
                resp = httpx.post(
                    f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendDocument",
                    data={"chat_id": target_chat, "caption": f"💾 Резервная копия BOTVEX ({zip_name})"},
                    files={"document": (zip_name, f, "application/zip")},
                    timeout=20.0,
                )
            tg_sent = bool(resp.json().get("ok"))
        except Exception:
            tg_sent = False

    db.add(
        ActivityEvent(
            actor=ctx.actor,
            entity_type="system",
            entity_id=0,
            action="backup_created",
            summary=f"Создан полный бэкап {zip_name} (Telegram: {'да' if tg_sent else 'нет'})",
        )
    )
    db.commit()
    return {"file": zip_name, "size_bytes": zip_path.stat().st_size, "telegram_sent": tg_sent}
