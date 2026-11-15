import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Archive,
  ArrowLeft,
  Check,
  CircleDollarSign,
  FileDiff,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { api } from './api';
import ConfirmModal, { type ConfirmDialogState } from './ConfirmModal';
import { formatDate, formatDateTime } from './formatting';
import type {
  AuthUser,
  OrderAttachment,
  OrderChangeRequest,
  OrderEvent,
  OrderMessage,
  OrderPaymentSummary,
  OrderRecord,
  OrderStatus,
} from './types';

type Props = {
  profile: AuthUser;
  notify: (message: string, error?: boolean) => void;
  initialOrderId?: number | null;
  initialClientId?: number | null;
  aiEnabled?: boolean;
  aiModel?: string;
};

type Page = {
  items: OrderRecord[];
  total: number;
  limit: number;
  offset: number;
};

type Client = { id: number; name: string; is_archived?: boolean };
type Project = { id: number; name: string; client_id: number | null; is_archived?: boolean };

type Values = {
  client_id: string;
  project_id: string;
  title: string;
  scope: string;
  client_visible_summary: string;
  internal_notes: string;
  amount: string;
  amount_type: 'estimate' | 'fixed';
  currency: string;
  target_delivery_date: string;
};

const PAGE_SIZE = 20;

const labels: Record<string, string> = {
  draft: 'Черновик',
  awaiting_proposal_approval: 'Ожидает согласования КП',
  awaiting_customer_information: 'Нужна информация от клиента',
  approved: 'Согласован',
  in_progress: 'В работе',
  internal_review: 'Внутренняя проверка',
  awaiting_customer_review: 'На проверке у клиента',
  changes_requested: 'Запрошены доработки',
  ready_for_delivery: 'Готов к передаче',
  delivered: 'Передан клиенту',
  completed: 'Завершён',
  on_hold: 'Приостановлен',
  cancelled: 'Отменён',
};

const transitions: Record<string, OrderStatus[]> = {
  draft: ['awaiting_proposal_approval', 'cancelled'],
  awaiting_proposal_approval: ['awaiting_customer_information', 'approved', 'on_hold', 'cancelled'],
  awaiting_customer_information: ['awaiting_proposal_approval', 'approved', 'on_hold', 'cancelled'],
  approved: ['in_progress', 'on_hold', 'cancelled'],
  in_progress: ['internal_review', 'on_hold'],
  internal_review: ['in_progress', 'awaiting_customer_review'],
  awaiting_customer_review: ['changes_requested', 'ready_for_delivery'],
  changes_requested: ['in_progress', 'awaiting_customer_review'],
  ready_for_delivery: ['delivered', 'changes_requested'],
  delivered: ['completed', 'changes_requested'],
  on_hold: ['approved', 'in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

const empty: Values = {
  client_id: '',
  project_id: '',
  title: '',
  scope: '',
  client_visible_summary: '',
  internal_notes: '',
  amount: '',
  amount_type: 'estimate',
  currency: 'RUB',
  target_delivery_date: '',
};

const can = (u: AuthUser, key: string) =>
  u.is_owner || u.permissions['*'] === 'all' || Object.prototype.hasOwnProperty.call(u.permissions, key);

const statusClass = (s: string) =>
  ['completed', 'approved', 'delivered', 'ready_for_delivery'].includes(s)
    ? 'order-status-good'
    : ['cancelled', 'changes_requested', 'on_hold'].includes(s)
      ? 'order-status-warning'
      : ['in_progress', 'internal_review', 'awaiting_customer_review'].includes(s)
        ? 'order-status-active'
        : '';

export default function OrdersPage({
  profile,
  notify,
  initialOrderId,
  initialClientId,
  aiEnabled = false,
  aiModel = 'qwen2.5:1.5b',
}: Props) {
  const [page, setPage] = useState<Page>({ items: [], total: 0, limit: PAGE_SIZE, offset: 0 });
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  const [selected, setSelected] = useState<OrderRecord | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'chat' | 'finance'>('overview');
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [changeRequests, setChangeRequests] = useState<OrderChangeRequest[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<OrderPaymentSummary | null>(null);
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);

  const [message, setMessage] = useState('');
  const [internal, setInternal] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState<Values>(empty);
  const [formError, setFormError] = useState('');

  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('');
  const [stageMessage, setStageMessage] = useState('');
  const [stagePublic, setStagePublic] = useState(false);

  const [crTitle, setCrTitle] = useState('');
  const [crScopeDelta, setCrScopeDelta] = useState('');
  const [crAmountDelta, setCrAmountDelta] = useState('');
  const [crNewDate, setCrNewDate] = useState('');

  const [payKind, setPayKind] = useState<'payment' | 'expense'>('payment');
  const [payAmount, setPayAmount] = useState('');
  const [payStatus, setPayStatus] = useState<'planned' | 'paid'>('planned');
  const [payNote, setPayNote] = useState('');

  const canCreate = can(profile, 'orders:create');
  const canEdit = can(profile, 'orders:edit');
  const canTransition = can(profile, 'orders:transition');
  const canInternal = can(profile, 'orders:view_internal') || can(profile, 'orders:messages:internal');
  const canMessages = can(profile, 'orders:messages:view');
  const canSend = can(profile, 'orders:messages:create');
  const canArchive = can(profile, 'orders:archive');
  const canRestore = can(profile, 'orders:restore');

  const loadList = useCallback(async () => {
    setBusy(true);
    setError('');
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page.offset) });
    if (query.trim()) params.set('q', query.trim());
    if (status) params.set('status', status);
    if (showArchived) params.set('include_archived', 'true');
    try {
      const data = await api.get<Page>(`/api/v1/orders?${params}`);
      setPage(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить заказы.');
    } finally {
      setBusy(false);
    }
  }, [page.offset, query, status, showArchived, refresh]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<Client[]>('/api/v1/clients?limit=250'),
      api.get<Project[]>('/api/v1/projects?limit=250'),
    ])
      .then(([cs, ps]) => {
        if (active) {
          setClients(cs.filter((x) => !x.is_archived));
          setProjects(ps.filter((x) => !x.is_archived));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const loadDetails = useCallback(
    async (id: number) => {
      setError('');
      try {
        const detail = await api.get<OrderRecord>(`/api/v1/orders/${id}`);
        setSelected(detail);
        setNextStatus('');
        window.location.hash = `#/orders/${id}`;
        const [history, chat, crs, payments, atts] = await Promise.all([
          api.get<OrderEvent[]>(`/api/v1/orders/${id}/events`),
          canMessages ? api.get<OrderMessage[]>(`/api/v1/orders/${id}/messages`) : Promise.resolve([] as OrderMessage[]),
          api.get<OrderChangeRequest[]>(`/api/v1/orders/${id}/change-requests`).catch(() => [] as OrderChangeRequest[]),
          api.get<OrderPaymentSummary>(`/api/v1/orders/${id}/payments`).catch(() => null),
          api.get<OrderAttachment[]>(`/api/v1/orders/${id}/attachments`).catch(() => [] as OrderAttachment[]),
        ]);
        setEvents(history);
        setMessages(chat);
        setChangeRequests(crs);
        setPaymentSummary(payments);
        setAttachments(atts);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить заказ.');
      }
    },
    [canMessages],
  );

  useEffect(() => {
    if (initialOrderId && (!selected || selected.id !== initialOrderId)) {
      void loadDetails(initialOrderId);
    }
  }, [initialOrderId]);

  useEffect(() => {
    if (initialClientId && canCreate) {
      setValues({ ...empty, client_id: String(initialClientId) });
      setCreateOpen(true);
    }
  }, [initialClientId, canCreate]);

  const availableProjects = useMemo(
    () =>
      projects.filter(
        (p) => !values.client_id || p.client_id === null || p.client_id === Number(values.client_id),
      ),
    [projects, values.client_id],
  );

  function openEditModal(order: OrderRecord) {
    setValues({
      client_id: String(order.client_id),
      project_id: order.project_id ? String(order.project_id) : '',
      title: order.title,
      scope: order.scope,
      client_visible_summary: order.client_visible_summary || '',
      internal_notes: order.internal_notes || '',
      amount: order.amount || '',
      amount_type: order.amount_type,
      currency: order.currency,
      target_delivery_date: order.target_delivery_date || '',
    });
    setFormError('');
    setEditOpen(true);
  }

  async function createOrder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    if (!values.client_id) {
      setFormError('Выберите клиента.');
      return;
    }
    if (values.amount_type === 'fixed' && !values.amount.trim()) {
      setFormError('Для фиксированной цены укажите сумму.');
      return;
    }
    setCreating(true);
    try {
      const body = {
        client_id: Number(values.client_id),
        project_id: values.project_id ? Number(values.project_id) : null,
        title: values.title.trim(),
        scope: values.scope.trim(),
        client_visible_summary: values.client_visible_summary.trim() || null,
        internal_notes: values.internal_notes.trim() || null,
        amount: values.amount.trim() || null,
        amount_type: values.amount_type,
        currency: values.currency,
        target_delivery_date: values.target_delivery_date || null,
      };
      const created = await api.post<OrderRecord>('/api/v1/orders', body);
      setCreateOpen(false);
      setValues(empty);
      setRefresh((n) => n + 1);
      notify('Заказ создан');
      await loadDetails(created.id);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Не удалось создать заказ.');
    } finally {
      setCreating(false);
    }
  }

  async function saveOrderEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setFormError('');
    const commercialEditable = ['draft', 'awaiting_proposal_approval'].includes(selected.status);
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        project_id: values.project_id ? Number(values.project_id) : null,
        title: values.title.trim(),
        client_visible_summary: values.client_visible_summary.trim() || null,
      };
      if (canInternal) payload.internal_notes = values.internal_notes.trim() || null;
      if (commercialEditable) {
        payload.scope = values.scope.trim();
        payload.amount = values.amount.trim() || null;
        payload.amount_type = values.amount_type;
        payload.currency = values.currency;
        payload.target_delivery_date = values.target_delivery_date || null;
      }
      await api.patch<OrderRecord>(`/api/v1/orders/${selected.id}`, payload);
      setEditOpen(false);
      notify('Заказ обновлён');
      await loadDetails(selected.id);
      setRefresh((n) => n + 1);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Не удалось сохранить.');
    } finally {
      setCreating(false);
    }
  }

  async function changeStage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !nextStatus) return;
    setCreating(true);
    try {
      await api.post(`/api/v1/orders/${selected.id}/transition`, {
        status: nextStatus,
        message: stageMessage.trim() || null,
        client_visible: stagePublic,
      });
      setStageMessage('');
      setStagePublic(false);
      notify('Этап обновлён');
      await loadDetails(selected.id);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка смены этапа.');
    } finally {
      setCreating(false);
    }
  }

  async function generateAiReply() {
    if (!selected) return;
    setAiDrafting(true);
    try {
      const res = await api.post<{ model: string; reply: string }>('/api/v1/ai/assist', {
        task: 'draft_order_reply',
        order_id: selected.id,
        model: aiModel,
      });
      setMessage(res.reply);
      setInternal(false);
      notify(`Черновик сформирован (${res.model})`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Локальный Qwen недоступен', true);
    } finally {
      setAiDrafting(false);
    }
  }

  async function uploadFile(file: File | undefined) {
    if (!selected || !file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('is_internal', 'false');
      await api.upload(`/api/v1/orders/${selected.id}/attachments`, fd);
      setAttachments(await api.get<OrderAttachment[]>(`/api/v1/orders/${selected.id}/attachments`));
      notify('Файл прикреплён');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Не удалось загрузить файл', true);
    } finally {
      setUploading(false);
    }
  }

  async function createChangeRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !crTitle.trim() || !crScopeDelta.trim()) return;
    setCreating(true);
    try {
      await api.post(`/api/v1/orders/${selected.id}/change-requests`, {
        title: crTitle.trim(),
        scope_delta: crScopeDelta.trim(),
        amount_delta: crAmountDelta.trim() || null,
        new_delivery_date: crNewDate || null,
      });
      setCrTitle('');
      setCrScopeDelta('');
      setCrAmountDelta('');
      setCrNewDate('');
      notify('Запрос на изменение создан');
      await loadDetails(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка создания CR.');
    } finally {
      setCreating(false);
    }
  }

  async function decideChangeRequest(crId: number, decision: 'approved' | 'rejected') {
    if (!selected) return;
    try {
      await api.post(`/api/v1/orders/${selected.id}/change-requests/${crId}/decision`, {
        status: decision,
        decision_note: decision === 'approved' ? 'Утверждено' : 'Отклонено',
      });
      notify(decision === 'approved' ? 'CR утверждён' : 'CR отклонён');
      await loadDetails(selected.id);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка решения по CR.');
    }
  }

  async function addPayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !payAmount.trim()) return;
    setCreating(true);
    try {
      await api.post(`/api/v1/orders/${selected.id}/payments`, {
        kind: payKind,
        amount: payAmount.trim(),
        currency: selected.currency,
        status: payStatus,
        note: payNote.trim() || null,
      });
      setPayAmount('');
      setPayNote('');
      notify('Запись добавлена');
      await loadDetails(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка записи платежа.');
    } finally {
      setCreating(false);
    }
  }

  async function updatePaymentStatus(paymentId: number, newStatus: 'paid' | 'cancelled') {
    if (!selected) return;
    try {
      await api.patch(`/api/v1/orders/${selected.id}/payments/${paymentId}`, { status: newStatus });
      notify('Статус платежа обновлён');
      await loadDetails(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка обновления платежа.');
    }
  }

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !message.trim()) return;
    try {
      await api.post(`/api/v1/orders/${selected.id}/messages`, {
        body: message.trim(),
        is_internal: internal,
      });
      setMessage('');
      setInternal(false);
      setMessages(await api.get<OrderMessage[]>(`/api/v1/orders/${selected.id}/messages`));
      notify('Сообщение отправлено');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки сообщения.');
    }
  }

  function archiveOrder() {
    if (!selected) return;
    setConfirmDialog({
      title: 'Архивировать заказ?',
      message: `Вы точно хотите архивировать заказ ${selected.order_number}?`,
      confirmLabel: 'Архивировать',
      danger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          await api.post(`/api/v1/orders/${selected.id}/archive`, {});
          setConfirmDialog(null);
          notify('Заказ архивирован');
          setSelected(null);
          window.location.hash = '#/orders';
          setRefresh((n) => n + 1);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Ошибка архивации.');
        } finally {
          setBusy(false);
        }
      },
    });
  }

  function restoreOrder(item: OrderRecord) {
    setConfirmDialog({
      title: 'Восстановить заказ?',
      message: `Вернуть заказ ${item.order_number} из архива?`,
      confirmLabel: 'Восстановить',
      onConfirm: async () => {
        setBusy(true);
        try {
          await api.post(`/api/v1/orders/${item.id}/restore`, {});
          setConfirmDialog(null);
          notify('Заказ восстановлен');
          setRefresh((n) => n + 1);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Ошибка восстановления.');
        } finally {
          setBusy(false);
        }
      },
    });
  }

  const renderForm = (isEditing = false) => {
    const commercialFrozen =
      isEditing && selected !== null && !['draft', 'awaiting_proposal_approval'].includes(selected.status);
    return (
      <div className="form-grid">
        {!isEditing && (
          <label className="form-field">
            <span>Клиент <i>*</i></span>
            <select required value={values.client_id} onChange={(e) => setValues((p) => ({ ...p, client_id: e.target.value, project_id: '' }))}>
              <option value="">Выбрать клиента</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className={`form-field ${isEditing ? 'field-full' : ''}`}>
          <span>Проект</span>
          <select value={values.project_id} onChange={(e) => setValues((p) => ({ ...p, project_id: e.target.value }))}>
            <option value="">Без проекта</option>
            {availableProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="form-field field-full">
          <span>Название <i>*</i></span>
          <input required minLength={2} maxLength={180} value={values.title} onChange={(e) => setValues((p) => ({ ...p, title: e.target.value }))} />
        </label>
        <label className="form-field field-full">
          <span>Объём работ <i>*</i></span>
          <textarea required disabled={commercialFrozen} rows={3} value={values.scope} onChange={(e) => setValues((p) => ({ ...p, scope: e.target.value }))} />
        </label>
        <label className="form-field field-full">
          <span>Описание для клиента</span>
          <textarea rows={2} value={values.client_visible_summary} onChange={(e) => setValues((p) => ({ ...p, client_visible_summary: e.target.value }))} />
        </label>
        {canInternal && (
          <label className="form-field field-full">
            <span>Внутренние заметки</span>
            <textarea rows={2} value={values.internal_notes} onChange={(e) => setValues((p) => ({ ...p, internal_notes: e.target.value }))} />
          </label>
        )}
        <label className="form-field">
          <span>Цена</span>
          <input type="number" disabled={commercialFrozen} min="0.01" step="0.01" value={values.amount} onChange={(e) => setValues((p) => ({ ...p, amount: e.target.value }))} />
        </label>
        <label className="form-field">
          <span>Тип цены</span>
          <select disabled={commercialFrozen} value={values.amount_type} onChange={(e) => setValues((p) => ({ ...p, amount_type: e.target.value as Values['amount_type'] }))}>
            <option value="estimate">Оценка</option>
            <option value="fixed">Фиксированная</option>
          </select>
        </label>
        <label className="form-field">
          <span>Валюта</span>
          <select disabled={commercialFrozen} value={values.currency} onChange={(e) => setValues((p) => ({ ...p, currency: e.target.value }))}>
            <option value="RUB">RUB</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </label>
        <label className="form-field">
          <span>Дата сдачи</span>
          <input type="date" disabled={commercialFrozen} value={values.target_delivery_date} onChange={(e) => setValues((p) => ({ ...p, target_delivery_date: e.target.value }))} />
        </label>
      </div>
    );
  };

  const pages = Math.max(1, Math.ceil(page.total / PAGE_SIZE));

  if (selected) {
    return (
      <section className="orders-workspace">
        <button
          className="portal-back"
          onClick={() => {
            setSelected(null);
            window.location.hash = '#/orders';
            setRefresh((n) => n + 1);
          }}
        >
          <ArrowLeft size={16} /> Все заказы
        </button>

        {error && <div className="notice notice-error">{error}</div>}

        <div className="order-detail-heading">
          <div>
            <p className="eyebrow mono">{selected.order_number}</p>
            <h2>{selected.title}</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 10px' }}>
              {selected.client_name} · {formatDateTime(selected.created_at)}
            </p>
            <span className={`order-status ${statusClass(selected.status)}`}>
              {labels[selected.status] || selected.status}
            </span>
          </div>
          <div className="access-user-actions">
            {canEdit && !selected.is_archived && (
              <button className="secondary-button" onClick={() => openEditModal(selected)}>
                <Settings2 size={15} /> Редактировать
              </button>
            )}
            {canArchive && !selected.is_archived && (
              <button className="secondary-button" onClick={() => archiveOrder()}>
                <Archive size={15} /> В архив
              </button>
            )}
            <button className="secondary-button" onClick={() => void loadDetails(selected.id)}>
              <RefreshCw size={15} /> Обновить
            </button>
          </div>
        </div>

        <div className="access-tabs" role="tablist">
          <button className={detailTab === 'overview' ? 'access-tab access-tab-active' : 'access-tab'} onClick={() => setDetailTab('overview')}>
            Обзор и этапы
          </button>
          <button className={detailTab === 'chat' ? 'access-tab access-tab-active' : 'access-tab'} onClick={() => setDetailTab('chat')}>
            Переписка и файлы ({messages.length + attachments.length})
          </button>
          <button className={detailTab === 'finance' ? 'access-tab access-tab-active' : 'access-tab'} onClick={() => setDetailTab('finance')}>
            Финансы и CR ({changeRequests.length})
          </button>
        </div>

        {detailTab === 'overview' && (
          <div className="order-detail-grid">
            <section className="order-panel">
              <h2 style={{ marginTop: 0 }}>Параметры заказа</h2>
              <div className="order-facts">
                <div><span>Клиент</span><strong>{selected.client_name}</strong></div>
                <div><span>Сумма</span><strong>{selected.amount ? `${selected.amount} ${selected.currency}` : 'Уточняется'}</strong></div>
                <div><span>Срок</span><strong>{formatDate(selected.target_delivery_date)}</strong></div>
                <div><span>Этап</span><strong>{labels[selected.status] || selected.status}</strong></div>
              </div>
              <div className="order-text-block">
                <h3>Объём работ</h3>
                <p>{selected.scope}</p>
              </div>
              <div className="order-text-block">
                <h3>Для клиента</h3>
                <p>{selected.client_visible_summary || '—'}</p>
              </div>
              {canInternal && selected.internal_notes && (
                <div className="order-text-block order-internal">
                  <h3><ShieldCheck size={14} /> Внутренние заметки</h3>
                  <p>{selected.internal_notes}</p>
                </div>
              )}
            </section>

            <section className="order-panel">
              <h2 style={{ marginTop: 0 }}>Этапы и история</h2>
              {events.length ? (
                <ol className="portal-timeline">
                  {events.map((ev) => (
                    <li key={ev.id}>
                      <i />
                      <div>
                        <strong>{ev.to_status ? labels[ev.to_status] || ev.to_status : 'Событие'}</strong>
                        {ev.message && <p>{ev.message}</p>}
                        <time>{formatDateTime(ev.created_at)}</time>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="field-hint">Событий пока нет.</p>
              )}

              {canTransition && (transitions[selected.status] || []).length > 0 && (
                <form onSubmit={changeStage} style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-hairline)' }}>
                  <h3 style={{ marginTop: 0, fontSize: 14 }}>Перевести этап</h3>
                  <label className="form-field">
                    <span>Новый статус</span>
                    <select required value={nextStatus} onChange={(e) => setNextStatus(e.target.value as OrderStatus | '')}>
                      <option value="">Выбрать</option>
                      {transitions[selected.status].map((s) => (
                        <option key={s} value={s}>{labels[s]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Комментарий</span>
                    <textarea rows={2} value={stageMessage} onChange={(e) => setStageMessage(e.target.value)} />
                  </label>
                  <label className="sort-due" style={{ marginBottom: 12 }}>
                    <input type="checkbox" checked={stagePublic} onChange={(e) => setStagePublic(e.target.checked)} />
                    Показать в клиентском портале
                  </label>
                  <button className="primary-button" disabled={creating || !nextStatus}>Сохранить этап</button>
                </form>
              )}
            </section>
          </div>
        )}

        {detailTab === 'chat' && (
          <div className="order-detail-grid">
            {canMessages && (
              <section className="order-panel">
                <div className="panel-heading" style={{ padding: '0 0 12px' }}>
                  <div>
                    <h2>Переписка</h2>
                    <p>Сообщений: {messages.length}</p>
                  </div>
                  <MessageSquare size={18} />
                </div>
                <div className="portal-chat-list">
                  {messages.map((m) => (
                    <article className={`portal-chat-message ${m.is_internal ? 'portal-chat-internal' : ''}`} key={m.id}>
                      <div>
                        <strong>{m.author_username || 'Оператор'}{m.is_internal ? ' · внутр.' : ''}</strong>
                        <time className="mono">{formatDateTime(m.created_at)}</time>
                      </div>
                      <p>{m.body}</p>
                    </article>
                  ))}
                </div>
                {canSend && (
                  <form onSubmit={sendMessage}>
                    <label className="form-field">
                      <span>Сообщение</span>
                      <textarea rows={3} required value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Текст сообщения…" />
                    </label>
                    <div className="access-user-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      {canInternal ? (
                        <label className="sort-due">
                          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                          Внутреннее
                        </label>
                      ) : <span />}
                      <div className="access-user-actions">
                        {aiEnabled && (
                          <button type="button" className="secondary-button" disabled={aiDrafting} onClick={() => void generateAiReply()}>
                            <Sparkles size={14} /> {aiDrafting ? 'Генерация…' : 'Черновик Qwen'}
                          </button>
                        )}
                        <button className="primary-button" disabled={!message.trim()}>
                          <Send size={14} /> Отправить
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </section>
            )}

            <section className="order-panel">
              <div className="panel-heading" style={{ padding: '0 0 12px' }}>
                <div>
                  <h2>Файлы заказа</h2>
                  <p>До 10 МБ</p>
                </div>
                {canEdit && (
                  <label className="secondary-button" style={{ cursor: 'pointer' }}>
                    <Upload size={14} /> {uploading ? 'Загрузка…' : 'Загрузить'}
                    <input type="file" hidden disabled={uploading} onChange={(e) => void uploadFile(e.target.files?.[0])} />
                  </label>
                )}
              </div>
              {attachments.length ? (
                <div className="activity-list" style={{ padding: 0 }}>
                  {attachments.map((att) => (
                    <div className="activity-row" key={att.id}>
                      <Paperclip size={15} />
                      <div className="row-info">
                        <strong>{att.original_filename}</strong>
                        <small className="mono">{Math.ceil(att.size_bytes / 1024)} КБ · {att.uploaded_by_username || '—'}</small>
                      </div>
                      <a className="secondary-button" href={`/api/v1/orders/${selected.id}/attachments/${att.id}/download`}>
                        Скачать
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="field-hint" style={{ marginTop: 12 }}>Файлов пока нет.</p>
              )}
            </section>
          </div>
        )}

        {detailTab === 'finance' && (
          <div className="order-detail-grid">
            <section className="order-panel">
              <div className="panel-heading" style={{ padding: '0 0 12px' }}>
                <div>
                  <h2>Запросы на изменение (CR)</h2>
                </div>
                <FileDiff size={18} />
              </div>
              <div className="activity-list" style={{ padding: 0 }}>
                {changeRequests.map((cr) => (
                  <div className="activity-row" key={cr.id}>
                    <div className="row-info">
                      <strong>#{cr.id} · {cr.title} ({cr.status})</strong>
                      <small>{cr.scope_delta}{cr.amount_delta ? ` · ${cr.amount_delta} ${selected.currency}` : ''}</small>
                    </div>
                    {canEdit && cr.status === 'pending' && (
                      <div className="row-actions">
                        <button className="icon-button" onClick={() => void decideChangeRequest(cr.id, 'approved')}><Check size={14} /></button>
                        <button className="icon-button" onClick={() => void decideChangeRequest(cr.id, 'rejected')}><X size={14} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && !selected.is_archived && (
                <form onSubmit={createChangeRequest} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-hairline)' }}>
                  <label className="form-field"><span>Заголовок CR</span><input required value={crTitle} onChange={(e) => setCrTitle(e.target.value)} /></label>
                  <label className="form-field"><span>Описание изменений</span><textarea required rows={2} value={crScopeDelta} onChange={(e) => setCrScopeDelta(e.target.value)} /></label>
                  <div className="form-grid">
                    <label className="form-field"><span>Дельта суммы</span><input type="number" step="0.01" value={crAmountDelta} onChange={(e) => setCrAmountDelta(e.target.value)} /></label>
                    <label className="form-field"><span>Новый срок</span><input type="date" value={crNewDate} onChange={(e) => setCrNewDate(e.target.value)} /></label>
                  </div>
                  <button className="primary-button" disabled={creating}>Создать CR</button>
                </form>
              )}
            </section>

            <section className="order-panel">
              <div className="panel-heading" style={{ padding: '0 0 12px' }}>
                <div><h2>Финансовый реестр</h2></div>
                <CircleDollarSign size={18} />
              </div>
              {paymentSummary && (
                <div className="order-facts">
                  <div><span>Оплачено</span><strong>{paymentSummary.paid_amount} {paymentSummary.currency}</strong></div>
                  <div><span>Остаток</span><strong>{paymentSummary.balance_due} {paymentSummary.currency}</strong></div>
                  <div><span>План</span><strong>{paymentSummary.planned_amount} {paymentSummary.currency}</strong></div>
                  <div><span>Расходы</span><strong>{paymentSummary.expenses_amount} {paymentSummary.currency}</strong></div>
                </div>
              )}
              <div className="activity-list" style={{ padding: 0 }}>
                {paymentSummary?.items.map((p) => (
                  <div className="activity-row" key={p.id}>
                    <div className="row-info">
                      <strong>{p.kind === 'payment' ? 'Платёж' : 'Расход'}: {p.amount} {p.currency} ({p.status})</strong>
                      <small>{p.note || '—'}</small>
                    </div>
                    {canEdit && p.status === 'planned' && (
                      <div className="row-actions">
                        <button className="icon-button" onClick={() => void updatePaymentStatus(p.id, 'paid')}><Check size={14} /></button>
                        <button className="icon-button" onClick={() => void updatePaymentStatus(p.id, 'cancelled')}><X size={14} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && !selected.is_archived && (
                <form onSubmit={addPayment} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-hairline)' }}>
                  <div className="form-grid">
                    <label className="form-field">
                      <span>Тип</span>
                      <select value={payKind} onChange={(e) => setPayKind(e.target.value as 'payment' | 'expense')}>
                        <option value="payment">Платёж</option>
                        <option value="expense">Расход</option>
                      </select>
                    </label>
                    <label className="form-field">
                      <span>Статус</span>
                      <select value={payStatus} onChange={(e) => setPayStatus(e.target.value as 'planned' | 'paid')}>
                        <option value="planned">План</option>
                        <option value="paid">Оплачен</option>
                      </select>
                    </label>
                    <label className="form-field"><span>Сумма</span><input type="number" required min="0.01" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></label>
                    <label className="form-field"><span>Примечание</span><input value={payNote} onChange={(e) => setPayNote(e.target.value)} /></label>
                  </div>
                  <button className="primary-button" disabled={creating}>Добавить запись</button>
                </form>
              )}
            </section>
          </div>
        )}

        {editOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditOpen(false); }}>
            <section className="modal-card" role="dialog" aria-modal="true">
              <div className="modal-heading">
                <h2>Редактировать {selected.order_number}</h2>
                <button className="icon-button" type="button" onClick={() => setEditOpen(false)}>×</button>
              </div>
              <form onSubmit={saveOrderEdit}>
                {renderForm(true)}
                {formError && <p className="field-error">{formError}</p>}
                <div className="modal-footer">
                  <button type="button" className="secondary-button" onClick={() => setEditOpen(false)}>Отмена</button>
                  <button className="primary-button" disabled={creating}>Сохранить</button>
                </div>
              </form>
            </section>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="orders-workspace">
      {error && <div className="notice notice-error">{error}</div>}
      <div className="orders-toolbar">
        <form className="search-field" onSubmit={(e) => { e.preventDefault(); setPage((p) => ({ ...p, offset: 0 })); setQuery(q); }}>
          <Search size={15} />
          <input placeholder="Поиск по названию или номеру…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <div className="toolbar-right">
          <select className="filter-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage((p) => ({ ...p, offset: 0 })); }}>
            <option value="">Все статусы</option>
            {Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="sort-due">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Архив
          </label>
          {canCreate && (
            <button className="primary-button" onClick={() => { setValues(empty); setFormError(''); setCreateOpen(true); }}>
              <Plus size={15} /> Новый заказ
            </button>
          )}
        </div>
      </div>

      {busy ? (
        <div className="loading">Загрузка заказов…</div>
      ) : page.items.length ? (
        <div className="admin-order-list">
          {page.items.map((item) => (
            <article className="admin-order-card" key={item.id}>
              <button className="admin-order-main-button" disabled={item.is_archived} onClick={() => void loadDetails(item.id)}>
                <small>{item.order_number} · {item.client_name}</small>
                <strong>{item.title}</strong>
                <p>{item.client_visible_summary || item.scope}</p>
              </button>
              <div className="admin-order-meta">
                <span className={`order-status ${statusClass(item.status)}`}>{labels[item.status] || item.status}</span>
                <strong className="mono">{item.amount ? `${item.amount} ${item.currency}` : '—'}</strong>
                {item.is_archived && canRestore && (
                  <button className="secondary-button" onClick={() => restoreOrder(item)}>Восстановить</button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel empty-state">
          <CircleDollarSign size={26} />
          <h3>Заказов пока нет</h3>
        </div>
      )}

      {page.total > PAGE_SIZE && (
        <div className="table-footer">
          <span>Страница {Math.floor(page.offset / PAGE_SIZE) + 1} из {pages}</span>
          <div className="access-user-actions">
            <button className="secondary-button" disabled={page.offset === 0} onClick={() => setPage((p) => ({ ...p, offset: Math.max(0, p.offset - PAGE_SIZE) }))}>Назад</button>
            <button className="secondary-button" disabled={page.offset + PAGE_SIZE >= page.total} onClick={() => setPage((p) => ({ ...p, offset: p.offset + PAGE_SIZE }))}>Дальше</button>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreateOpen(false); }}>
          <section className="modal-card" role="dialog" aria-modal="true">
            <div className="modal-heading">
              <h2>Новый заказ</h2>
              <button className="icon-button" type="button" onClick={() => setCreateOpen(false)}>×</button>
            </div>
            <form onSubmit={createOrder}>
              {renderForm(false)}
              {formError && <p className="field-error">{formError}</p>}
              <div className="modal-footer">
                <button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Отмена</button>
                <button className="primary-button" disabled={creating}>Создать</button>
              </div>
            </form>
          </section>
        </div>
      )}
      <ConfirmModal dialog={confirmDialog} busy={busy} onClose={() => setConfirmDialog(null)} />
    </section>
  );
}
