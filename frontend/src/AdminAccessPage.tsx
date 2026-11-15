import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Copy,
  History,
  AtSign,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { api } from './api';
import { RoleAvatar, resolveRoleKind } from './RoleAvatar';
import ConfirmModal, { type ConfirmDialogState } from './ConfirmModal';
import type { AuthUser } from './types';

type Props = {
  profile: AuthUser;
  notify: (message: string, error?: boolean) => void;
};

type Role = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  users_count: number;
  permissions: Record<string, string>;
};

type Permission = {
  key: string;
  description: string;
};

type UserRow = {
  id: number;
  username: string;
  roles: string[];
  permissions: Record<string, string>;
  customer_id: number | null;
  telegram_user_id: string | null;
  is_active: boolean;
  is_owner: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
};

type SessionRow = {
  id: number;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  user_agent: string | null;
  is_active: boolean;
  is_current: boolean;
};

type Client = {
  id: number;
  name: string;
};

type Scope = 'all' | 'assigned' | 'own_customer';

const scopeLabels: Record<Scope, string> = {
  all: 'Все записи',
  assigned: 'Назначенные записи',
  own_customer: 'Собственный клиент',
};

const can = (u: AuthUser, key: string) =>
  u.is_owner || u.permissions['*'] === 'all' || Object.prototype.hasOwnProperty.call(u.permissions, key);

export default function AdminAccessPage({ profile, notify }: Props) {
  const [tab, setTab] = useState<'users' | 'roles'>(can(profile, 'admin:users:view') ? 'users' : 'roles');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [sessionTarget, setSessionTarget] = useState<UserRow | null>(null);
  const [sessionRows, setSessionRows] = useState<SessionRow[]>([]);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState('');

  const [newUser, setNewUser] = useState(false);
  const [username, setUsername] = useState('');
  const [newRole, setNewRole] = useState('manager');
  const [customerId, setCustomerId] = useState('');
  const [newTelegramId, setNewTelegramId] = useState('');
  const [userBusy, setUserBusy] = useState(false);
  const [userFilter, setUserFilter] = useState<'all' | 'staff' | 'clients'>('all');
  const [userSearch, setUserSearch] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [temporaryCredential, setTemporaryCredential] = useState<{ username: string; password: string } | null>(null);

  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState('manager');
  const [editCustomer, setEditCustomer] = useState('');
  const [editTelegramId, setEditTelegramId] = useState('');

  const [roleEdit, setRoleEdit] = useState<Role | null>(null);
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleSlug, setRoleSlug] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [matrix, setMatrix] = useState<Record<string, Scope | ''>>({});
  const [roleBusy, setRoleBusy] = useState(false);

  const mayViewUsers = can(profile, 'admin:users:view');
  const mayCreateUsers = can(profile, 'admin:users:create');
  const mayEditUsers = can(profile, 'admin:users:edit');
  const maySuspend = can(profile, 'admin:users:suspend');
  const mayDeleteUsers = can(profile, 'admin:users:delete');
  const mayReset = can(profile, 'admin:users:reset_password');
  const maySessions = can(profile, 'admin:users:sessions');
  const mayViewRoles = can(profile, 'admin:roles:view');
  const mayCreateRoles = can(profile, 'admin:roles:create');
  const mayEditRoles = can(profile, 'admin:roles:edit');

  const isOwnerOnlyPermission = (key: string) =>
    key.startsWith('admin:') || key === 'settings:view' || key === 'settings:edit';

  const assignableRoles = roles.filter(
    (role) =>
      role.is_active &&
      role.slug !== 'owner' &&
      (profile.is_owner || (role.is_system && !Object.keys(role.permissions).some(isOwnerOnlyPermission))),
  );

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    const params = new URLSearchParams({ limit: '50', offset: String(offset) });
    if (query) params.set('q', query);
    try {
      const jobs: Promise<unknown>[] = [];
      if (mayViewUsers) {
        jobs.push(api.get<{ items: UserRow[]; total: number }>(`/api/v1/admin/users?${params}`));
      } else {
        jobs.push(Promise.resolve({ items: [], total: 0 }));
      }
      if (mayViewRoles) {
        jobs.push(api.get<Role[]>('/api/v1/admin/roles'), api.get<Permission[]>('/api/v1/admin/permissions'));
      } else {
        jobs.push(Promise.resolve([]), Promise.resolve([]));
      }
      jobs.push(api.get<Client[]>('/api/v1/clients?limit=250').catch(() => []));
      const [us, rs, ps, cs] = (await Promise.all(jobs)) as [
        { items: UserRow[]; total: number },
        Role[],
        Permission[],
        Client[],
      ];
      setUsers(us.items);
      setUserTotal(us.total);
      setRoles(rs);
      setPermissions(ps);
      setClients(cs.filter((c) => !(c as Client & { is_archived?: boolean }).is_archived));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить пользователей и роли.');
    } finally {
      setBusy(false);
    }
  }, [offset, query, refreshKey, mayViewUsers, mayViewRoles]);

  useEffect(() => {
    void load();
  }, [load]);

  function startRole(role?: Role, clone = false) {
    setRoleEditorOpen(true);
    if (role) {
      setRoleEdit(clone ? null : role);
      setRoleName(clone ? `${role.name} — копия` : role.name);
      setRoleSlug(clone ? `${role.slug}-copy` : role.slug);
      setRoleDescription(role.description || '');
      setMatrix({ ...role.permissions } as Record<string, Scope>);
    } else {
      setRoleEdit(null);
      setRoleName('');
      setRoleSlug('');
      setRoleDescription('');
      setMatrix({});
    }
    setError('');
  }

  async function createAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUserBusy(true);
    setError('');
    try {
      const result = await api.post<{ user: UserRow; temporary_password: string }>('/api/v1/admin/users', {
        username: username.trim(),
        role_slugs: [newRole],
        customer_id: newRole === 'client' && customerId ? Number(customerId) : null,
        telegram_user_id: newTelegramId.trim() || null,
      });
      setTemporaryCredential({ username: result.user.username, password: result.temporary_password });
      setUsername('');
      setCustomerId('');
      setNewTelegramId('');
      setNewUser(false);
      notify('Аккаунт создан. Временный пароль выдан однократно.');
      setRefreshKey((n) => n + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось создать аккаунт.');
    } finally {
      setUserBusy(false);
    }
  }

  async function saveUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingUser) return;
    setUserBusy(true);
    setError('');
    try {
      await api.patch(`/api/v1/admin/users/${editingUser.id}`, {
        role_slugs: [editRole],
        customer_id: editCustomer ? Number(editCustomer) : null,
        telegram_user_id: editTelegramId.trim() || null,
      });
      setEditingUser(null);
      notify('Доступ аккаунта обновлён');
      setRefreshKey((n) => n + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить аккаунт.');
    } finally {
      setUserBusy(false);
    }
  }

  function deleteUser(user: UserRow) {
    setConfirmDialog({
      title: 'Удалить учётную запись?',
      message: `Вы точно хотите полностью удалить «${user.username}»? Это действие необратимо.`,
      confirmLabel: 'Удалить навсегда',
      danger: true,
      onConfirm: async () => {
        setConfirmBusy(true);
        try {
          await api.delete(`/api/v1/admin/users/${user.id}`);
          setConfirmDialog(null);
          notify(`Учётная запись ${user.username} удалена`);
          setRefreshKey((n) => n + 1);
        } catch (reason) {
          notify(reason instanceof Error ? reason.message : 'Не удалось удалить аккаунт.', true);
        } finally {
          setConfirmBusy(false);
        }
      },
    });
  }

  async function syncUserTelegram(user: UserRow) {
    setConfirmBusy(true);
    try {
      const res = await api.post<{ telegram_username?: string | null; full_name?: string | null }>(
        `/api/v1/admin/users/${user.id}/sync-telegram`,
        {},
      );
      notify(`Telegram обновлён: ${res.telegram_username || res.full_name || 'актуально'}`);
      setRefreshKey((n) => n + 1);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось обновить Telegram-данные.', true);
    } finally {
      setConfirmBusy(false);
    }
  }

  async function toggleUser(user: UserRow) {
    try {
      await api.patch(`/api/v1/admin/users/${user.id}`, { is_active: !user.is_active });
      notify(user.is_active ? 'Аккаунт отключён' : 'Аккаунт активирован');
      setRefreshKey((n) => n + 1);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось изменить статус.', true);
    }
  }

  function resetPassword(user: UserRow) {
    setConfirmDialog({
      title: 'Сбросить пароль?',
      message: `Выпустить новый временный пароль для ${user.username}?`,
      confirmLabel: 'Сбросить',
      danger: true,
      onConfirm: async () => {
        setConfirmBusy(true);
    try {
      const result = await api.post<{ username: string; temporary_password: string }>(
        `/api/v1/admin/users/${user.id}/reset-password`,
      );
      setConfirmDialog(null);
      setTemporaryCredential({ username: result.username, password: result.temporary_password });
      notify('Пароль сброшен.');
      setRefreshKey((n) => n + 1);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось сбросить пароль.', true);
    } finally {
      setConfirmBusy(false);
    }
      },
    });
  }

  async function saveRole(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRoleBusy(true);
    setError('');
    const chosen = Object.fromEntries(
      Object.entries(matrix).filter((entry): entry is [string, Scope] => entry[1] !== ''),
    );
    try {
      if (roleEdit) {
        await api.patch(`/api/v1/admin/roles/${roleEdit.id}`, {
          name: roleName.trim(),
          description: roleDescription.trim() || null,
          permissions: chosen,
        });
      } else {
        await api.post('/api/v1/admin/roles', {
          slug: roleSlug.trim(),
          name: roleName.trim(),
          description: roleDescription.trim() || null,
          permissions: chosen,
        });
      }
      notify(roleEdit ? 'Роль обновлена' : 'Роль создана');
      setRoleEditorOpen(false);
      setRoleEdit(null);
      setRefreshKey((n) => n + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить роль.');
    } finally {
      setRoleBusy(false);
    }
  }

  function deactivateRole(role: Role) {
    setConfirmDialog({
      title: 'Отключить роль?',
      message: `Вы точно хотите отключить роль «${role.name}»?`,
      confirmLabel: 'Отключить',
      danger: true,
      onConfirm: async () => {
        setConfirmBusy(true);
        try {
          await api.patch(`/api/v1/admin/roles/${role.id}`, { is_active: false });
          setConfirmDialog(null);
          notify('Роль отключена');
          setRefreshKey((n) => n + 1);
        } catch (reason) {
          notify(reason instanceof Error ? reason.message : 'Не удалось отключить роль.', true);
        } finally {
          setConfirmBusy(false);
        }
      },
    });
  }

  async function copyCredential() {
    if (!temporaryCredential) return;
    try {
      await navigator.clipboard.writeText(temporaryCredential.password);
      notify('Временный пароль скопирован.');
    } catch {
      setError('Скопируйте пароль вручную.');
    }
  }

  async function openSessions(user: UserRow) {
    setSessionTarget(user);
    setSessionRows([]);
    setSessionBusy(true);
    setSessionError('');
    try {
      const result = await api.get<{ items: SessionRow[]; total: number }>(
        `/api/v1/admin/users/${user.id}/sessions?limit=50&offset=0`,
      );
      setSessionRows(result.items);
    } catch (reason) {
      setSessionError(reason instanceof Error ? reason.message : 'Не удалось загрузить сессии.');
    } finally {
      setSessionBusy(false);
    }
  }

  function revokeSession(row: SessionRow) {
    if (!sessionTarget || !row.is_active || row.is_current) return;
    setConfirmDialog({
      title: 'Отозвать сессию?',
      message: `Отозвать сессию #${row.id} (${sessionTarget.username})?`,
      confirmLabel: 'Отозвать',
      danger: true,
      onConfirm: async () => {
        setConfirmBusy(true);
        try {
          await api.post(`/api/v1/admin/users/${sessionTarget.id}/sessions/${row.id}/revoke`, {});
          setConfirmDialog(null);
          notify('Сессия отозвана');
          await openSessions(sessionTarget);
          setRefreshKey((n) => n + 1);
        } catch (reason) {
          setSessionError(reason instanceof Error ? reason.message : 'Не удалось отозвать сессию.');
        } finally {
          setConfirmBusy(false);
        }
      },
    });
  }

  if (!mayViewUsers && !mayViewRoles) {
    return (
      <section className="panel empty-state">
        <Shield size={26} />
        <h3>Недостаточно прав</h3>
        <p>Нет доступа к просмотру пользователей и ролей.</p>
      </section>
    );
  }

  return (
    <section className="access-workspace">
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      <div className="access-toolbar">
        <div className="access-tabs" role="tablist">
          {mayViewUsers && (
            <button
              role="tab"
              aria-selected={tab === 'users'}
              className={tab === 'users' ? 'access-tab access-tab-active' : 'access-tab'}
              onClick={() => {
                setTab('users');
                setRoleEdit(null);
              }}
            >
              <Users size={15} /> Пользователи
            </button>
          )}
          {mayViewRoles && (
            <button
              role="tab"
              aria-selected={tab === 'roles'}
              className={tab === 'roles' ? 'access-tab access-tab-active' : 'access-tab'}
              onClick={() => {
                setTab('roles');
                setEditingUser(null);
              }}
            >
              <ShieldCheck size={15} /> Роли и права
            </button>
          )}
        </div>
        <button className="secondary-button" onClick={() => setRefreshKey((n) => n + 1)}>
          <RefreshCw size={14} /> Обновить
        </button>
      </div>

      {temporaryCredential && (
        <section className="credential-reveal" aria-live="polite">
          <div style={{ flex: 1 }}>
            <strong>Временный пароль для {temporaryCredential.username}</strong>
            <p className="field-hint" style={{ margin: '4px 0' }}>
              Показывается только один раз. При первом входе потребуется замена.
            </p>
            <code>{temporaryCredential.password}</code>
          </div>
          <button className="secondary-button" onClick={() => void copyCredential()}>
            <Copy size={14} /> Скопировать
          </button>
          <button className="text-button" onClick={() => setTemporaryCredential(null)}>
            Скрыть
          </button>
        </section>
      )}

      {tab === 'users' && (
        <>
          <div className="access-toolbar">
            <form
              className="search-field"
              onSubmit={(e) => {
                e.preventDefault();
                setOffset(0);
                setQuery(q.trim());
              }}
            >
              <Search size={15} />
              <input
                aria-label="Поиск аккаунтов"
                placeholder="Поиск по логину…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </form>
            {mayCreateUsers && (
              <button className="primary-button" onClick={() => setNewUser((v) => !v)}>
                <Plus size={15} />
                {newUser ? 'Скрыть форму' : 'Создать аккаунт'}
              </button>
            )}
          </div>

          {newUser && (
            <form className="panel" style={{ padding: 20 }} onSubmit={createAccount}>
              <h3 style={{ marginTop: 0 }}>Новый аккаунт</h3>
              <div className="form-grid">
                <label className="form-field">
                  <span>Логин</span>
                  <input
                    required
                    minLength={3}
                    maxLength={100}
                    pattern="[A-Za-z0-9_.-]+"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="user.login"
                  />
                </label>
                <label className="form-field">
                  <span>Роль</span>
                  <select
                    value={newRole}
                    onChange={(e) => {
                      setNewRole(e.target.value);
                      setCustomerId('');
                    }}
                  >
                    {assignableRoles.map((r) => (
                      <option key={r.slug} value={r.slug}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Telegram User ID (необязательно)</span>
                  <input
                    pattern="[0-9]+"
                    maxLength={64}
                    value={newTelegramId}
                    onChange={(e) => setNewTelegramId(e.target.value)}
                    placeholder="Например, 123456789"
                  />
                </label>
                {newRole === 'client' && (
                  <label className="form-field">
                    <span>Привязанный клиент</span>
                    <select required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                      <option value="">Выбрать клиента</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <button className="primary-button" disabled={userBusy}>
                {userBusy ? 'Создание…' : 'Создать'}
              </button>
            </form>
          )}

          <div className="access-user-actions" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={userFilter === 'all' ? 'primary-button' : 'secondary-button'}
              onClick={() => setUserFilter('all')}
            >
              Все ({users.length})
            </button>
            <button
              type="button"
              className={userFilter === 'staff' ? 'primary-button' : 'secondary-button'}
              onClick={() => setUserFilter('staff')}
            >
              Сотрудники ({users.filter((x) => !x.roles.includes('client')).length})
            </button>
            <button
              type="button"
              className={userFilter === 'clients' ? 'primary-button' : 'secondary-button'}
              onClick={() => setUserFilter('clients')}
            >
              Клиенты ({users.filter((x) => x.roles.includes('client')).length})
            </button>
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Поиск по логину или TG ID…"
              style={{ maxWidth: 240, marginLeft: 'auto' }}
            />
          </div>

          {busy ? (
            <div className="loading">Загрузка аккаунтов…</div>
          ) : users.length ? (
            <div className="access-user-list">
              {users
                .filter((u) => {
                  if (userFilter === 'staff' && u.roles.includes('client')) return false;
                  if (userFilter === 'clients' && !u.roles.includes('client')) return false;
                  const q = userSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    u.username.toLowerCase().includes(q) ||
                    (u.telegram_user_id || '').toLowerCase().includes(q)
                  );
                })
                .map((u) => (
                <article className="panel access-user-card" key={u.id}>
                  <div className="user-card-head">
                    <div className="access-user-summary">
                    <RoleAvatar kind={resolveRoleKind(u.roles, u.is_owner)} label={u.username} size={40} />
                    <div>
                      <strong>
                        {u.username}
                        {u.is_owner && <span className="owner-tag">Владелец</span>}
                        {u.telegram_user_id && <span className="system-tag mono">TG: {u.telegram_user_id}</span>}
                      </strong>
                      <p>
                        {u.roles.map((r) => roles.find((role) => role.slug === r)?.name || r).join(', ') ||
                          'Без активных ролей'}
                      </p>
                      <small>
                        {!u.is_active
                          ? 'Отключён'
                          : u.must_change_password
                            ? 'Ожидает смены временного пароля'
                            : u.last_login_at
                              ? `Последний вход: ${new Date(u.last_login_at).toLocaleString('ru-RU')}`
                              : 'Вход ещё не выполнялся'}
                      </small>
                    </div>
                    </div>
                    {mayDeleteUsers && !u.is_owner && u.id !== profile.id && (
                      <button
                        type="button"
                        className="user-delete-x"
                        title="Полностью удалить аккаунт"
                        aria-label={`Удалить аккаунт ${u.username}`}
                        onClick={() => deleteUser(u)}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <div className="access-user-actions" style={{ marginTop: 12 }}>
                    {mayEditUsers && u.telegram_user_id && (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={confirmBusy}
                        title="Обновить @username и имя из Telegram"
                        onClick={() => void syncUserTelegram(u)}
                      >
                        <AtSign size={14} />
                        TG
                      </button>
                    )}
                    {mayEditUsers && !u.is_owner && (
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setEditingUser(u);
                          setEditRole(u.roles.find((r) => r !== 'owner') || 'manager');
                          setEditCustomer(u.customer_id ? String(u.customer_id) : '');
                          setEditTelegramId(u.telegram_user_id || '');
                        }}
                      >
                        Изменить доступ
                      </button>
                    )}
                    {mayReset && (
                      <button
                        className="secondary-button"
                        disabled={!u.is_active || (!profile.is_owner && u.is_owner)}
                        onClick={() => resetPassword(u)}
                      >
                        <KeyRound size={14} /> Сбросить пароль
                      </button>
                    )}
                    {maySessions && (!u.is_owner || profile.is_owner) && (
                      <button className="secondary-button" onClick={() => void openSessions(u)}>
                        <History size={14} /> Сессии
                      </button>
                    )}
                    {maySuspend && !u.is_owner && (
                      <button className="secondary-button" onClick={() => void toggleUser(u)}>
                        {u.is_active ? 'Отключить' : 'Активировать'}
                      </button>
                    )}
                  </div>

                  {editingUser?.id === u.id && (
                    <form className="form-grid" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-hairline)' }} onSubmit={saveUser}>
                      <label className="form-field">
                        <span>Роль</span>
                        <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                          {assignableRoles.map((r) => (
                            <option key={r.slug} value={r.slug}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="form-field">
                        <span>Привязанный клиент</span>
                        <select value={editCustomer} onChange={(e) => setEditCustomer(e.target.value)}>
                          <option value="">Нет привязки</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="form-field field-full">
                        <span>Telegram User ID</span>
                        <input
                          pattern="[0-9]+"
                          maxLength={64}
                          value={editTelegramId}
                          onChange={(e) => setEditTelegramId(e.target.value)}
                          placeholder="Числовой Telegram ID"
                        />
                      </label>
                      <div className="access-user-actions field-full">
                        <button className="primary-button" disabled={userBusy}>
                          Сохранить
                        </button>
                        <button className="secondary-button" type="button" onClick={() => setEditingUser(null)}>
                          Отмена
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="panel empty-state">
              <Users size={26} />
              <h3>Аккаунты не найдены</h3>
            </div>
          )}

          {userTotal > 50 && (
            <div className="table-footer">
              <span>
                {Math.min(offset + 1, userTotal)}–{Math.min(offset + users.length, userTotal)} из {userTotal}
              </span>
              <div className="access-user-actions">
                <button className="secondary-button" disabled={!offset} onClick={() => setOffset((n) => Math.max(0, n - 50))}>
                  Назад
                </button>
                <button className="secondary-button" disabled={offset + 50 >= userTotal} onClick={() => setOffset((n) => n + 50)}>
                  Дальше
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'roles' && (
        <>
          <div className="access-toolbar">
            <div>
              <h2 style={{ margin: 0, fontSize: 16 }}>Роли и матрица прав</h2>
            </div>
            {mayCreateRoles && (
              <button className="primary-button" onClick={() => startRole()}>
                <Plus size={15} /> Новая роль
              </button>
            )}
          </div>

          <div className="role-list">
            {roles.map((role) => (
              <article className="panel role-card" key={role.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>
                      {role.name}
                      {role.is_system && <span className="system-tag">Системная</span>}
                    </strong>
                    <p style={{ margin: '4px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                      {role.description || 'Без описания'}
                    </p>
                    <small className="mono" style={{ color: 'var(--text-muted)' }}>
                      {role.slug} · {role.users_count} польз.
                    </small>
                  </div>
                  <div className="access-user-actions">
                    {mayEditRoles && !role.is_system && (
                      <button className="secondary-button" onClick={() => startRole(role)}>
                        <Shield size={14} /> Редактировать
                      </button>
                    )}
                    {mayCreateRoles && (
                      <button className="secondary-button" onClick={() => startRole(role, true)}>
                        Копировать
                      </button>
                    )}
                    {mayEditRoles && !role.is_system && role.is_active && (
                      <button className="secondary-button" onClick={() => deactivateRole(role)}>
                        Отключить
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {Object.entries(role.permissions)
                    .slice(0, 8)
                    .map(([key, scope]) => (
                      <span className="badge badge-slate" key={key}>
                        <Check size={11} />
                        {key} ({scopeLabels[scope as Scope] || scope})
                      </span>
                    ))}
                </div>
              </article>
            ))}
          </div>

          {roleEditorOpen && (
            <form className="panel" style={{ padding: 20 }} onSubmit={saveRole}>
              <h3 style={{ marginTop: 0 }}>{roleEdit ? 'Редактирование роли' : 'Новая роль'}</h3>
              <div className="form-grid">
                <label className="form-field">
                  <span>Идентификатор (slug)</span>
                  <input
                    required
                    pattern="[a-z][a-z0-9_-]+"
                    minLength={2}
                    maxLength={50}
                    disabled={!!roleEdit}
                    value={roleSlug}
                    onChange={(e) => setRoleSlug(e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>Название</span>
                  <input required minLength={2} maxLength={100} value={roleName} onChange={(e) => setRoleName(e.target.value)} />
                </label>
                <label className="form-field field-full">
                  <span>Описание</span>
                  <input maxLength={500} value={roleDescription} onChange={(e) => setRoleDescription(e.target.value)} />
                </label>
              </div>
              <div className="permission-matrix">
                <div className="permission-matrix-head">
                  <span>Разрешение</span>
                  <span>Область (Scope)</span>
                </div>
                {permissions
                  .filter((p) => profile.is_owner || !isOwnerOnlyPermission(p.key))
                  .map((p) => (
                    <label className="permission-row" key={p.key}>
                      <span>
                        <strong>{p.key}</strong>
                        <small>{p.description}</small>
                      </span>
                      <select
                        value={matrix[p.key] || ''}
                        onChange={(e) => setMatrix((current) => ({ ...current, [p.key]: e.target.value as Scope | '' }))}
                      >
                        <option value="">Не выдавать</option>
                        <option value="all">Все записи</option>
                        <option value="assigned">Назначенные</option>
                        <option value="own_customer">Свой клиент</option>
                      </select>
                    </label>
                  ))}
              </div>
              <div className="modal-footer">
                <button type="button" className="secondary-button" onClick={() => setRoleEditorOpen(false)}>
                  Отмена
                </button>
                <button className="primary-button" disabled={roleBusy}>
                  {roleBusy ? 'Сохранение…' : 'Сохранить роль'}
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {sessionTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSessionTarget(null); }}>
          <section className="modal-card" role="dialog" aria-modal="true">
            <div className="modal-heading">
              <h2>Сессии · {sessionTarget.username}</h2>
              <button className="icon-button" type="button" onClick={() => setSessionTarget(null)}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              {sessionError && <p className="field-error">{sessionError}</p>}
              {sessionBusy ? (
                <div className="loading">Загрузка сессий…</div>
              ) : sessionRows.length ? (
                <div className="activity-list" style={{ padding: 0 }}>
                  {sessionRows.map((row) => (
                    <div className="activity-row" key={row.id}>
                      <div className="row-info">
                        <strong>
                          Сессия #{row.id} {row.is_current ? '(Текущая)' : ''}
                        </strong>
                        <small>{row.user_agent || 'User-Agent не передан'}</small>
                      </div>
                      <button
                        className="secondary-button"
                        disabled={!row.is_active || row.is_current}
                        onClick={() => void revokeSession(row)}
                      >
                        Отозвать
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="field-hint">Сессий не найдено.</p>
              )}
            </div>
          </section>
        </div>
      )}
      <ConfirmModal dialog={confirmDialog} busy={confirmBusy} onClose={() => setConfirmDialog(null)} />
    </section>
  );
}
