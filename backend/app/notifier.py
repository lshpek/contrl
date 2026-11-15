"""Best-effort Telegram notifications via Bot API without blocking core transactions."""
from __future__ import annotations

import logging
import threading
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import User

logger = logging.getLogger("botvex.notifier")


def _panel_markup(order_id: int | None = None) -> dict | None:
    url = settings.mini_app_url
    if url and url.startswith("https://"):
        if order_id is not None:
            sep = "&" if "?" in url else "?"
            target = f"{url}{sep}startapp=order_{order_id}"
            label = "📱 Открыть заказ"
        else:
            target = url
            label = "📱 Панель"
        return {"inline_keyboard": [[{"text": label, "web_app": {"url": target}}]]}
    return None


def _send_telegram_sync(chat_id: str, text: str, reply_markup: dict | None = None) -> None:
    token = settings.telegram_bot_token
    if not token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload: dict = {"chat_id": chat_id, "text": text[:3900], "disable_web_page_preview": True}
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    try:
        httpx.post(url, json=payload, timeout=4.0)
    except Exception as exc:
        logger.debug("Telegram notification skipped: %s", exc)


def notify_telegram_users(chat_ids: list[str], text: str, include_panel_button: bool = False, order_id: int | None = None) -> None:
    if not settings.telegram_bot_token:
        return
    unique_ids = [cid for cid in dict.fromkeys(chat_ids) if cid]
    if not unique_ids:
        return
    markup = _panel_markup(order_id) if include_panel_button else None

    def _worker():
        for cid in unique_ids:
            _send_telegram_sync(cid, text, markup)

    threading.Thread(target=_worker, daemon=True).start()


def notify_staff_telegram(db: Session, text: str, include_panel_button: bool = True) -> None:
    if not settings.telegram_bot_token:
        return
    rows = db.scalars(
        select(User.telegram_user_id).where(
            User.is_active.is_(True),
            User.is_owner.is_(True),
            User.telegram_user_id.is_not(None),
        )
    ).all()
    targets = [r for r in rows if r]
    if settings.admin_telegram_chat_id:
        targets.append(settings.admin_telegram_chat_id)
    notify_telegram_users(targets, text, include_panel_button=include_panel_button)


def notify_customer_telegram(db: Session, customer_id: int, text: str, include_panel_button: bool = True, order_id: int | None = None) -> None:
    if not settings.telegram_bot_token:
        return
    rows = db.scalars(
        select(User.telegram_user_id).where(
            User.is_active.is_(True),
            User.customer_id == customer_id,
            User.telegram_user_id.is_not(None),
        )
    ).all()
    notify_telegram_users([r for r in rows if r], text, include_panel_button=include_panel_button, order_id=order_id)
