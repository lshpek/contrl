import { useEffect, useState } from 'react';
import { DownloadCloud } from 'lucide-react';
import { api } from './api';

type BotBridgeStatus = {
  bot_username: string;
  bot_token_configured: boolean;
  admin_chat_configured: boolean;
  mini_app_url: string;
  bridge_secret_configured: boolean;
};

export default function SettingsPage({
  notify,
  statusLabel,
}: {
  notify: (message: string, error?: boolean) => void;
  statusLabel: (value: string) => string;
}) {
  const [settings, setSettings] = useState<Record<string, string>>({
    display_name: 'BOTVEX Control Center',
    timezone: 'Europe/Moscow',
  });
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [botStatus, setBotStatus] = useState<BotBridgeStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Array<{ key: string; value: string }>>('/api/v1/settings'),
      api.get<Record<string, unknown>>('/health'),
      api.get<BotBridgeStatus>('/api/v1/integrations/bot/status').catch(() => null),
    ])
      .then(([rows, h, bs]) => {
        const values: Record<string, string> = {};
        rows.forEach((r) => (values[r.key] = r.value));
        setSettings((p) => ({ ...p, ...values }));
        setHealth(h);
        if (bs) setBotStatus(bs);
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/api/v1/settings', settings);
      notify('Настройки сохранены');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Ошибка сохранения', true);
    } finally {
      setSaving(false);
    }
  };

  const runBackup = async () => {
    setBackingUp(true);
    try {
      const res = await api.post<{ file: string; size_bytes: number; telegram_sent: boolean }>(
        '/api/v1/admin/backup-now',
        {},
      );
      const kb = Math.max(1, Math.round(res.size_bytes / 1024));
      notify(
        res.telegram_sent
          ? `Бэкап ${res.file} (${kb} КБ) отправлен в Telegram`
          : `Бэкап сохранён локально: ${res.file} (${kb} КБ)`,
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Не удалось создать бэкап', true);
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <h2 style={{ marginTop: 0 }}>Основные параметры</h2>
        <label className="form-field">
          <span>Название</span>
          <input
            value={settings.display_name ?? ''}
            onChange={(e) => setSettings((p) => ({ ...p, display_name: e.target.value }))}
          />
        </label>
        <label className="form-field">
          <span>Часовой пояс</span>
          <input
            value={settings.timezone ?? ''}
            onChange={(e) => setSettings((p) => ({ ...p, timezone: e.target.value }))}
          />
        </label>
        <button className="primary-button" disabled={saving} onClick={() => void save()}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </section>

      {botStatus && (
        <section className="panel settings-panel">
          <h2 style={{ marginTop: 0 }}>Связка с {botStatus.bot_username}</h2>
          <div className="system-list">
            <div className="system-row">
              <span>TELEGRAM_BOT_TOKEN</span>
              <strong>{botStatus.bot_token_configured ? 'Настроен' : 'Не задан'}</strong>
            </div>
            <div className="system-row">
              <span>ADMIN_TELEGRAM_CHAT_ID</span>
              <strong>{botStatus.admin_chat_configured ? 'Настроен' : 'Не задан'}</strong>
            </div>
            <div className="system-row">
              <span>Секрет интеграции</span>
              <strong>{botStatus.bridge_secret_configured ? 'Защищён' : 'Не задан'}</strong>
            </div>
            <div className="system-row">
              <span>MINI_APP_URL</span>
              <strong>{botStatus.mini_app_url || 'Не указан'}</strong>
            </div>
          </div>
        </section>
      )}

      <section className="panel settings-panel">
        <h2 style={{ marginTop: 0 }}>Состояние и резервные копии</h2>
        <div className="system-list" style={{ marginBottom: 14 }}>
          <div className="system-row">
            <span>API</span>
            <strong>{health?.status === 'ok' ? statusLabel('healthy') : 'Проверка…'}</strong>
          </div>
          <div className="system-row">
            <span>SQLite WAL</span>
            <strong>{health?.database === 'ok' ? statusLabel('healthy') : 'Ошибка'}</strong>
          </div>
          <div className="system-row">
            <span>Режим</span>
            <strong>{health?.auth_mode === 'account_session' ? 'Сессии + Telegram' : 'Сессии (Argon2id)'}</strong>
          </div>
        </div>
        <button className="secondary-button" disabled={backingUp} onClick={() => void runBackup()}>
          <DownloadCloud size={15} />
          {backingUp ? 'Создание бэкапа…' : 'Бэкап БД + файлов в Telegram'}
        </button>
      </section>
    </div>
  );
}
