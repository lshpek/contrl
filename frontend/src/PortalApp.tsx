import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  FileDiff,
  FileText,
  LogOut,
  MessageCircle,
  Paperclip,
  Power,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { api } from './api';
import { getTelegramStartParam } from './telegram';
import { RoleAvatar } from './RoleAvatar';
import ConfirmModal, { type ConfirmDialogState } from './ConfirmModal';
import { formatDate, formatDateTime } from './formatting';
import type {
  AuthUser,
  ClientOrderMessage,
  OrderAttachment,
  OrderChangeRequest,
  OrderEvent,
  OrderPortalRecord,
  PortalPaymentSummary,
  PortalService,
  PortalServiceLog,
} from './types';

type Props = {
  user: AuthUser;
  onLogout: () => void;
};

type PortalIdentity = {
  id: number;
  username: string;
  customer_id: number;
  customer_name: string;
};

type ListResult = {
  items: OrderPortalRecord[];
  total: number;
  limit: number;
  offset: number;
};

type PortalMessage = {
  id: number;
  author_username: string | null;
  body: string;
  created_at: string;
};

const statusLabels: Record<string, string> = {
  awaiting_proposal_approval: 'Ожидает согласования КП',
  awaiting_customer_information: 'Нужны данные от вас',
  approved: 'Условия согласованы',
  in_progress: 'В разработке',
  internal_review: 'Внутренняя проверка',
  awaiting_customer_review: 'Ожидает вашей проверки',
  changes_requested: 'Запрошены доработки',
  ready_for_delivery: 'Готов к передаче',
  delivered: 'Передан на приёмку',
  completed: 'Выполнен и закрыт',
  on_hold: 'Приостановлен',
  cancelled: 'Отменён',
  draft: 'Черновик',
};

function orderStepIndex(status: string): number {
  if (['awaiting_proposal_approval', 'awaiting_customer_information'].includes(status)) return 0;
  if (['approved', 'in_progress', 'internal_review'].includes(status)) return 1;
  if (['awaiting_customer_review', 'changes_requested', 'ready_for_delivery'].includes(status)) return 2;
  if (['delivered', 'completed'].includes(status)) return 3;
  return 0;
}

export default function PortalApp({ user, onLogout }: Props) {
  const [tab, setTab] = useState<'bots' | 'orders'>('bots');
  const [confirmLogout, setConfirmLogout] = useState<ConfirmDialogState | null>(null);
  const [identity, setIdentity] = useState<PortalIdentity | null>(null);
  const [services, setServices] = useState<PortalService[]>([]);
  const [serviceLogs, setServiceLogs] = useState<Record<number, PortalServiceLog[]>>({});
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [orders, setOrders] = useState<OrderPortalRecord[]>([]);
  const [selected, setSelected] = useState<OrderPortalRecord | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [changeRequests, setChangeRequests] = useState<OrderChangeRequest[]>([]);
  const [payments, setPayments] = useState<PortalPaymentSummary | null>(null);
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);

  const [draft, setDraft] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [busy, setBusy] = useState(true);
  const [sending, setSending] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);

  const loadAll = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [me, svcs, ords] = await Promise.all([
        api.get<PortalIdentity>('/api/v1/portal/me'),
        api.get<PortalService[]>('/api/v1/portal/services').catch(() => [] as PortalService[]),
        api.get<ListResult>('/api/v1/portal/orders?limit=50&offset=0'),
      ]);
      setIdentity(me);
      setServices(svcs);
      setOrders(ords.items);
      if (svcs.length === 0 && ords.items.length > 0) {
        setTab((prev) => (prev === 'bots' ? 'orders' : prev));
      }
      setSelected((current) =>
        current ? ords.items.find((item) => item.id === current.id) ?? null : null,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить данные кабинета.');
    } finally {
      setBusy(false);
    }
  }, []);

  const loadDetails = useCallback(async (order: OrderPortalRecord) => {
    setSelected(order);
    setError('');
    try {
      const [detail, history, chat, crs, pay, atts] = await Promise.all([
        api.get<OrderPortalRecord>(`/api/v1/portal/orders/${order.id}`),
        api.get<OrderEvent[]>(`/api/v1/portal/orders/${order.id}/events`),
        api.get<PortalMessage[]>(`/api/v1/portal/orders/${order.id}/messages`),
        api.get<OrderChangeRequest[]>(`/api/v1/portal/orders/${order.id}/change-requests`).catch(() => []),
        api.get<PortalPaymentSummary>(`/api/v1/portal/orders/${order.id}/payments`).catch(() => null),
        api.get<OrderAttachment[]>(`/api/v1/portal/orders/${order.id}/attachments`).catch(() => []),
      ]);
      setSelected(detail);
      setEvents(history);
      setMessages(chat);
      setChangeRequests(crs);
      setPayments(pay);
      setAttachments(atts);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить детали заказа.');
    }
  }, []);

  useEffect(() => {
    const startParam = getTelegramStartParam();
    if (startParam.startsWith('order_')) {
      setTab('orders');
    }
  }, []);

  useEffect(() => {
    const startParam = getTelegramStartParam();
    if (startParam.startsWith('order_') && orders.length > 0 && !selected) {
      const targetId = Number(startParam.replace('order_', ''));
      const found = orders.find((o) => o.id === targetId);
      if (found) {
        setTab('orders');
        setSelected(found);
      }
    }
  }, [orders, selected]);

  useEffect(() => {
    void loadAll();
  }, [loadAll, refreshCount]);

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/v1/events/stream', { withCredentials: true });
      es.addEventListener('update', () => {
        if (document.visibilityState === 'visible') setRefreshCount((n) => n + 1);
      });
    } catch {
      // Fallback to interval below
    }
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setRefreshCount((n) => n + 1);
    }, 30000);
    return () => {
      if (es) es.close();
      window.clearInterval(id);
    };
  }, []);

  async function toggleBot(svc: PortalService, action: 'start' | 'stop' | 'restart') {
    setTogglingId(svc.id);
    setError('');
    try {
      const updated = await api.post<PortalService>(`/api/v1/portal/services/${svc.id}/toggle`, { action });
      setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      const logs = await api.get<PortalServiceLog[]>(`/api/v1/portal/services/${svc.id}/logs`).catch(() => []);
      setServiceLogs((prev) => ({ ...prev, [svc.id]: logs }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось выполнить команду управления ботом.');
    } finally {
      setTogglingId(null);
    }
  }

  async function loadBotLogs(serviceId: number) {
    try {
      const logs = await api.get<PortalServiceLog[]>(`/api/v1/portal/services/${serviceId}/logs`);
      setServiceLogs((prev) => ({ ...prev, [serviceId]: logs }));
    } catch {
      // ignore
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !draft.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.post<ClientOrderMessage>(`/api/v1/portal/orders/${selected.id}/messages`, {
        body: draft.trim(),
      });
      setDraft('');
      setMessages(await api.get<PortalMessage[]>(`/api/v1/portal/orders/${selected.id}/messages`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отправить сообщение.');
    } finally {
      setSending(false);
    }
  }

  async function uploadFile(file: File | undefined) {
    if (!selected || !file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.upload<OrderAttachment>(`/api/v1/portal/orders/${selected.id}/attachments`, fd);
      setAttachments(await api.get<OrderAttachment[]>(`/api/v1/portal/orders/${selected.id}/attachments`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить файл.');
    } finally {
      setUploading(false);
    }
  }

  async function submitDecision(action: 'approve_proposal' | 'request_info' | 'accept_delivery' | 'request_changes') {
    if (!selected) return;
    if (action === 'request_changes' && !decisionNote.trim()) {
      setError('Укажите замечания перед запросом доработок.');
      return;
    }
    setDeciding(true);
    setError('');
    try {
      const updated = await api.post<OrderPortalRecord>(`/api/v1/portal/orders/${selected.id}/decision`, {
        action,
        comment: decisionNote.trim() || null,
      });
      setDecisionNote('');
      await loadDetails(updated);
      setRefreshCount((n) => n + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить решение.');
    } finally {
      setDeciding(false);
    }
  }

  async function decideChangeRequest(crId: number, status: 'approved' | 'rejected') {
    if (!selected) return;
    setDeciding(true);
    try {
      await api.post(`/api/v1/portal/orders/${selected.id}/change-requests/${crId}/decision`, {
        status,
        decision_note: status === 'approved' ? 'Согласовано в портале' : 'Отклонено',
      });
      await loadDetails(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось обработать запрос.');
    } finally {
      setDeciding(false);
    }
  }

  const actionableStage =
    selected && ['awaiting_proposal_approval', 'awaiting_customer_review', 'delivered'].includes(selected.status);

  const paidPct =
    payments && selected?.amount && Number(selected.amount) > 0
      ? Math.min(100, Math.round((Number(payments.paid_amount) / Number(selected.amount)) * 100))
      : 0;

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div className="auth-brand">
          <RoleAvatar kind="brand" label="BOTVEX" size={38} />
          <div>
            <strong>BOTVEX</strong>
            <small>{identity?.customer_name ?? user.username}</small>
          </div>
        </div>
        <div className="portal-user">
          <button className="secondary-button" onClick={() => setRefreshCount((n) => n + 1)}>
            <RefreshCw size={14} /> Обновить
          </button>
          <button className="secondary-button" onClick={() => setConfirmLogout({
            title: "Выйти из панели?",
            message: "Вы точно хотите завершить текущий сеанс?",
            confirmLabel: "Да, выйти",
            danger: true,
            onConfirm: () => { setConfirmLogout(null); onLogout(); },
          })}>
            <LogOut size={14} /> Выйти
          </button>
        </div>
      </header>

      <main className="portal-main">
        <section className="portal-hero">
          <div className="portal-hero-copy">
            <h2>Личный кабинет BOTVEX</h2>
            <p>Заявки из @botvexdev_bot, этапы разработки, согласования и управление ботами</p>
          </div>
          <RoleAvatar kind="client" label={identity?.customer_name ?? user.username} size={52} />
        </section>
        {error && (
          <div className="auth-alert" role="alert">
            {error}
          </div>
        )}

        {!selected && (
          <div className="portal-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'bots'}
              className={tab === 'bots' ? 'access-tab access-tab-active' : 'access-tab'}
              onClick={() => setTab('bots')}
            >
              <Bot size={16} /> Мои боты и сервисы ({services.length})
            </button>
            <button
              role="tab"
              aria-selected={tab === 'orders'}
              className={tab === 'orders' ? 'access-tab access-tab-active' : 'access-tab'}
              onClick={() => setTab('orders')}
            >
              <FileText size={16} /> Мои заказы ({orders.length})
            </button>
          </div>
        )}

        {busy ? (
          <div className="auth-loading">Загрузка кабинета…</div>
        ) : tab === 'bots' && !selected ? (
          services.length ? (
            <div className="bot-grid">
              {services.map((svc) => {
                const logs = serviceLogs[svc.id] || [];
                const active = svc.is_enabled && svc.status !== 'down';
                return (
                  <article className="bot-card" key={svc.id}>
                    <div className="bot-card-head">
                      <div className="bot-card-title">
                        <span className={`bot-pulse ${active ? 'bot-pulse-on' : 'bot-pulse-off'}`} />
                        <div>
                          <strong style={{ fontSize: 16 }}>{svc.name}</strong>
                          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                            {svc.type === 'bot' ? 'Telegram-бот' : svc.type.toUpperCase()}
                            {svc.version ? ` · v${svc.version}` : ''}
                            {svc.environment ? ` · ${svc.environment}` : ''}
                          </div>
                        </div>
                      </div>
                      <span className={`badge ${active ? 'badge-green' : 'badge-slate'}`}>
                        {active ? 'Работает' : 'Остановлен'}
                      </span>
                    </div>

                    <div className="bot-card-actions">
                      <button
                        className={svc.is_enabled ? 'danger-button' : 'primary-button'}
                        disabled={togglingId === svc.id}
                        onClick={() => void toggleBot(svc, svc.is_enabled ? 'stop' : 'start')}
                      >
                        <Power size={15} />
                        {togglingId === svc.id
                          ? 'Выполнение…'
                          : svc.is_enabled
                            ? 'Выключить бота'
                            : 'Включить бота'}
                      </button>
                      <button
                        className="secondary-button"
                        disabled={togglingId === svc.id}
                        onClick={() => void toggleBot(svc, 'restart')}
                      >
                        <RotateCw size={15} /> Перезапустить
                      </button>
                      <button className="secondary-button" onClick={() => void loadBotLogs(svc.id)}>
                        Логи
                      </button>
                    </div>

                    {logs.length > 0 && (
                      <div className="bot-logs">
                        {logs.slice(0, 4).map((l) => (
                          <div className="bot-log-line" key={l.id}>
                            <span>{l.message}</span>
                            <time className="mono">{formatDateTime(l.created_at)}</time>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="portal-panel empty-state">
              <Bot size={28} />
              <h3>Боты ещё не привязаны</h3>
              <p>Когда команда подключит ваш бот к проекту, здесь появится пульт включения и остановки.</p>
            </div>
          )
        ) : selected ? (
          <>
            <button
              className="portal-back"
              onClick={() => {
                setSelected(null);
                setEvents([]);
                setMessages([]);
                setError('');
              }}
            >
              <ArrowLeft size={16} /> Ко всем заказам
            </button>

            <div className="order-detail-heading" style={{ marginBottom: 18 }}>
              <div>
                <p className="eyebrow mono">ЗАКАЗ {selected.order_number}</p>
                <h2>{selected.title}</h2>
                <span className={`order-status order-status-${selected.status}`}>
                  {statusLabels[selected.status] ?? selected.status}
                </span>
              </div>
              <button className="secondary-button" onClick={() => void loadDetails(selected)}>
                <RefreshCw size={14} /> Обновить
              </button>
            </div>

            <div className="stepper">
              {['Согласование', 'Разработка', 'Проверка', 'Сдача'].map((label, idx) => {
                const cur = orderStepIndex(selected.status);
                return (
                  <div
                    key={label}
                    className={`step-item ${idx < cur ? 'step-done' : idx === cur ? 'step-active' : ''}`}
                  >
                    {idx + 1}. {label}
                  </div>
                );
              })}
            </div>

            {actionableStage && (
              <section className="portal-panel" style={{ marginBottom: 16 }}>
                <div className="panel-heading" style={{ padding: '0 0 12px' }}>
                  <div>
                    <h2>Требуется ваше решение</h2>
                    <p>Подтвердите этап или отправьте замечания по результату.</p>
                  </div>
                  <CheckCircle2 size={20} />
                </div>
                <label className="form-field" style={{ marginTop: 12 }}>
                  <span>Комментарий к решению</span>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder="При запросе доработок укажите список замечаний…"
                  />
                </label>
                <div className="access-user-actions">
                  {selected.status === 'awaiting_proposal_approval' ? (
                    <>
                      <button
                        className="primary-button"
                        disabled={deciding}
                        onClick={() => void submitDecision('approve_proposal')}
                      >
                        Согласовать предложение
                      </button>
                      <button
                        className="secondary-button"
                        disabled={deciding}
                        onClick={() => void submitDecision('request_info')}
                      >
                        Запросить уточнение
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="primary-button"
                        disabled={deciding}
                        onClick={() => void submitDecision('accept_delivery')}
                      >
                        Принять работу
                      </button>
                      <button
                        className="secondary-button"
                        disabled={deciding}
                        onClick={() => void submitDecision('request_changes')}
                      >
                        Запросить доработки
                      </button>
                    </>
                  )}
                </div>
              </section>
            )}

            <div className="portal-detail-grid" style={{ marginBottom: 16 }}>
              <section className="portal-panel">
                <h2 style={{ marginTop: 0 }}>Параметры и оплаты</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13.5 }}>
                  {selected.client_visible_summary || 'Описание проекта уточняется.'}
                </p>
                <div className="portal-data-row">
                  <span>
                    <CalendarDays size={15} /> Целевой срок
                  </span>
                  <strong className="mono">{formatDate(selected.target_delivery_date)}</strong>
                </div>
                <div className="portal-data-row">
                  <span>
                    <CircleDollarSign size={15} /> Стоимость
                  </span>
                  <strong className="mono">
                    {selected.amount ? `${selected.amount} ${selected.currency}` : 'Уточняется'}
                  </strong>
                </div>
                {payments && (
                  <>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${paidPct}%` }} />
                    </div>
                    <div className="portal-data-row" style={{ borderTop: 0, paddingTop: 4 }}>
                      <span>Оплачено ({paidPct}%)</span>
                      <strong className="mono">
                        {payments.paid_amount} / остаток {payments.balance_due} {payments.currency}
                      </strong>
                    </div>
                  </>
                )}
              </section>

              <section className="portal-panel">
                <h2 style={{ marginTop: 0 }}>История этапов</h2>
                {events.length ? (
                  <ol className="portal-timeline">
                    {events.map((ev) => (
                      <li key={ev.id}>
                        <i />
                        <div>
                          <strong>{ev.to_status ? statusLabels[ev.to_status] ?? ev.to_status : 'Событие'}</strong>
                          {ev.message && <p>{ev.message}</p>}
                          <time>{formatDateTime(ev.created_at)}</time>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="field-hint">События появятся по мере выполнения заказа.</p>
                )}
              </section>
            </div>

            {changeRequests.length > 0 && (
              <section className="portal-panel" style={{ marginBottom: 16 }}>
                <div className="panel-heading" style={{ padding: '0 0 12px' }}>
                  <div>
                    <h2>Запросы на изменение (CR)</h2>
                    <p>Дополнительные работы и корректировки сроков</p>
                  </div>
                  <FileDiff size={18} />
                </div>
                <div className="portal-chat-list">
                  {changeRequests.map((cr) => (
                    <article className="portal-chat-message" key={cr.id}>
                      <div>
                        <strong>
                          #{cr.id} · {cr.title}
                        </strong>
                        <span>{cr.status === 'approved' ? 'Согласован' : cr.status === 'rejected' ? 'Отклонён' : 'Ожидает решения'}</span>
                      </div>
                      <p>
                        {cr.scope_delta}
                        {cr.amount_delta ? ` · Доплата: ${cr.amount_delta} ${selected.currency}` : ''}
                      </p>
                      {cr.status === 'pending' && (
                        <div className="access-user-actions" style={{ marginTop: 10 }}>
                          <button className="primary-button compact" disabled={deciding} onClick={() => void decideChangeRequest(cr.id, 'approved')}>
                            Согласовать
                          </button>
                          <button className="secondary-button" disabled={deciding} onClick={() => void decideChangeRequest(cr.id, 'rejected')}>
                            Отклонить
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="portal-panel" style={{ marginBottom: 16 }}>
              <div className="panel-heading" style={{ padding: '0 0 12px' }}>
                <div>
                  <h2>Файлы и документы</h2>
                  <p>ТЗ, макеты, счета и материалы до 10 МБ</p>
                </div>
                <label className="secondary-button" style={{ cursor: 'pointer' }}>
                  <Upload size={14} /> {uploading ? 'Загрузка…' : 'Прикрепить файл'}
                  <input
                    type="file"
                    hidden
                    disabled={uploading}
                    onChange={(e) => void uploadFile(e.target.files?.[0])}
                  />
                </label>
              </div>
              {attachments.length ? (
                <div className="activity-list" style={{ padding: 0 }}>
                  {attachments.map((att) => (
                    <div className="activity-row" key={att.id}>
                      <Paperclip size={15} />
                      <div className="row-info">
                        <strong>{att.original_filename}</strong>
                        <small className="mono">{Math.ceil(att.size_bytes / 1024)} КБ · {att.uploaded_by_username || 'Система'}</small>
                      </div>
                      <a
                        className="secondary-button"
                        href={`/api/v1/portal/orders/${selected.id}/attachments/${att.id}/download`}
                      >
                        Скачать
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="field-hint" style={{ marginTop: 10 }}>Файлы не прикреплены.</p>
              )}
            </section>

            <section className="portal-panel">
              <div className="panel-heading" style={{ padding: '0 0 12px' }}>
                <div>
                  <h2>Чат по заказу</h2>
                  <p>Прямая связь с командой разработки</p>
                </div>
                <MessageCircle size={18} />
              </div>
              {messages.length ? (
                <div className="portal-chat-list">
                  {messages.map((m) => (
                    <article
                      className={`portal-chat-message ${m.author_username === user.username ? 'portal-chat-mine' : ''}`}
                      key={m.id}
                    >
                      <div>
                        <strong>{m.author_username === user.username ? 'Вы' : m.author_username || 'Команда BOTVEX'}</strong>
                        <time className="mono">{formatDateTime(m.created_at)}</time>
                      </div>
                      <p>{m.body}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="field-hint" style={{ marginTop: 10 }}>Сообщений пока нет.</p>
              )}
              <form onSubmit={sendMessage} style={{ marginTop: 12 }}>
                <label className="form-field">
                  <textarea
                    required
                    maxLength={10000}
                    rows={3}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Напишите сообщение по заказу…"
                  />
                </label>
                <button className="primary-button" disabled={sending || !draft.trim()}>
                  {sending ? 'Отправка…' : 'Отправить'}
                </button>
              </form>
            </section>
          </>
        ) : orders.length ? (
          <div className="admin-order-list">
            {orders.map((order) => (
              <button className="portal-order-card" key={order.id} onClick={() => void loadDetails(order)}>
                <div className="admin-order-main-button">
                  <small>{order.order_number}</small>
                  <strong>{order.title}</strong>
                  <p>{order.client_visible_summary || 'Нажмите для просмотра деталей'}</p>
                </div>
                <div className="admin-order-meta">
                  <span className={`order-status order-status-${order.status}`}>
                    {statusLabels[order.status] ?? order.status}
                  </span>
                  <strong className="mono">{order.amount ? `${order.amount} ${order.currency}` : '—'}</strong>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="portal-panel empty-state">
            <ShieldCheck size={28} />
            <h3>Заказов пока нет</h3>
            <p>После оформления заказа командой BOTVEX он появится в этом списке.</p>
          </div>
        )}
      </main>
      <ConfirmModal dialog={confirmLogout} onClose={() => setConfirmLogout(null)} />
    </div>
  );
}
