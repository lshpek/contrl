"""Local Qwen AI assistant router tailored for GTX 1650 (4GB VRAM) + 8GB RAM."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .access_scopes import scope_query
from .auth import AccessContext, require_permission
from .config import settings
from .database import get_db
from .models import Order, OrderMessage, Project, Task
from .schemas import AiAssistRequest, AiAssistResponse, AiUnloadRequest

ai_router = APIRouter(prefix="/api/v1/ai", tags=["local ai"])
DEFAULT_QWEN_MODEL = "qwen2.5:1.5b"


def _ensure_staff(access: AccessContext) -> None:
    if access.user and any(r.slug == "client" and r.is_active for r in access.user.roles):
        raise HTTPException(status_code=403, detail="AI-ассистент доступен только операторам контура")


@ai_router.get("/status")
def ai_status(access: AccessContext = Depends(require_permission("dashboard:view"))):
    _ensure_staff(access)
    try:
        resp = httpx.get(f"{settings.ollama_base_url}/api/tags", timeout=1.5)
        if resp.status_code != 200:
            return {"available": False, "models": [], "default_model": DEFAULT_QWEN_MODEL}
        data = resp.json()
        models = [m.get("name") for m in data.get("models", []) if isinstance(m, dict) and m.get("name")]
        qwen_models = [m for m in models if "qwen" in m.lower()] or models
        default_m = next((m for m in qwen_models if "1.5b" in m.lower()), qwen_models[0] if qwen_models else DEFAULT_QWEN_MODEL)
        return {"available": True, "models": qwen_models, "default_model": default_m}
    except httpx.HTTPError:
        return {"available": False, "models": [], "default_model": DEFAULT_QWEN_MODEL}


@ai_router.post("/unload")
def ai_unload(payload: AiUnloadRequest, access: AccessContext = Depends(require_permission("dashboard:view"))):
    _ensure_staff(access)
    model = (payload.model or DEFAULT_QWEN_MODEL).strip()
    try:
        httpx.post(
            f"{settings.ollama_base_url}/api/generate",
            json={"model": model, "keep_alive": 0},
            timeout=2.0,
        )
    except httpx.HTTPError:
        pass
    return {"ok": True, "unloaded_model": model}


@ai_router.post("/assist", response_model=AiAssistResponse)
def ai_assist(
    payload: AiAssistRequest,
    access: AccessContext = Depends(require_permission("dashboard:view")),
    db: Session = Depends(get_db),
):
    _ensure_staff(access)
    model = (payload.model or DEFAULT_QWEN_MODEL).strip()
    system_prompt = (
        "Ты — строгий деловой ассистент оператора в BOTVEX Control Center. "
        "Отвечай кратко, структурированно и исключительно на русском языке в официальном стиле («Вы»). "
        "Не выдумывай факты, суммы или даты, которых нет в контексте."
    )

    if payload.task == "draft_order_reply":
        if not payload.order_id:
            raise HTTPException(status_code=422, detail="Не указан order_id")
        order = db.scalar(
            scope_query(select(Order).options(selectinload(Order.client)), Order, access, db).where(
                Order.id == payload.order_id, Order.is_archived.is_(False)
            )
        )
        if order is None:
            raise HTTPException(status_code=404, detail="Заказ не найден")
        msgs = db.scalars(
            select(OrderMessage)
            .where(OrderMessage.order_id == order.id, OrderMessage.is_internal.is_(False))
            .order_by(OrderMessage.created_at.desc())
            .limit(5)
        ).all()
        msg_lines = "\n".join(f"- {m.body[:250]}" for m in reversed(msgs)) or "Сообщений пока нет."
        user_prompt = (
            f"Подготовь вежливый и чёткий ответ клиенту ({order.client.name if order.client else 'Контрагент'}) "
            f"по заказу {order.order_number} «{order.title}» (статус: {order.status}).\n"
            f"Краткий объём: {order.scope[:500]}\n"
            f"Последние сообщения:\n{msg_lines}\n"
            f"Доп. указание оператора: {payload.prompt_hint or 'Стандартный деловой статус-апдейт.'}"
        )
    elif payload.task == "breakdown_tasks":
        title = "Новый проект"
        desc = payload.prompt_hint or ""
        if payload.project_id:
            proj = db.scalar(scope_query(select(Project), Project, access, db).where(Project.id == payload.project_id))
            if proj is None:
                raise HTTPException(status_code=404, detail="Проект не найден")
            title = proj.name
            desc = f"{proj.description or ''}\n{desc}".strip()
        user_prompt = (
            f"Разбей проект «{title}» на 4-6 конкретных технических задач для трекера. "
            f"Формат: нумерованный список «Название — краткий критерий готовности».\nОписание:\n{desc[:900]}"
        )
    else:
        open_tasks = db.scalars(
            scope_query(select(Task), Task, access, db)
            .where(Task.is_archived.is_(False), Task.status != "done")
            .order_by(Task.due_date.asc().nullslast())
            .limit(8)
        ).all()
        task_lines = "\n".join(f"- [{t.priority}/{t.status}] {t.title} (срок: {t.due_date or '—'})" for t in open_tasks) or "Открытых задач нет."
        user_prompt = f"Сформируй краткую диспетчерскую сводку (3 приоритета на смену) по активным задачам:\n{task_lines}"

    try:
        resp = httpx.post(
            f"{settings.ollama_base_url}/api/chat",
            json={
                "model": model,
                "stream": False,
                "keep_alive": "2m",
                "options": {"num_ctx": 2048, "temperature": 0.3},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            },
            timeout=30.0,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Ollama вернул статус {resp.status_code}")
        data = resp.json()
        reply = (data.get("message") or {}).get("content", "").strip()
        if not reply:
            raise HTTPException(status_code=502, detail="Локальная модель вернула пустой ответ")
        return {"model": model, "reply": reply}
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Локальный сервис Ollama (127.0.0.1:11434) недоступен") from exc
