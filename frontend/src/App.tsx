import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  AlertCircle,
  Archive,
  AtSign,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CircleHelp,
  FileText,
  FlaskConical,
  Copy,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  Palette,
  Menu,
  Plus,
  Power,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { api } from './api';
import { RoleAvatar, resolveRoleKind } from './RoleAvatar';
import ConfirmModal, { type ConfirmDialogState } from './ConfirmModal';
import { THEME_PRESETS, applyTheme, getSavedCustomAccent, getSavedTheme, type ThemeId } from './theme';
import type {
  AiStatus,
  AuthUser,
  DashboardData,
  Entity,
  GlobalSearchResult,
  ProjectAssignment,
} from './types';
import { formatDate as fmtDate, formatDateTime as fmtDateTime, isOverdue } from './formatting';
import OrdersPage from './OrdersPage';
import AdminAccessPage from './AdminAccessPage';
import SettingsPage from './SettingsPage';

type Section =
  | 'dashboard'
  | 'clients'
  | 'projects'
  | 'tasks'
  | 'services'
  | 'activity'
  | 'logs'
  | 'tests'
  | 'deployments'
  | 'settings'
  | 'orders'
  | 'access';

type AppProps = {
  profile?: AuthUser;
  onLogout?: () => void;
};

type FieldType = 'text' | 'textarea' | 'select' | 'date' | 'number';

type Field = {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  hint?: string;
};

type Column = {
  key: string;
  label: string;
  format?: (value: unknown, row: Record<string, unknown>) => string;
};

type Config = {
  section: Section;
  title: string;
  singular: string;
  endpoint: string;
  icon: typeof Users;
  fields: Field[];
  columns: Column[];
  archive?: boolean;
};

const API = '/api/v1';
const SIMPLE_SECTIONS = new Set<Section>(['dashboard', 'clients', 'orders', 'tasks', 'services', 'settings']);
const VALID_SECTIONS = new Set<Section>([
  'dashboard',
  'clients',
  'projects',
  'tasks',
  'services',
  'activity',
  'logs',
  'tests',
  'deployments',
  'settings',
  'orders',
  'access',
]);

const labels: Record<string, string> = {
  lead: 'Лид',
  active: 'Активен',
  paused: 'На паузе',
  archived: 'В архиве',
  planning: 'Планирование',
  on_hold: 'Приостановлен',
  completed: 'Завершён',
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  urgent: 'Срочный',
  backlog: 'В очереди',
  in_progress: 'В работе',
  blocked: 'Заблокирована',
  review: 'На проверке',
  done: 'Готово',
  bot: 'Telegram-бот',
  api: 'API',
  external: 'Внешний сервис',
  manual: 'Вручную',
  probe: 'HTTP-проверка',
  manual_flag: 'Флаг панели',
  http_webhook: 'HTTP Webhook',
  unknown: 'Неизвестно',
  healthy: 'Работает',
  degraded: 'Деградация',
  down: 'Остановлен',
  debug: 'Отладка',
  info: 'Информация',
  warning: 'Предупреждение',
  error: 'Ошибка',
  passed: 'Успешно',
  failed: 'Ошибка',
  skipped: 'Пропущен',
  recorded: 'Записан вручную',
  success: 'Успешно',
  rolled_back: 'Откат',
  local: 'Локально',
  production: 'Production',
  staging: 'Staging',
  created: 'Создано',
  updated: 'Изменено',
};

const label = (v: unknown) =>
  labels[String(v ?? '')] || (v === null || v === undefined || v === '' ? '—' : String(v));

const idLabel = (v: unknown) => (v ? `#${v}` : '—');

const configs: Record<'clients' | 'projects' | 'tasks' | 'services' | 'logs' | 'tests' | 'deployments', Config> = {
  clients: {
    section: 'clients',
    title: 'Клиенты',
    singular: 'клиента',
    endpoint: `${API}/clients`,
    icon: Users,
    archive: true,
    fields: [
      { name: 'name', label: 'Название / имя', required: true, placeholder: 'Например, FlowLead' },
      { name: 'contact_person', label: 'Контактное лицо', placeholder: 'Имя представителя' },
      { name: 'contacts', label: 'Контакты', placeholder: 'Telegram, email или телефон' },
      { name: 'telegram_user_id', label: 'Telegram ID', placeholder: 'Например: 123456789' },
      { name: 'telegram_username', label: 'Telegram @username', placeholder: '@username' },
      {
        name: 'status',
        label: 'Статус',
        type: 'select',
        options: [
          { value: 'lead', label: 'Лид' },
          { value: 'active', label: 'Активен' },
          { value: 'paused', label: 'На паузе' },
        ],
      },
      { name: 'notes', label: 'Заметки', type: 'textarea', hint: 'Не сохраняйте пароли и токены.' },
    ],
    columns: [
      { key: 'name', label: 'Клиент' },
      { key: 'contact_person', label: 'Контактное лицо' },
      { key: 'telegram_username', label: 'Telegram' },
      { key: 'contacts', label: 'Контакты' },
      { key: 'status', label: 'Статус', format: (v) => label(v) },
      { key: 'updated_at', label: 'Обновлён', format: (v) => fmtDate(v) },
    ],
  },
  projects: {
    section: 'projects',
    title: 'Проекты',
    singular: 'проект',
    endpoint: `${API}/projects`,
    icon: BriefcaseBusiness,
    archive: true,
    fields: [
      { name: 'name', label: 'Название проекта', required: true },
      { name: 'description', label: 'Описание', type: 'textarea' },
      { name: 'client_id', label: 'Клиент', type: 'select', options: [] },
      {
        name: 'status',
        label: 'Статус',
        type: 'select',
        options: [
          { value: 'planning', label: 'Планирование' },
          { value: 'active', label: 'Активен' },
          { value: 'on_hold', label: 'Приостановлен' },
          { value: 'completed', label: 'Завершён' },
        ],
      },
      {
        name: 'priority',
        label: 'Приоритет',
        type: 'select',
        options: [
          { value: 'low', label: 'Низкий' },
          { value: 'normal', label: 'Обычный' },
          { value: 'high', label: 'Высокий' },
          { value: 'urgent', label: 'Срочный' },
        ],
      },
      { name: 'due_date', label: 'Дедлайн', type: 'date' },
      { name: 'repository_url', label: 'Репозиторий', placeholder: 'https://github.com/…' },
      { name: 'environment', label: 'Окружение', placeholder: 'local / staging / production' },
      { name: 'requirements', label: 'Требования (по строке)', type: 'textarea' },
      { name: 'acceptance_criteria', label: 'Критерии приёмки', type: 'textarea' },
      { name: 'notes', label: 'Заметки', type: 'textarea' },
    ],
    columns: [
      { key: 'name', label: 'Проект' },
      { key: 'client_id', label: 'Клиент', format: idLabel },
      { key: 'status', label: 'Статус', format: (v) => label(v) },
      { key: 'priority', label: 'Приоритет', format: (v) => label(v) },
      { key: 'due_date', label: 'Дедлайн', format: (v) => fmtDate(v) },
    ],
  },
  tasks: {
    section: 'tasks',
    title: 'Задачи',
    singular: 'задачу',
    endpoint: `${API}/tasks`,
    icon: CheckCircle2,
    archive: true,
    fields: [
      { name: 'title', label: 'Название задачи', required: true },
      { name: 'description', label: 'Описание', type: 'textarea' },
      { name: 'project_id', label: 'Проект', type: 'select', options: [] },
      {
        name: 'status',
        label: 'Статус',
        type: 'select',
        options: [
          { value: 'backlog', label: 'В очереди' },
          { value: 'in_progress', label: 'В работе' },
          { value: 'blocked', label: 'Заблокирована' },
          { value: 'review', label: 'На проверке' },
          { value: 'done', label: 'Готово' },
        ],
      },
      {
        name: 'priority',
        label: 'Приоритет',
        type: 'select',
        options: [
          { value: 'low', label: 'Низкий' },
          { value: 'normal', label: 'Обычный' },
          { value: 'high', label: 'Высокий' },
          { value: 'urgent', label: 'Срочный' },
        ],
      },
      { name: 'due_date', label: 'Срок', type: 'date' },
      { name: 'notes', label: 'Заметки', type: 'textarea' },
    ],
    columns: [
      { key: 'title', label: 'Задача' },
      { key: 'project_id', label: 'Проект', format: idLabel },
      { key: 'status', label: 'Статус', format: (v) => label(v) },
      { key: 'priority', label: 'Приоритет', format: (v) => label(v) },
      { key: 'due_date', label: 'Срок', format: (v) => fmtDate(v) },
    ],
  },
  services: {
    section: 'services',
    title: 'Боты и сервисы',
    singular: 'сервис',
    endpoint: `${API}/services`,
    icon: Bot,
    archive: true,
    fields: [
      { name: 'name', label: 'Название бота / узла', required: true },
      {
        name: 'type',
        label: 'Тип',
        type: 'select',
        options: [
          { value: 'bot', label: 'Telegram-бот' },
          { value: 'api', label: 'API' },
          { value: 'external', label: 'Внешний сервис' },
        ],
      },
      { name: 'project_id', label: 'Проект', type: 'select', options: [] },
      { name: 'url', label: 'URL', placeholder: 'https://example.com' },
      { name: 'health_endpoint', label: 'Health endpoint', placeholder: 'https://example.com/health' },
      {
        name: 'control_mode',
        label: 'Режим управления',
        type: 'select',
        options: [
          { value: 'manual_flag', label: 'Флаг панели (БД)' },
          { value: 'http_webhook', label: 'HTTP Webhook' },
        ],
      },
      { name: 'control_url', label: 'Webhook управления (если http_webhook)', placeholder: 'https://bot.example.com/control' },
      { name: 'environment', label: 'Среда', placeholder: 'local / staging / production' },
      { name: 'version', label: 'Версия' },
      { name: 'hosting', label: 'Хостинг' },
      {
        name: 'status',
        label: 'Статус',
        type: 'select',
        options: [
          { value: 'unknown', label: 'Неизвестно' },
          { value: 'healthy', label: 'Работает' },
          { value: 'degraded', label: 'Деградация' },
          { value: 'down', label: 'Остановлен' },
        ],
      },
      { name: 'notes', label: 'Заметки', type: 'textarea' },
    ],
    columns: [
      { key: 'name', label: 'Сервис' },
      { key: 'type', label: 'Тип', format: (v) => label(v) },
      { key: 'status', label: 'Статус', format: (v) => label(v) },
      { key: 'control_mode', label: 'Управление', format: (v) => label(v) },
      { key: 'hosting', label: 'Хостинг' },
    ],
  },
  logs: {
    section: 'logs',
    title: 'Журнал записей',
    singular: 'запись',
    endpoint: `${API}/log-entries`,
    icon: FileText,
    fields: [
      {
        name: 'level',
        label: 'Уровень',
        type: 'select',
        options: [
          { value: 'info', label: 'Информация' },
          { value: 'warning', label: 'Предупреждение' },
          { value: 'error', label: 'Ошибка' },
          { value: 'debug', label: 'Отладка' },
        ],
      },
      { name: 'service_id', label: 'Сервис', type: 'select', options: [] },
      { name: 'message', label: 'Сообщение', type: 'textarea', required: true },
    ],
    columns: [
      { key: 'level', label: 'Уровень', format: (v) => label(v) },
      { key: 'message', label: 'Сообщение' },
      { key: 'service_id', label: 'Сервис', format: idLabel },
      { key: 'created_at', label: 'Время', format: (v) => fmtDateTime(v) },
    ],
  },
  tests: {
    section: 'tests',
    title: 'Реестр тестов',
    singular: 'набор тестов',
    endpoint: `${API}/test-suites`,
    icon: FlaskConical,
    fields: [
      { name: 'name', label: 'Название набора', required: true },
      { name: 'project_id', label: 'Проект', type: 'select', options: [] },
      { name: 'description', label: 'Описание', type: 'textarea' },
    ],
    columns: [
      { key: 'name', label: 'Набор тестов' },
      { key: 'project_id', label: 'Проект', format: idLabel },
      { key: 'last_status', label: 'Результат', format: (v) => label(v) },
      { key: 'updated_at', label: 'Обновлён', format: (v) => fmtDateTime(v) },
    ],
  },
  deployments: {
    section: 'deployments',
    title: 'Релизы',
    singular: 'релиз',
    endpoint: `${API}/deployments`,
    icon: Zap,
    fields: [
      { name: 'version', label: 'Версия', required: true, placeholder: 'v0.2.0' },
      { name: 'project_id', label: 'Проект', type: 'select', options: [] },
      {
        name: 'environment',
        label: 'Среда',
        type: 'select',
        options: [
          { value: 'local', label: 'Локально' },
          { value: 'staging', label: 'Staging' },
          { value: 'production', label: 'Production' },
        ],
      },
      {
        name: 'status',
        label: 'Статус',
        type: 'select',
        options: [
          { value: 'recorded', label: 'Записан вручную' },
          { value: 'success', label: 'Успешно' },
          { value: 'failed', label: 'Ошибка' },
          { value: 'rolled_back', label: 'Откат' },
        ],
      },
      { name: 'url', label: 'URL' },
      { name: 'note', label: 'Заметка', type: 'textarea' },
    ],
    columns: [
      { key: 'version', label: 'Версия' },
      { key: 'project_id', label: 'Проект', format: idLabel },
      { key: 'environment', label: 'Среда', format: (v) => label(v) },
      { key: 'status', label: 'Статус', format: (v) => label(v) },
      { key: 'created_at', label: 'Дата', format: (v) => fmtDateTime(v) },
    ],
  },
};

const nav: Array<{ section: Section; label: string; icon: typeof LayoutDashboard; group: string }> = [
  { section: 'dashboard', label: 'Обзор', icon: LayoutDashboard, group: 'Рабочее пространство' },
  { section: 'clients', label: 'Клиенты', icon: Users, group: 'Рабочее пространство' },
  { section: 'orders', label: 'Заказы', icon: BriefcaseBusiness, group: 'Рабочее пространство' },
  { section: 'projects', label: 'Проекты', icon: BriefcaseBusiness, group: 'Рабочее пространство' },
  { section: 'tasks', label: 'Задачи', icon: CheckCircle2, group: 'Рабочее пространство' },
  { section: 'services', label: 'Боты и сервисы', icon: Bot, group: 'Инфраструктура' },
  { section: 'logs', label: 'Журнал записей', icon: FileText, group: 'Инфраструктура' },
  { section: 'tests', label: 'Реестр тестов', icon: FlaskConical, group: 'Инфраструктура' },
  { section: 'deployments', label: 'Релизы', icon: TerminalSquare, group: 'Инфраструктура' },
  { section: 'activity', label: 'Активность', icon: Activity, group: 'Система' },
  { section: 'access', label: 'Доступ и роли', icon: ShieldCheck, group: 'Система' },
  { section: 'settings', label: 'Настройки', icon: Gauge, group: 'Система' },
];

function parseHashRoute(): { section: Section; orderId: number | null } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  const candidate = (parts[0] || 'dashboard') as Section;
  const section = VALID_SECTIONS.has(candidate) ? candidate : 'dashboard';
  const orderId = section === 'orders' && parts[1] && /^\d+$/.test(parts[1]) ? Number(parts[1]) : null;
  return { section, orderId };
}

function hasPermission(profile: AuthUser | undefined, key: string): boolean {
  return (
    !profile ||
    profile.is_owner ||
    profile.permissions['*'] === 'all' ||
    Object.prototype.hasOwnProperty.call(profile.permissions, key)
  );
}

function resourceForSection(section: Section): string | undefined {
  return (
    {
      clients: 'clients',
      projects: 'projects',
      tasks: 'tasks',
      services: 'services',
      logs: 'logs',
      tests: 'test_suites',
      deployments: 'deployments',
    } as Partial<Record<Section, string>>
  )[section];
}

function sectionAllowed(profile: AuthUser | undefined, section: Section): boolean {
  if (!profile) return true;
  if (profile.is_owner || profile.permissions['*'] === 'all') return true;
  const permission: Partial<Record<Section, string>> = {
    dashboard: 'dashboard:view',
    clients: 'clients:view',
    projects: 'projects:view',
    tasks: 'tasks:view',
    services: 'services:view',
    activity: 'activity:view',
    logs: 'logs:view',
    tests: 'test_suites:view',
    deployments: 'deployments:view',
    settings: 'settings:view',
    orders: 'orders:view',
  };
  if (section === 'access') {
    return hasPermission(profile, 'admin:users:view') || hasPermission(profile, 'admin:roles:view');
  }
  const required = permission[section];
  return !!required && hasPermission(profile, required);
}

function sectionActionAllowed(
  profile: AuthUser | undefined,
  section: Section,
  action: 'create' | 'edit' | 'archive' | 'restore',
): boolean {
  if (!profile) return true;
  if (profile.is_owner || profile.permissions['*'] === 'all') return true;
  const resource = resourceForSection(section);
  return !!resource && hasPermission(profile, `${resource}:${action}`);
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() || '')
    .join('');
}

function formValues(item: Record<string, unknown> | undefined, fields: Field[]) {
  const result: Record<string, string> = {};
  fields.forEach((f) => {
    const v = item?.[f.name];
    result[f.name] =
      f.name === 'requirements' || f.name === 'acceptance_criteria'
        ? Array.isArray(v)
          ? v.join('\n')
          : ''
        : v === null || v === undefined
          ? ''
          : String(v);
  });
  return result;
}

function formPayload(values: Record<string, string>, fields: Field[], editing: boolean) {
  const data: Record<string, unknown> = {};
  const idFields = new Set(['client_id', 'project_id', 'service_id', 'telegram_user_id', 'telegram_username', 'control_url', 'url', 'health_endpoint']);
  for (const field of fields) {
    const value = (values[field.name] ?? '').trim();
    if (field.name === 'requirements' || field.name === 'acceptance_criteria') {
      data[field.name] = value
        ? value
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      continue;
    }
    if (!value) {
      if (editing) {
        data[field.name] =
          field.type === 'number' || field.type === 'date' || idFields.has(field.name)
            ? null
            : field.required
              ? ''
              : null;
      }
      continue;
    }
    data[field.name] = field.type === 'number' || idFields.has(field.name) ? Number(value) : value;
  }
  return data;
}

function Badge({ value }: { value: unknown }) {
  const raw = String(value ?? 'unknown');
  const cls = ['active', 'healthy', 'done', 'passed', 'success'].includes(raw)
    ? 'green'
    : ['blocked', 'down', 'failed', 'urgent', 'error'].includes(raw)
      ? 'red'
      : ['in_progress', 'review', 'high', 'warning', 'degraded', 'probe'].includes(raw)
        ? 'amber'
        : 'slate';
  return <span className={`badge badge-${cls}`}>{label(raw)}</span>;
}

function EmptyState({
  icon: Icon = CircleHelp,
  title,
  detail,
  action,
}: {
  icon?: typeof CircleHelp;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={22} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}

function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="notice notice-error">
      <AlertCircle size={17} />
      <div>
        <strong>Ошибка загрузки данных</strong>
        <p>{message}</p>
        {retry && (
          <button className="text-button" onClick={retry}>
            Повторить
          </button>
        )}
      </div>
    </div>
  );
}

export default function App({ profile, onLogout }: AppProps = {}) {
  const [simpleMode, setSimpleMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('botvex_simple_mode') === '1';
    } catch {
      return false;
    }
  });
  const allowedNav = nav.filter(
    (n) => sectionAllowed(profile, n.section) && (!simpleMode || SIMPLE_SECTIONS.has(n.section)),
  );
  const initialRoute = parseHashRoute();
  const initialSection = allowedNav.some((n) => n.section === initialRoute.section)
    ? initialRoute.section
    : (allowedNav[0]?.section ?? 'dashboard');

  const [section, setSection] = useState<Section>(initialSection);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(initialRoute.orderId);
  const [orderClientSeed, setOrderClientSeed] = useState<number | null>(null);
  const [focusTaskId, setFocusTaskId] = useState<number | null>(null);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashError, setDashError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [apiState, setApiState] = useState<'checking' | 'online' | 'offline'>('checking');

  // Copilot-style Qwen AI toggle (OFF by default to keep GTX 1650 VRAM free)
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus>({
    available: false,
    models: ['qwen2.5:1.5b', 'qwen2.5:3b'],
    default_model: 'qwen2.5:1.5b',
  });
  const [aiModel, setAiModel] = useState('qwen2.5:1.5b');

  // Theme Switcher (3 base + 5 enterprise + custom accent)
  const [themeId, setThemeId] = useState<ThemeId>(() => getSavedTheme());
  const [customAccent, setCustomAccent] = useState<string>(() => getSavedCustomAccent());
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickModalSection, setQuickModalSection] = useState<Section | null>(null);
  const [quickAccessClient, setQuickAccessClient] = useState<{ id: number; name: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  useEffect(() => {
    if (!quickCreateOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.quick-create-wrap')) setQuickCreateOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuickCreateOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [quickCreateOpen]);

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/v1/events/stream', { withCredentials: true });
      es.addEventListener('update', () => {
        if (document.visibilityState === 'visible') {
          setRefreshKey((k) => k + 1);
        }
      });
    } catch {
      // Fallback to interval below
    }
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setRefreshKey((k) => k + 1);
      }
    }, 30000);
    return () => {
      if (es) es.close();
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!themeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.theme-menu-wrap')) setThemeMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setThemeMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [themeMenuOpen]);

  const selectTheme = (nextTheme: ThemeId) => {
    setThemeId(nextTheme);
    applyTheme(nextTheme, customAccent);
  };

  const changeCustomAccent = (hex: string) => {
    setCustomAccent(hex);
    applyTheme(themeId, hex);
  };

  // Global Search Modal (Ctrl+K)
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GlobalSearchResult | null>(null);

  const go = useCallback(
    (s: Section, orderId: number | null = null) => {
      if (!sectionAllowed(profile, s)) return;
      setSection(s);
      setSelectedOrderId(orderId);
      setMobileOpen(false);
      const nextHash = orderId && s === 'orders' ? `#/${s}/${orderId}` : `#/${s}`;
      if (window.location.hash !== nextHash) {
        window.location.hash = nextHash;
      }
    },
    [profile],
  );

  const notify = (message: string, error = false) => setToast({ message, error });
  const refresh = () => setRefreshKey((x) => x + 1);

  useEffect(() => {
    const onHashChange = () => {
      const route = parseHashRoute();
      if (sectionAllowed(profile, route.section)) {
        setSection(route.section);
        setSelectedOrderId(route.orderId);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [profile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .get<GlobalSearchResult>(`${API}/search?q=${encodeURIComponent(searchQuery.trim())}`)
        .then(setSearchResults)
        .catch(() => setSearchResults(null));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchOpen, searchQuery]);

  const toggleSimpleMode = () => {
    const next = !simpleMode;
    setSimpleMode(next);
    try {
      localStorage.setItem('botvex_simple_mode', next ? '1' : '0');
    } catch {
      // ignore
    }
    if (next && !SIMPLE_SECTIONS.has(section)) {
      go('dashboard');
    }
    notify(next ? 'Включён простой режим интерфейса' : 'Включён полный контур управления');
  };

  const toggleQwenAi = async () => {
    if (!aiEnabled) {
      setAiEnabled(true);
      try {
        const st = await api.get<AiStatus>(`${API}/ai/status`);
        setAiStatus(st);
        if (st.default_model) setAiModel(st.default_model);
        notify(
          st.available
            ? `Qwen AI включён (${st.default_model})`
            : 'Qwen AI включён, но Ollama (11434) сейчас не запущена',
          !st.available,
        );
      } catch {
        notify('Не удалось проверить локальный Ollama', true);
      }
    } else {
      setAiEnabled(false);
      try {
        await api.post(`${API}/ai/unload`, { model: aiModel });
      } catch {
        // ignore
      }
      notify('Qwen AI отключён · VRAM освобождена');
    }
  };

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setDashError('');
    try {
      setDashboard(await api.get<DashboardData>(`${API}/dashboard`));
    } catch (e) {
      setDashError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section === 'dashboard') void loadDashboard();
  }, [loadDashboard, refreshKey, section]);

  useEffect(() => {
    let active = true;
    api
      .get<Record<string, unknown>>('/health')
      .then(() => {
        if (active) setApiState('online');
      })
      .catch(() => {
        if (active) setApiState('offline');
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const active = nav.find((n) => n.section === section) ?? allowedNav[0] ?? nav[0];

  return (
    <div className="app-shell">
      {mobileOpen && (
        <button className="mobile-backdrop" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <RoleAvatar kind="brand" label="BOTVEX" size={38} />
          <span className="brand-copy">
            <strong>BOTVEX</strong>
            <small>CONTROL CENTER</small>
          </span>
          <button
            className="icon-button sidebar-close"
            aria-label="Закрыть меню"
            onClick={() => setMobileOpen(false)}
          >
            <X size={17} />
          </button>
        </div>

        <button className="mode-switch-btn" onClick={toggleSimpleMode} title="Переключить сложность интерфейса">
          <span className="mode-switch-copy">
            <strong>{simpleMode ? 'Простой режим' : 'Полный контур'}</strong>
            <small>{simpleMode ? 'Только главные разделы' : 'Все 12 модулей системы'}</small>
          </span>
          <SlidersHorizontal size={16} />
        </button>

        <nav id="primary-navigation" className="main-nav" aria-label="Основная навигация">
          {['Рабочее пространство', 'Инфраструктура', 'Система'].map((group) => {
            const groupItems = allowedNav.filter((n) => n.group === group);
            if (!groupItems.length) return null;
            return (
              <div className="nav-group" key={group}>
                <div className="nav-group-label">{group}</div>
                {groupItems.map((n) => {
                  const Icon = n.icon;
                  return (
                    <button
                      className={`nav-item ${section === n.section ? 'nav-item-active' : ''}`}
                      key={n.section}
                      aria-current={section === n.section ? 'page' : undefined}
                      onClick={() => go(n.section)}
                    >
                      <Icon size={17} />
                      <span>{n.label}</span>
                      {n.section === 'tasks' && dashboard?.metrics.open_tasks ? (
                        <span className="nav-count">{dashboard.metrics.open_tasks}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="profile-row">
            <RoleAvatar
              kind={resolveRoleKind(profile?.roles ?? [], profile?.is_owner)}
              label={profile?.username ?? 'BOTVEX'}
              size={36}
            />
            <span>
              <strong>{profile?.username ?? 'Оператор'}</strong>
              <small>{profile?.roles.join(' · ') ?? 'Владелец'}</small>
            </span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu-button"
              aria-label={mobileOpen ? 'Закрыть меню' : 'Открыть меню'}
              onClick={() => setMobileOpen((value) => !value)}
            >
              <Menu size={18} />
            </button>
            <div className="breadcrumbs">
              <span>BOTVEX</span>
              <i>/</i>
              <strong>{active.label}</strong>
            </div>
          </div>

          <div className="topbar-right">
            <div className="quick-create-wrap">
              <button
                type="button"
                className="quick-create-btn"
                onClick={() => setQuickCreateOpen((v) => !v)}
                title="Быстрое создание"
              >
                <Plus size={14} />
                <span>Создать</span>
              </button>
              {quickCreateOpen && (
                <div className="quick-create-menu" role="menu">
                  {hasPermission(profile, 'clients:create') && (
                    <button
                      type="button"
                      className="quick-create-item"
                      onClick={() => {
                        setQuickCreateOpen(false);
                        go('clients');
                        setQuickModalSection('clients');
                      }}
                    >
                      <Users size={14} /> Новый клиент
                    </button>
                  )}
                  {hasPermission(profile, 'orders:create') && (
                    <button
                      type="button"
                      className="quick-create-item"
                      onClick={() => {
                        setQuickCreateOpen(false);
                        go('orders');
                      }}
                    >
                      <BriefcaseBusiness size={14} /> Новый заказ
                    </button>
                  )}
                  {hasPermission(profile, 'tasks:create') && (
                    <button
                      type="button"
                      className="quick-create-item"
                      onClick={() => {
                        setQuickCreateOpen(false);
                        go('tasks');
                        setQuickModalSection('tasks');
                      }}
                    >
                      <CheckCircle2 size={14} /> Новая задача
                    </button>
                  )}
                  {hasPermission(profile, 'services:create') && (
                    <button
                      type="button"
                      className="quick-create-item"
                      onClick={() => {
                        setQuickCreateOpen(false);
                        go('services');
                        setQuickModalSection('services');
                      }}
                    >
                      <Bot size={14} /> Новый бот / сервис
                    </button>
                  )}
                </div>
              )}
            </div>

            <button className="search-trigger" onClick={() => setSearchOpen(true)} title="Глобальный поиск (Ctrl+K)">
              <Search size={14} />
              <span>Поиск…</span>
              <kbd>Ctrl K</kbd>
            </button>

            <span className={`connection-dot ${apiState}`} title="Состояние API">
              <i />
              <span>{apiState === 'online' ? 'Онлайн' : apiState === 'offline' ? 'Оффлайн' : '…'}</span>
            </span>

            {aiEnabled && (
              <select
                aria-label="Модель Qwen"
                className="ai-model-select"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
              >
                {(aiStatus.models.length ? aiStatus.models : ['qwen2.5:1.5b', 'qwen2.5:3b']).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}

            <button
              className={`ai-pill ${aiEnabled ? (aiStatus.available ? 'ai-pill-on' : 'ai-pill-on ai-pill-warn') : ''}`}
              onClick={() => void toggleQwenAi()}
              title={aiEnabled ? 'Нажмите, чтобы выгрузить Qwen из VRAM' : 'Включить локальный Qwen AI'}
            >
              <Sparkles size={14} />
              <span className="ai-dot" />
              <span>Qwen</span>
            </button>

            <button className="topbar-icon" aria-label="Обновить" onClick={refresh}>
              <RefreshCw size={15} />
            </button>
            <div className="theme-menu-wrap">
              <button
                type="button"
                className="topbar-icon"
                aria-label="Выбор темы оформления"
                title="Тема и цвета интерфейса"
                onClick={() => setThemeMenuOpen((v) => !v)}
              >
                <Palette size={16} />
              </button>
              {themeMenuOpen && (
                <div className="theme-popover" role="dialog" aria-label="Темы оформления">
                  <div className="theme-popover-title">Базовые темы</div>
                  {THEME_PRESETS.filter((p) => p.group === 'base').map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`theme-option ${themeId === preset.id ? 'theme-option-active' : ''}`}
                      onClick={() => selectTheme(preset.id)}
                    >
                      <span className="theme-swatch" style={{ background: preset.previewBg }}>
                        <i style={{ background: preset.previewAccent }} />
                      </span>
                      <span className="theme-option-copy">
                        <strong>{preset.name}</strong>
                        <small>{preset.subtitle}</small>
                      </span>
                    </button>
                  ))}
                  <div className="theme-popover-title">Стили технологических компаний</div>
                  {THEME_PRESETS.filter((p) => p.group === 'enterprise').map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`theme-option ${themeId === preset.id ? 'theme-option-active' : ''}`}
                      onClick={() => selectTheme(preset.id)}
                    >
                      <span className="theme-swatch" style={{ background: preset.previewBg }}>
                        <i style={{ background: preset.previewAccent }} />
                      </span>
                      <span className="theme-option-copy">
                        <strong>{preset.name}</strong>
                        <small>{preset.subtitle}</small>
                      </span>
                    </button>
                  ))}
                  <div className="theme-custom-row">
                    <span>Свой цвет акцента</span>
                    <div className="theme-custom-controls">
                      <input
                        type="color"
                        className="theme-color-input"
                        aria-label="Кастомный цвет акцента"
                        value={customAccent || '#6366f1'}
                        onChange={(e) => changeCustomAccent(e.target.value)}
                      />
                      {customAccent && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => changeCustomAccent('')}
                        >
                          Сброс
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {onLogout && (
              <button
                className="secondary-button"
                onClick={() =>
                  setConfirmDialog({
                    title: 'Выйти из аккаунта?',
                    message: 'Текущий сеанс будет завершён. Для повторного входа потребуется авторизация.',
                    confirmLabel: 'Да, выйти',
                    danger: true,
                    onConfirm: () => {
                      setConfirmDialog(null);
                      onLogout();
                    },
                  })
                }
              >
                Выйти
              </button>
            )}
          </div>
        </header>

        <div className="content-area">
          <div className="page-heading">
            <div>
              <div className="eyebrow">BOTVEX CONTROL CENTER</div>
              <h1>
                {section === 'dashboard'
                  ? 'Панель управления'
                  : section === 'access'
                    ? 'Пользователи и доступ'
                    : active.label}
              </h1>
              <p>
                {section === 'dashboard'
                  ? 'Оперативная сводка по клиентам, заказам, задачам и ботам'
                  : section === 'orders'
                    ? 'Коммерческие договорённости, файлы, этапы и расчёты'
                    : `Управление разделом «${active.label.toLowerCase()}»`}
              </p>
            </div>
            {section !== 'dashboard' &&
            section !== 'activity' &&
            section !== 'settings' &&
            section !== 'orders' &&
            section !== 'access' &&
            sectionActionAllowed(profile, section, 'create') ? (
              <button
                className="primary-button"
                onClick={() => window.dispatchEvent(new CustomEvent('botvex:create'))}
              >
                <Plus size={16} />
                Добавить
              </button>
            ) : null}
          </div>

          {section === 'dashboard' ? (
            <Dashboard
              data={dashboard}
              loading={loading}
              error={dashError}
              go={go}
              onOpenTask={(id) => {
                setFocusTaskId(id);
                go('tasks');
              }}
              retry={() => void loadDashboard()}
              aiEnabled={aiEnabled}
              aiModel={aiModel}
            />
          ) : section === 'activity' ? (
            <ActivityPage key={refreshKey} />
          ) : section === 'settings' ? (
            <SettingsPage notify={notify} statusLabel={label} />
          ) : section === 'orders' && profile ? (
            <OrdersPage
              key={`${refreshKey}-${orderClientSeed ?? 'all'}`}
              profile={profile}
              notify={notify}
              initialOrderId={selectedOrderId}
              initialClientId={orderClientSeed}
              aiEnabled={aiEnabled}
              aiModel={aiModel}
            />
          ) : section === 'access' && profile ? (
            <AdminAccessPage key={refreshKey} profile={profile} notify={notify} />
          ) : (
            <ResourcePage
              key={`${section}-${refreshKey}`}
              config={configs[section as keyof typeof configs]}
              profile={profile}
              refresh={refresh}
              notify={notify}
              focusTaskId={focusTaskId}
              clearFocusTask={() => setFocusTaskId(null)}
              onCreateOrderForClient={(clientId) => {
                setOrderClientSeed(clientId);
                go('orders');
              }}
              onGrantPortalAccess={
                hasPermission(profile, 'admin:users:create')
                  ? (client) => setQuickAccessClient(client)
                  : undefined
              }
              aiEnabled={aiEnabled}
              autoOpenCreate={quickModalSection === section}
              onAutoCreateConsumed={() => setQuickModalSection(null)}
            />
          )}

          <footer className="page-footer">
            <span>BOTVEX Control Center · v0.2.0</span>
            <span>RBAC + SQLite WAL</span>
          </footer>
        </div>
      </main>

      <nav className="mobile-bottom-bar" aria-label="Быстрая навигация">
        {[
          { section: 'dashboard' as Section, label: 'Обзор', icon: LayoutDashboard },
          { section: 'orders' as Section, label: 'Заказы', icon: BriefcaseBusiness },
          { section: 'tasks' as Section, label: 'Задачи', icon: CheckCircle2 },
          { section: 'services' as Section, label: 'Боты', icon: Bot },
        ]
          .filter((item) => sectionAllowed(profile, item.section))
          .map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.section}
                className={`mobile-bottom-btn ${section === item.section ? 'active' : ''}`}
                onClick={() => go(item.section)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
      </nav>

      {searchOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSearchOpen(false);
          }}
        >
          <section className="modal-card" role="dialog" aria-modal="true" aria-label="Глобальный поиск">
            <div className="modal-heading">
              <div className="search-field" style={{ maxWidth: 'none', border: 0, padding: 0 }}>
                <Search size={17} />
                <input
                  autoFocus
                  placeholder="Поиск по клиентам, заказам, проектам, задачам и ботам…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button className="icon-button" onClick={() => setSearchOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 18 }}>
              {!searchQuery.trim() ? (
                <p className="field-hint">Начните вводить запрос…</p>
              ) : !searchResults ? (
                <p className="field-hint">Поиск…</p>
              ) : (
                <div className="activity-list" style={{ padding: 0 }}>
                  {(['orders', 'clients', 'tasks', 'projects', 'services'] as const).flatMap((group) =>
                    (searchResults[group] || []).map((hit) => (
                      <button
                        key={`${group}-${hit.id}`}
                        className="activity-row clickable-row"
                        onClick={() => {
                          setSearchOpen(false);
                          if (group === 'orders') go('orders', hit.id);
                          else go(group as Section);
                        }}
                      >
                        <span className="badge badge-slate">{group}</span>
                        <div className="row-info">
                          <strong>{hit.title}</strong>
                          <small className="mono">#{hit.id}</small>
                        </div>
                        <ArrowUpRight size={15} />
                      </button>
                    )),
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <ConfirmModal dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />

      {quickAccessClient && (
        <QuickClientAccessModal
          client={quickAccessClient}
          onClose={() => setQuickAccessClient(null)}
          notify={notify}
        />
      )}

      {toast && (
        <div className={`toast ${toast.error ? 'toast-error' : ''}`} role="status">
          {toast.error ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
          <span>{toast.message}</span>
          <button aria-label="Закрыть" onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function Dashboard({
  data,
  loading,
  error,
  go,
  onOpenTask,
  retry,
  aiEnabled,
  aiModel,
}: {
  data: DashboardData | null;
  loading: boolean;
  error: string;
  go: (s: Section) => void;
  onOpenTask: (taskId: number) => void;
  retry: () => void;
  aiEnabled: boolean;
  aiModel: string;
}) {
  const [aiSummary, setAiSummary] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const runSummary = async () => {
    setAiBusy(true);
    try {
      const res = await api.post<{ model: string; reply: string }>(`${API}/ai/assist`, {
        task: 'daily_summary',
        model: aiModel,
      });
      setAiSummary(res.reply);
    } catch (e) {
      setAiSummary(e instanceof Error ? e.message : 'Локальный Qwen недоступен');
    } finally {
      setAiBusy(false);
    }
  };

  const metrics = data?.metrics;
  const cards = [
    { label: 'Клиенты', value: metrics?.clients ?? 0, icon: Users, tone: 'blue', section: 'clients' as Section, foot: 'В базе' },
    { label: 'Проекты', value: metrics?.projects ?? 0, icon: BriefcaseBusiness, tone: 'violet', section: 'projects' as Section, foot: 'Активные' },
    { label: 'Открытые задачи', value: metrics?.open_tasks ?? 0, icon: CheckCircle2, tone: 'amber', section: 'tasks' as Section, foot: 'В работе' },
    { label: 'Боты и сервисы', value: metrics?.services ?? 0, icon: Bot, tone: 'green', section: 'services' as Section, foot: 'Узлы' },
  ];

  if (loading && !data) {
    return (
      <div className="loading">
        <LoaderCircle className="spin" size={24} /> Загрузка панели…
      </div>
    );
  }
  if (error && !data) return <ErrorNotice message={error} retry={retry} />;

  return (
    <div className="dashboard-layout">
      <section className="metrics-grid">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button key={card.label} className="metric-card" onClick={() => go(card.section)}>
              <div className="metric-head">
                <span>{card.label}</span>
                <i className={`metric-icon ${card.tone}`}>
                  <Icon size={18} />
                </i>
              </div>
              <strong className="metric-value">{card.value}</strong>
              <div className="metric-foot">
                <span>{card.foot}</span>
                <span>
                  Открыть <ArrowUpRight size={13} />
                </span>
              </div>
            </button>
          );
        })}
      </section>

      {aiEnabled && (
        <section className="panel" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <strong style={{ fontSize: 15 }}>Ассистент Qwen ({aiModel})</strong>
              <p className="field-hint" style={{ margin: '2px 0 0' }}>
                Анализ приоритетов по открытым задачам (GTX 1650 · num_ctx=2048)
              </p>
            </div>
            <button className="primary-button compact" disabled={aiBusy} onClick={() => void runSummary()}>
              <Sparkles size={14} /> {aiBusy ? 'Анализ…' : 'Сводка дня'}
            </button>
          </div>
          {aiSummary && <div className="ai-result-box">{aiSummary}</div>}
        </section>
      )}

      <div className="dashboard-columns">
        <section className="panel">
          <PanelHeading
            title="Ближайшие задачи"
            subtitle="Нажмите на задачу для редактирования"
            action={
              <button className="text-button" onClick={() => go('tasks')}>
                Все <ArrowDownRight size={13} />
              </button>
            }
          />
          {data?.next_tasks.length ? (
            <div className="task-list">
              {data.next_tasks.map((task) => {
                const overdue = isOverdue(task.due_date, task.status);
                return (
                  <button className="task-row clickable-row" key={task.id} onClick={() => onOpenTask(task.id)}>
                    <span className="task-check">{task.status === 'done' ? <Check size={12} /> : null}</span>
                    <div className="row-info">
                      <strong>{task.title}</strong>
                      <small style={overdue ? { color: 'var(--danger)' } : undefined}>
                        {overdue ? 'Просрочено · ' : ''}
                        {task.due_date ? `Срок: ${fmtDate(task.due_date)}` : 'Без срока'}
                      </small>
                    </div>
                    <Badge value={task.status} />
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="Нет открытых задач"
              detail="Создайте задачу, чтобы зафиксировать следующий шаг."
              action={
                <button className="secondary-button" onClick={() => go('tasks')}>
                  <Plus size={14} /> Создать задачу
                </button>
              }
            />
          )}
        </section>

        <section className="panel">
          <PanelHeading
            title="Боты и сервисы"
            subtitle="Нажмите для перехода к управлению"
            action={
              <button className="icon-button" aria-label="Открыть сервисы" onClick={() => go('services')}>
                <ArrowUpRight size={15} />
              </button>
            }
          />
          {data?.service_summary.length ? (
            <div className="service-list">
              {data.service_summary.map((s) => (
                <button className="service-row clickable-row" key={s.id} onClick={() => go('services')}>
                  <span className="service-icon">
                    <Bot size={16} />
                  </span>
                  <div className="row-info">
                    <strong>{s.name}</strong>
                    <small>
                      {s.last_checked_at
                        ? `Обновлено: ${fmtDateTime(s.last_checked_at)}`
                        : 'Проверка не запускалась'}
                    </small>
                  </div>
                  <Badge value={s.status} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Bot}
              title="Сервисы не добавлены"
              detail="Добавьте Telegram-бота или API для контроля."
              action={
                <button className="secondary-button" onClick={() => go('services')}>
                  <Plus size={14} /> Добавить
                </button>
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}

function PanelHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function ResourcePage({
  config,
  profile,
  refresh,
  notify,
  focusTaskId,
  clearFocusTask,
  onCreateOrderForClient,
  onGrantPortalAccess,
  aiEnabled,
  autoOpenCreate,
  onAutoCreateConsumed,
}: {
  config: Config;
  profile?: AuthUser;
  refresh: () => void;
  notify: (message: string, error?: boolean) => void;
  focusTaskId: number | null;
  clearFocusTask: () => void;
  onCreateOrderForClient: (clientId: number) => void;
  onGrantPortalAccess?: (client: { id: number; name: string }) => void;
  aiEnabled?: boolean;
  autoOpenCreate?: boolean;
  onAutoCreateConsumed?: () => void;
}) {
  const PAGE_SIZE = 50;
  const [items, setItems] = useState<Entity[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: number; name: string }>>([]);
  const [services, setServices] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; item?: Entity } | null>(null);
  const [runTarget, setRunTarget] = useState<Entity | null>(null);
  const [membersTarget, setMembersTarget] = useState<Entity | null>(null);
  const [rpConfirm, setRpConfirm] = useState<ConfirmDialogState | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [sortDue, setSortDue] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');

  const resource = resourceForSection(config.section);
  const mayCreate = !!resource && sectionActionAllowed(profile, config.section, 'create');
  const mayEdit = !!resource && sectionActionAllowed(profile, config.section, 'edit');
  const mayArchive = !!resource && sectionActionAllowed(profile, config.section, 'archive');
  const mayRestore = !!resource && sectionActionAllowed(profile, config.section, 'restore');
  const mayRecordRun = config.section === 'tests' && sectionActionAllowed(profile, 'tests', 'create');
  const mayAssignProject = config.section === 'projects' && hasPermission(profile, 'projects:assign');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (config.archive) qs.set('include_archived', String(showArchived));
      if (query.trim()) qs.set('q', query.trim());

      const { data, total: totalCount } = await api.getWithMeta<Entity[]>(`${config.endpoint}?${qs}`);
      setItems(data);
      setTotal(totalCount);

      if (['projects', 'tasks', 'services', 'tests', 'deployments'].includes(config.section)) {
        const [c, p] = await Promise.all([
          api.get<Array<{ id: number; name: string }>>(`${API}/clients?limit=250`).catch(() => []),
          api.get<Array<{ id: number; name: string }>>(`${API}/projects?limit=250`).catch(() => []),
        ]);
        setClients(c);
        setProjects(p);
      }
      if (config.section === 'logs') {
        const s = await api.get<Array<{ id: number; name: string }>>(`${API}/services?limit=250`).catch(() => []);
        setServices(s);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [config, offset, query, showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (autoOpenCreate && mayCreate) {
      setModal({ mode: 'create' });
      onAutoCreateConsumed?.();
    }
  }, [autoOpenCreate, mayCreate, onAutoCreateConsumed]);

  useEffect(() => {
    if (focusTaskId && config.section === 'tasks' && items.length) {
      const found = items.find((i) => i.id === focusTaskId);
      if (found) {
        setModal({ mode: 'edit', item: found });
        clearFocusTask();
      }
    }
  }, [focusTaskId, config.section, items, clearFocusTask]);

  useEffect(() => {
    const handler = () => {
      if (mayCreate) setModal({ mode: 'create' });
    };
    window.addEventListener('botvex:create', handler);
    return () => window.removeEventListener('botvex:create', handler);
  }, [mayCreate]);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s.name])), [services]);

  const resolveCell = (col: Column, item: Entity) => {
    const raw = item[col.key];
    if (col.key === 'client_id' && typeof raw === 'number') {
      return clientMap.get(raw) || `#${raw}`;
    }
    if (col.key === 'project_id' && typeof raw === 'number') {
      return projectMap.get(raw) || `#${raw}`;
    }
    if (col.key === 'service_id' && typeof raw === 'number') {
      return serviceMap.get(raw) || `#${raw}`;
    }
    return col.format ? col.format(raw, item) : String(raw ?? '—');
  };

  const fields = useMemo(
    () =>
      config.fields.map((field) => {
        if (field.name === 'client_id') {
          return {
            ...field,
            options: [{ value: '', label: 'Без клиента' }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))],
          };
        }
        if (field.name === 'project_id' && field.type === 'select') {
          return {
            ...field,
            options: [{ value: '', label: 'Без проекта' }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))],
          };
        }
        if (field.name === 'service_id' && field.type === 'select') {
          return {
            ...field,
            options: [{ value: '', label: 'Без сервиса' }, ...services.map((s) => ({ value: String(s.id), label: s.name }))],
          };
        }
        return field;
      }),
    [config.fields, clients, projects, services],
  );

  const visible = useMemo(() => {
    let list = items;
    if (config.section === 'tasks') {
      if (statusFilter !== 'all') list = list.filter((i) => i.status === statusFilter);
      if (priorityFilter !== 'all') list = list.filter((i) => i.priority === priorityFilter);
      if (projectFilter !== 'all') list = list.filter((i) => String(i.project_id ?? '') === projectFilter);
      if (sortDue) {
        list = [...list].sort((a, b) => String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999')));
      }
    }
    return list;
  }, [items, config.section, statusFilter, priorityFilter, projectFilter, sortDue]);

  const save = async (values: Record<string, string>) => {
    setSaving(true);
    try {
      const data = formPayload(values, fields, modal?.mode === 'edit');
      if (modal?.mode === 'edit' && modal.item) {
        await api.patch(`${config.endpoint}/${modal.item.id}`, data);
      } else {
        await api.post(config.endpoint, data);
      }
      setModal(null);
      await load();
      refresh();
      notify(modal?.mode === 'edit' ? 'Сохранено' : 'Создано');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Ошибка сохранения', true);
    } finally {
      setSaving(false);
    }
  };

  const archive = (item: Entity) => {
    const name = String(item.name ?? item.title ?? item.version ?? `#${item.id}`);
    setRpConfirm({
      title: 'Отправить в архив?',
      message: `Вы точно хотите архивировать «${name}»?`,
      confirmLabel: 'Архивировать',
      danger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          await api.post(`${config.endpoint}/${item.id}/archive`, {});
          setRpConfirm(null);
          await load();
          refresh();
          notify('Архивировано');
        } catch (e) {
          notify(e instanceof Error ? e.message : 'Ошибка архивации', true);
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const syncClientTelegram = async (item: Entity) => {
    setBusy(true);
    try {
      const res = await api.post<{ telegram_username?: string | null; full_name?: string | null }>(
        `${API}/clients/${item.id}/sync-telegram`,
        {},
      );
      await load();
      refresh();
      notify(`Telegram обновлён: ${res.telegram_username || res.full_name || 'данные актуальны'}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Не удалось обновить данные из Telegram', true);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (item: Entity) => {
    setBusy(true);
    try {
      await api.post(`${config.endpoint}/${item.id}/restore`, {});
      await load();
      refresh();
      notify('Восстановлено');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Ошибка восстановления', true);
    } finally {
      setBusy(false);
    }
  };

  const probeService = async (item: Entity) => {
    setBusy(true);
    try {
      const updated = await api.post<Entity>(`${API}/services/${item.id}/probe`, {});
      await load();
      refresh();
      notify(`Узел проверен: ${label(updated.status)}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Ошибка проверки', true);
    } finally {
      setBusy(false);
    }
  };

  const toggleService = async (item: Entity) => {
    const nextAction = item.is_enabled === false ? 'start' : 'stop';
    setBusy(true);
    try {
      await api.post<Entity>(`${API}/services/${item.id}/toggle`, { action: nextAction });
      await load();
      refresh();
      notify(nextAction === 'start' ? 'Сервис включён' : 'Сервис остановлен');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Ошибка переключения', true);
    } finally {
      setBusy(false);
    }
  };

  const breakdownProjectWithQwen = async (project: Entity) => {
    setBusy(true);
    try {
      const res = await api.post<{ text: string }>(`${API}/ai/assist`, {
        task: 'breakdown_tasks',
        project_id: project.id,
        prompt_hint: String(project.description || project.name || ''),
      });
      const lines = res.text
        .split('\n')
        .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
        .filter((l) => l.length >= 4 && l.length <= 160)
        .slice(0, 8);
      if (!lines.length) {
        notify('Qwen не вернул список задач', true);
        return;
      }
      for (const title of lines) {
        await api.post(`${API}/tasks`, {
          title,
          project_id: project.id,
          status: 'todo',
          priority: 'normal',
        });
      }
      refresh();
      notify(`Создано задач из Qwen: ${lines.length}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Ошибка генерации задач через Qwen', true);
    } finally {
      setBusy(false);
    }
  };

  const quickTaskStatus = async (task: Entity, nextStatus: string) => {
    setBusy(true);
    try {
      await api.patch(`${API}/tasks/${task.id}`, { status: nextStatus });
      await load();
      refresh();
      notify(`Статус: ${label(nextStatus)}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Ошибка обновления', true);
    } finally {
      setBusy(false);
    }
  };

  const recordRun = async (values: { status: string; duration_ms: number | null; note: string }) => {
    if (!runTarget) return;
    setSaving(true);
    try {
      await api.post(`${API}/test-suites/${runTarget.id}/runs`, { ...values, source: 'manual' });
      setRunTarget(null);
      await load();
      refresh();
      notify('Результат записан');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Ошибка сохранения', true);
    } finally {
      setSaving(false);
    }
  };

  const titleKey = fields.find((f) => ['name', 'title', 'version'].includes(f.name))?.name || 'id';
  const taskStages = ['backlog', 'in_progress', 'blocked', 'review', 'done'] as const;

  return (
    <div className="resource-layout">
      <section className="panel resource-panel">
        <div className="resource-toolbar">
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label="Поиск"
              placeholder="Поиск…"
              value={query}
              onChange={(e) => {
                setOffset(0);
                setQuery(e.target.value);
              }}
            />
          </div>
          <div className="toolbar-right">
            <span className="result-count">{total} записей</span>
            {config.section === 'tasks' && (
              <div className="access-tabs">
                <button
                  type="button"
                  className={viewMode === 'table' ? 'access-tab access-tab-active' : 'access-tab'}
                  onClick={() => setViewMode('table')}
                >
                  Таблица
                </button>
                <button
                  type="button"
                  className={viewMode === 'kanban' ? 'access-tab access-tab-active' : 'access-tab'}
                  onClick={() => setViewMode('kanban')}
                >
                  Канбан
                </button>
              </div>
            )}
            {config.archive && (
              <label className="sort-due">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                Архив
              </label>
            )}
            {mayCreate && (
              <button className="primary-button compact" onClick={() => setModal({ mode: 'create' })}>
                <Plus size={15} /> Добавить
              </button>
            )}
          </div>

          {config.section === 'tasks' && (
            <div className="task-filters">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">Все статусы</option>
                {taskStages.map((v) => <option key={v} value={v}>{label(v)}</option>)}
              </select>
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                <option value="all">Все приоритеты</option>
                {['low', 'normal', 'high', 'urgent'].map((v) => <option key={v} value={v}>{label(v)}</option>)}
              </select>
              <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
                <option value="all">Все проекты</option>
                {projects.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
              </select>
              <label className="sort-due">
                <input type="checkbox" checked={sortDue} onChange={(e) => setSortDue(e.target.checked)} />
                По сроку
              </label>
            </div>
          )}
        </div>

        {error ? (
          <ErrorNotice message={error} retry={() => void load()} />
        ) : loading ? (
          <div className="loading">
            <LoaderCircle className="spin" size={22} /> Загрузка…
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={config.icon}
            title="Пока пусто"
            detail="Записи в этом разделе ещё не добавлены."
            action={
              mayCreate ? (
                <button className="secondary-button" onClick={() => setModal({ mode: 'create' })}>
                  <Plus size={14} /> Добавить {config.singular}
                </button>
              ) : undefined
            }
          />
        ) : config.section === 'tasks' && viewMode === 'kanban' ? (
          <div className="kanban-board">
            {taskStages.map((stage) => {
              const stageTasks = visible.filter((t) => t.status === stage);
              return (
                <div className="kanban-column" key={stage}>
                  <div className="kanban-column-head">
                    <strong>{label(stage)}</strong>
                    <span className="nav-count">{stageTasks.length}</span>
                  </div>
                  <div className="kanban-cards">
                    {stageTasks.map((t) => (
                      <div className="kanban-card" key={t.id}>
                        <button
                          type="button"
                          style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left' }}
                          onClick={() => mayEdit && !t.is_archived && setModal({ mode: 'edit', item: t })}
                        >
                          <strong>{String(t.title)}</strong>
                        </button>
                        <small>
                          {typeof t.project_id === 'number' ? projectMap.get(t.project_id) || `#${t.project_id}` : 'Без проекта'} ·{' '}
                          {fmtDate(t.due_date)}
                        </small>
                        <div className="kanban-card-foot">
                          <Badge value={t.priority} />
                          {mayEdit && !t.is_archived && (
                            <select value={String(t.status)} disabled={busy} onChange={(e) => void quickTaskStatus(t, e.target.value)}>
                              {taskStages.map((st) => <option key={st} value={st}>{label(st)}</option>)}
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {config.columns.map((c) => <th key={c.key}>{c.label}</th>)}
                  <th className="actions-head">Действия</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td className="primary-cell" data-label={config.columns[0]?.label}>
                      <span className="row-main-icon">{initials(String(item[titleKey] ?? `#${item.id}`))}</span>
                      <span>
                        <strong>{String(item[titleKey] ?? `#${item.id}`)}</strong>
                        <small>#{item.id}</small>
                      </span>
                    </td>
                    {config.columns.slice(1).map((c) => (
                      <td key={c.key} data-label={c.label}>
                        {['client_id', 'project_id', 'service_id'].includes(c.key) ? (
                          <span className="cell-text">{resolveCell(c, item)}</span>
                        ) : c.key === 'status' || c.key === 'priority' ? (
                          <Badge value={item[c.key]} />
                        ) : c.format ? (
                          c.format(item[c.key], item)
                        ) : (
                          <span className="cell-text">{String(item[c.key] ?? '—')}</span>
                        )}
                      </td>
                    ))}
                    <td data-label="Действия">
                      <div className="row-actions">
                        {config.section === 'clients' && !item.is_archived && (
                          <>
                            <button
                              className="icon-button row-action"
                              title="Создать заказ для клиента"
                              onClick={() => onCreateOrderForClient(item.id)}
                            >
                              <Plus size={14} />
                            </button>
                            {onGrantPortalAccess && (
                              <button
                                className="icon-button row-action"
                                title="Выдать доступ в клиентский портал"
                                onClick={() =>
                                  onGrantPortalAccess({
                                    id: Number(item.id),
                                    name: String(item.name ?? `Клиент #${item.id}`),
                                  })
                                }
                              >
                                <KeyRound size={14} />
                              </button>
                            )}
                            {mayEdit && (
                              <button
                                className="icon-button row-action"
                                title="Обновить @username и имя из Telegram"
                                disabled={busy}
                                onClick={() => void syncClientTelegram(item)}
                              >
                                <AtSign size={14} />
                              </button>
                            )}
                          </>
                        )}
                        {mayAssignProject && !item.is_archived && (
                          <button
                            className="icon-button row-action"
                            title="Участники проекта"
                            onClick={() => setMembersTarget(item)}
                          >
                            <Users size={14} />
                          </button>
                        )}
                        {config.section === 'projects' && aiEnabled && !item.is_archived && (
                          <button
                            className="icon-button row-action"
                            title="Разбить проект на задачи через Qwen (1 клик)"
                            disabled={busy}
                            onClick={() => void breakdownProjectWithQwen(item)}
                          >
                            <Sparkles size={14} />
                          </button>
                        )}
                        {config.section === 'services' && mayEdit && !item.is_archived && (
                          <>
                            <button
                              className="icon-button row-action"
                              title={item.is_enabled === false ? 'Включить' : 'Выключить'}
                              disabled={busy}
                              onClick={() => void toggleService(item)}
                            >
                              <Power size={14} />
                            </button>
                            <button
                              className="icon-button row-action"
                              title="Проверить узел (HTTP probe)"
                              disabled={busy}
                              onClick={() => void probeService(item)}
                            >
                              <Activity size={14} />
                            </button>
                          </>
                        )}
                        {mayEdit && !item.is_archived && (
                          <button className="icon-button row-action" title="Редактировать" onClick={() => setModal({ mode: 'edit', item })}>
                            <Settings2 size={14} />
                          </button>
                        )}
                        {mayRecordRun && !item.is_archived && (
                          <button className="icon-button row-action" title="Записать прогон" onClick={() => setRunTarget(item)}>
                            <FlaskConical size={14} />
                          </button>
                        )}
                        {config.archive && mayArchive && !item.is_archived && (
                          <button className="icon-button row-action" title="В архив" disabled={busy} onClick={() => archive(item)}>
                            <Archive size={14} />
                          </button>
                        )}
                        {config.archive && mayRestore && item.is_archived === true && (
                          <button className="icon-button row-action" title="Восстановить" disabled={busy} onClick={() => void restore(item)}>
                            <RefreshCw size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="table-footer">
          <span>
            Показано {visible.length} из {total}
          </span>
          {total > PAGE_SIZE && (
            <div className="access-user-actions">
              <button className="secondary-button" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
                Назад
              </button>
              <button className="secondary-button" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((o) => o + PAGE_SIZE)}>
                Дальше
              </button>
            </div>
          )}
        </div>
      </section>

      {modal && (
        <EntityModal
          key={`${modal.mode}-${modal.item?.id ?? 'new'}`}
          title={modal.mode === 'edit' ? 'Редактировать' : `Добавить ${config.singular}`}
          fields={fields}
          initial={formValues(modal.item, fields)}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={save}
        />
      )}
      {runTarget && (
        <TestRunModal
          suiteId={Number(runTarget.id)}
          name={String(runTarget.name ?? 'Тест')}
          saving={saving}
          onClose={() => setRunTarget(null)}
          onSave={recordRun}
        />
      )}
      <ConfirmModal dialog={rpConfirm} busy={busy} onClose={() => setRpConfirm(null)} />

      {membersTarget && (
        <ProjectMembersModal
          projectId={Number(membersTarget.id)}
          projectName={String(membersTarget.name ?? `#${membersTarget.id}`)}
          onClose={() => setMembersTarget(null)}
          notify={notify}
        />
      )}
    </div>
  );
}

function ProjectMembersModal({
  projectId,
  projectName,
  onClose,
  notify,
}: {
  projectId: number;
  projectName: string;
  onClose: () => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const [members, setMembers] = useState<ProjectAssignment[]>([]);
  const [users, setUsers] = useState<Array<{ id: number; username: string; roles: string[]; is_active: boolean }>>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [m, u] = await Promise.all([
        api.get<ProjectAssignment[]>(`${API}/admin/projects/${projectId}/members`),
        api
          .get<{ items: Array<{ id: number; username: string; roles: string[]; is_active: boolean }> }>(
            `${API}/admin/users?limit=100`,
          )
          .then((r) => r.items)
          .catch(() => []),
      ]);
      setMembers(m);
      setUsers(u.filter((usr) => usr.is_active && !usr.roles.includes('client')));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки команды.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(e: FormEvent) {
    e.preventDefault();
    if (!selectedUserId) return;
    setBusy(true);
    try {
      await api.post(`${API}/admin/projects/${projectId}/members`, { user_id: Number(selectedUserId) });
      setSelectedUserId('');
      await load();
      notify('Сотрудник назначен');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка назначения.');
    } finally {
      setBusy(false);
    }
  }

  async function unassign(userId: number) {
    setBusy(true);
    try {
      await api.delete(`${API}/admin/projects/${projectId}/members/${userId}`);
      await load();
      notify('Сотрудник снят с проекта');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка.');
    } finally {
      setBusy(false);
    }
  }

  const assignedIds = new Set(members.map((m) => m.user_id));
  const availableUsers = users.filter((u) => !assignedIds.has(u.id));

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true">
        <div className="modal-heading">
          <h2>Команда: {projectName}</h2>
          <button className="icon-button" disabled={busy} onClick={onClose}><X size={17} /></button>
        </div>
        <div className="run-history">
          {error && <p className="field-error">{error}</p>}
          {loading ? (
            <p className="field-hint">Загрузка…</p>
          ) : members.length === 0 ? (
            <p className="field-hint">Участники не назначены.</p>
          ) : (
            <div className="activity-list" style={{ padding: 0 }}>
              {members.map((m) => (
                <div className="activity-row" key={m.id}>
                  <div className="row-info">
                    <strong>{m.username}</strong>
                    <small>{fmtDateTime(m.created_at)}</small>
                  </div>
                  <button className="secondary-button" disabled={busy} onClick={() => void unassign(m.user_id)}>Удалить</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <form onSubmit={assign}>
          <label className="form-field">
            <span>Назначить сотрудника</span>
            <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">Выбрать аккаунт</option>
              {availableUsers.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
          </label>
          <div className="modal-footer">
            <button type="button" className="secondary-button" onClick={onClose}>Закрыть</button>
            <button type="submit" className="primary-button" disabled={busy || !selectedUserId}>Добавить</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function EntityModal({
  title,
  fields,
  initial,
  saving,
  onClose,
  onSave,
}: {
  title: string;
  fields: Field[];
  initial: Record<string, string>;
  saving: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const result: Record<string, string> = { ...initial };
    fields.forEach((f) => {
      if (result[f.name] === undefined) result[f.name] = f.type === 'select' ? (f.options?.[0]?.value ?? '') : '';
    });
    return result;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const change = (name: string, value: string) => {
    setValues((p) => ({ ...p, [name]: value }));
    setErrors((p) => ({ ...p, [name]: '' }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.required && !values[f.name]?.trim()) next[f.name] = 'Обязательное поле';
    });
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    await onSave(values);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true">
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" disabled={saving} onClick={onClose}><X size={17} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            {fields.map((field) => (
              <label className={`form-field ${field.type === 'textarea' ? 'field-full' : ''}`} key={field.name}>
                <span>{field.label}{field.required && <i> *</i>}</span>
                {field.type === 'textarea' ? (
                  <textarea value={values[field.name] ?? ''} onChange={(e) => change(field.name, e.target.value)} rows={3} placeholder={field.placeholder} />
                ) : field.type === 'select' ? (
                  <select value={values[field.name] ?? ''} onChange={(e) => change(field.name, e.target.value)}>
                    {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                    value={values[field.name] ?? ''}
                    onChange={(e) => change(field.name, e.target.value)}
                    placeholder={field.placeholder}
                  />
                )}
                {errors[field.name] && <small className="field-error">{errors[field.name]}</small>}
                {field.hint && <small className="field-hint">{field.hint}</small>}
              </label>
            ))}
          </div>
          <div className="modal-footer">
            <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Отмена</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TestRunModal({
  suiteId,
  name,
  saving,
  onClose,
  onSave,
}: {
  suiteId: number;
  name: string;
  saving: boolean;
  onClose: () => void;
  onSave: (v: { status: string; duration_ms: number | null; note: string }) => Promise<void>;
}) {
  const [status, setStatus] = useState('passed');
  const [duration, setDuration] = useState('');
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<Array<{ id: number; status: string; source: string; duration_ms: number | null; note: string | null; created_at: string }>>([]);

  useEffect(() => {
    api.get<Array<{ id: number; status: string; source: string; duration_ms: number | null; note: string | null; created_at: string }>>(`${API}/test-suites/${suiteId}/runs`)
      .then(setHistory)
      .catch(() => undefined);
  }, [suiteId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await onSave({ status, duration_ms: duration ? Number(duration) : null, note });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true">
        <div className="modal-heading">
          <h2>Результат: {name}</h2>
          <button className="icon-button" disabled={saving} onClick={onClose}><X size={17} /></button>
        </div>
        {history.length > 0 && (
          <div className="run-history">
            <div className="activity-list" style={{ padding: 0 }}>
              {history.slice(0, 4).map((run) => (
                <div className="activity-row" key={run.id}>
                  <div className="row-info">
                    <strong>{label(run.status)}</strong>
                    <small>{run.note || '—'}</small>
                  </div>
                  <time>{fmtDateTime(run.created_at)}</time>
                </div>
              ))}
            </div>
          </div>
        )}
        <form onSubmit={submit}>
          <label className="form-field">
            <span>Статус</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="passed">Успешно</option>
              <option value="failed">Ошибка</option>
              <option value="skipped">Пропущен</option>
            </select>
          </label>
          <label className="form-field">
            <span>Длительность (мс)</span>
            <input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </label>
          <label className="form-field">
            <span>Заметка</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="modal-footer">
            <button type="button" className="secondary-button" onClick={onClose}>Отмена</button>
            <button type="submit" className="primary-button" disabled={saving}>Сохранить</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ActivityPage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    api
      .get<Array<Record<string, unknown>>>(`${API}/activity?limit=250${filter !== 'all' ? `&entity_type=${encodeURIComponent(filter)}` : ''}`)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <section className="panel">
      <div className="resource-toolbar">
        <strong style={{ fontSize: 15 }}>Журнал событий</strong>
        <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Все события</option>
          <option value="security">Безопасность</option>
          <option value="order">Заказы</option>
          <option value="service">Боты и сервисы</option>
          <option value="client">Клиенты</option>
          <option value="task">Задачи</option>
        </select>
      </div>
      {loading ? (
        <div className="loading">Загрузка…</div>
      ) : (
        <div className="activity-list">
          {items.map((item) => (
            <div className="activity-row" key={String(item.id)}>
              <span className="activity-symbol"><Activity size={15} /></span>
              <div className="row-info">
                <strong>{String(item.summary)}</strong>
                <small>{String(item.actor)} · {String(item.entity_type)}</small>
              </div>
              <time>{fmtDateTime(item.created_at)}</time>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function QuickClientAccessModal({
  client,
  onClose,
  notify,
}: {
  client: { id: number; name: string };
  onClose: () => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const suggested = `client_${client.id}`;
  const [username, setUsername] = useState(suggested);
  const [telegramId, setTelegramId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tempPassword, setTempPassword] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ temporary_password: string }>('/api/v1/admin/users', {
        username: username.trim().toLowerCase(),
        role_slugs: ['client'],
        customer_id: client.id,
        telegram_user_id: telegramId.trim() || null,
      });
      setTempPassword(res.temporary_password);
      notify(`Доступ для «${client.name}» создан`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выдать доступ');
    } finally {
      setBusy(false);
    }
  }

  async function copyCreds() {
    const text = `Логин: ${username.trim().toLowerCase()}\nВременный пароль: ${tempPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      notify('Логин и пароль скопированы');
    } catch {
      notify('Скопируйте пароль вручную', true);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <div className="modal-head">
          <div>
            <h3>Доступ в портал: {client.name}</h3>
            <p className="field-hint">Клиент увидит только свои заказы, боты и логи.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>

        {tempPassword ? (
          <div className="modal-form">
            <div className="auth-security">
              <CheckCircle2 size={16} />
              <span>Аккаунт создан. Пароль показывается один раз.</span>
            </div>
            <div className="quick-password-box">
              <span>{tempPassword}</span>
              <button type="button" className="secondary-button" onClick={() => void copyCreds()}>
                <Copy size={14} /> Скопировать
              </button>
            </div>
            <div className="modal-actions">
              <button type="button" className="primary-button" onClick={onClose}>
                Готово
              </button>
            </div>
          </div>
        ) : (
          <form className="modal-form" onSubmit={submit}>
            {error && <div className="notice-error">{error}</div>}
            <label className="form-field">
              <span>Логин для входа</span>
              <input
                required
                minLength={3}
                maxLength={64}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Telegram User ID (необязательно)</span>
              <input
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                placeholder="Например: 123456789"
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={onClose}>
                Отмена
              </button>
              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? 'Создание…' : 'Выдать доступ'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
