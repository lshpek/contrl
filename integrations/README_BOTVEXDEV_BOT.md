# Подключение основного бота @botvexdev_bot к BOTVEX Control Center

1. В `.env` мини-аппа (`BOTVEX_Control_Center/.env`) заполни:
   - `TELEGRAM_BOT_TOKEN=<токен @botvexdev_bot>`
   - `TELEGRAM_BOT_USERNAME=botvexdev_bot`
   - `ADMIN_TELEGRAM_CHAT_ID=<твой Telegram ID, чтобы получать уведомления о заказах>`
   - `MINI_APP_URL=https://<твой-домен-или-trycloudflare.com>`
   - `BOTVEX_CONTROL_SECRET=<любой длинный секрет>`

2. Скопируй `integrations/botvex_bridge_aiogram.py` в папку своего бота `@botvexdev_bot`.
   В `.env` бота добавь `BOTVEX_PANEL_API_URL`, `BOTVEX_CONTROL_SECRET` и `MINI_APP_URL`.

3. В обработчике оформления заказа в `@botvexdev_bot` вызови:
```python
from botvex_bridge_aiogram import register_order_in_panel, build_panel_keyboard

res = await register_order_in_panel(
    telegram_user_id=message.from_user.id,
    telegram_username=message.from_user.username,
    full_name=message.from_user.full_name,
    order_title="Разработка Telegram-бота",
    order_scope=order_text,
    amount=15000,
    bot_name="Мой новый бот",  # если создаётся новый бот — сразу добавится в базу панели
)
kb = build_panel_keyboard(res.get("mini_app_url"))
await message.answer(
    f"Заказ {res['order_number']} оформлен! Вы зарегистрированы в панели.",
    reply_markup=kb,
)
```
