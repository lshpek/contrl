import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { RoleAvatar } from './RoleAvatar';
import { api } from './api';
import type { AuthUser } from './types';

type Props = {
  onLogin: (user: AuthUser) => void;
  connectionError?: string;
};

export default function LoginScreen({ onLogin, connectionError }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await api.post<AuthUser>('/api/v1/auth/login', {
        username: username.trim(),
        password,
      });
      onLogin(user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось выполнить вход в систему.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-heading">
        <div className="auth-brand">
          <RoleAvatar kind="brand" label="BOTVEX" size={44} />
          <span>
            <strong>BOTVEX</strong>
            <small>CONTROL CENTER</small>
          </span>
        </div>
        <p className="auth-eyebrow">АВТОРИЗАЦИЯ ОПЕРАТОРА</p>
        <h1 id="login-heading">Вход в систему управления</h1>
        <p className="auth-intro">
          Доступ разрешён только авторизованным операторам и верифицированным владельцам ботов.
        </p>
        {connectionError && (
          <div className="auth-alert" role="alert">
            {connectionError}
          </div>
        )}
        {error && (
          <div className="auth-alert" role="alert">
            {error}
          </div>
        )}
        <form className="auth-form" onSubmit={submit}>
          <label className="form-field">
            <span>Логин</span>
            <input
              autoComplete="username"
              name="username"
              required
              maxLength={100}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Введите логин"
              autoFocus
            />
          </label>
          <label className="form-field">
            <span>Пароль</span>
            <div className="password-wrap">
              <input
                autoComplete="current-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                maxLength={1024}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Введите пароль"
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <button className="primary-button auth-submit" type="submit" disabled={busy}>
            {busy ? 'Проверка доступа…' : 'Войти в систему'}
            {!busy && <ArrowRight size={16} />}
          </button>
        </form>
        <div className="auth-security">
          <ShieldCheck size={16} />
          <span>Сессия защищена HttpOnly-cookie (SHA-256) и проверяется сервером.</span>
        </div>
        <p className="auth-help">
          <LockKeyhole size={13} />
          Регистрация отключена. Учётные записи выдаёт администратор.
        </p>
      </section>
      <footer className="auth-footer">BOTVEX CONTROL CENTER · v0.2.0</footer>
    </main>
  );
}
