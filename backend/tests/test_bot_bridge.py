from __future__ import annotations

from app.config import settings


def test_bot_intake_creates_client_user_order_and_bot(client, owner_headers):
    prev_secret = settings.botvex_intake_secret
    settings.botvex_intake_secret = "test_bridge_secret_123"
    try:
        denied = client.post(
            "/api/v1/integrations/bot/intake",
            json={
                "telegram_user_id": "999888777",
                "telegram_username": "ivan_dev",
                "full_name": "Иван Тестовый",
                "order_title": "Бот магазина",
                "order_scope": "Каталог и оплата",
                "amount": "15000.00",
                "bot_name": "ShopBot",
            },
            headers={"X-Botvex-Secret": "wrong"},
        )
        assert denied.status_code == 403

        resp = client.post(
            "/api/v1/integrations/bot/intake",
            json={
                "telegram_user_id": "999888777",
                "telegram_username": "ivan_dev",
                "full_name": "Иван Тестовый",
                "order_title": "Бот магазина",
                "order_scope": "Каталог и оплата",
                "amount": "15000.00",
                "bot_name": "ShopBot",
            },
            headers={"X-Botvex-Secret": "test_bridge_secret_123"},
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["client_id"] > 0
        assert data["order_id"] > 0
        assert data["project_id"] > 0
        assert data["service_id"] > 0

        status_resp = client.get("/api/v1/integrations/bot/status", headers=owner_headers)
        assert status_resp.status_code == 200
        assert status_resp.json()["bridge_secret_configured"] is True
    finally:
        settings.botvex_intake_secret = prev_secret


def test_multiple_clients_with_empty_telegram_id_allowed(client, owner_headers):
    r1 = client.post(
        "/api/v1/clients",
        json={"name": "Клиент Один", "telegram_user_id": "", "telegram_username": ""},
        headers=owner_headers,
    )
    r2 = client.post(
        "/api/v1/clients",
        json={"name": "Клиент Два", "telegram_user_id": "", "telegram_username": ""},
        headers=owner_headers,
    )
    assert r1.status_code == 201, r1.text
    assert r2.status_code == 201, r2.text
    assert r1.json()["telegram_user_id"] is None
    assert r2.json()["telegram_user_id"] is None


def test_bot_register_user_and_sync_order(client, owner_headers):
    prev_secret = settings.botvex_intake_secret
    settings.botvex_intake_secret = "sync_secret_456"
    try:
        reg = client.post(
            "/api/v1/integrations/bot/register-user",
            json={
                "telegram_user_id": "555444333",
                "telegram_username": "alex_client",
                "full_name": "Алексей",
            },
            headers={"X-Botvex-Secret": "sync_secret_456"},
        )
        assert reg.status_code == 200, reg.text
        assert reg.json()["ok"] is True

        intake = client.post(
            "/api/v1/integrations/bot/intake",
            json={
                "telegram_user_id": "555444333",
                "telegram_username": "alex_client",
                "full_name": "Алексей",
                "order_title": "AI-консультант",
                "order_scope": "Ответы по базе знаний",
                "amount": "0",
                "budget_label": "Нужна оценка",
            },
            headers={"X-Botvex-Secret": "sync_secret_456"},
        )
        assert intake.status_code == 201, intake.text

        sync = client.post(
            "/api/v1/integrations/bot/sync-order",
            json={
                "telegram_user_id": "555444333",
                "status": "in_progress",
                "amount": "12000.00",
            },
            headers={"X-Botvex-Secret": "sync_secret_456"},
        )
        assert sync.status_code == 200, sync.text
        assert sync.json()["status"] == "in_progress"

        bkp = client.post("/api/v1/admin/backup-now", headers=owner_headers)
        assert bkp.status_code == 200, bkp.text
        assert bkp.json()["size_bytes"] > 0
    finally:
        settings.botvex_intake_secret = prev_secret
