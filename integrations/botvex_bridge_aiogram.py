"""Готовый коннектор для основного бота @botvexdev_bot (aiogram 3.x).

Отправляет новый заказ / бота в BOTVEX Control Center и возвращает inline-кнопку «Панель».
"""
from __future__ import annotations

import os
import aiohttp
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

PANEL_API_URL = os.getenv("BOTVEX_PANEL_API_URL", "http://127.0.0.1:8000").rstrip("/")
PANEL_SECRET = os.getenv("BOTVEX_INTAKE_SECRET") or os.getenv("BOTVEX_CONTROL_SECRET", "")
MINI_APP_URL = os.getenv("MINI_APP_URL", "").rstrip("/")


def build_panel_keyboard(mini_app_url: str | None = None) -> InlineKeyboardMarkup | None:
    url = (mini_app_url or MINI_APP_URL).strip()
    if not url.startswith("https://"):
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📱 Панель", web_app=WebAppInfo(url=url))]
        ]
    )


async def register_order_in_panel(
    *,
    telegram_user_id: int | str,
    telegram_username: str | None,
    full_name: str,
    order_title: str,
    order_scope: str,
    amount: float = 0.0,
    currency: str = "RUB",
    contacts: str | None = None,
    bot_name: str | None = None,
    service_url: str | None = None,
) -> dict:
    """Регистрирует клиента в базе мини-аппа, создаёт заказ/бота и шлёт уведомление владельцу."""
    payload = {
        "telegram_user_id": str(telegram_user_id),
        "telegram_username": telegram_username,
        "full_name": full_name or f"User {telegram_user_id}",
        "contacts": contacts,
        "order_title": order_title,
        "order_scope": order_scope,
        "amount": amount,
        "currency": currency,
        "bot_name": bot_name,
        "service_url": service_url,
    }
    headers = {"X-Botvex-Secret": PANEL_SECRET} if PANEL_SECRET else {}
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{PANEL_API_URL}/api/v1/integrations/bot/intake",
            json=payload,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=8),
        ) as resp:
            resp.raise_for_status()
            return await resp.json()
