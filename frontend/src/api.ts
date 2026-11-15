import { getTelegramInitData } from './telegram';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function decodeResponse<T>(response: Response, path = ''): Promise<T> {
  if (!response.ok) {
    if (
      response.status === 401 &&
      unauthorizedHandler &&
      !path.startsWith('/api/v1/auth/login') &&
      !path.startsWith('/api/v1/auth/telegram') &&
      !path.startsWith('/api/v1/auth/me')
    ) {
      unauthorizedHandler();
    }
    let message = `Ошибка запроса (${response.status})`;
    try {
      const body = await response.json();
      message = body?.error?.message || body?.detail || message;
    } catch {
      // Server returned non-JSON error
    }
    throw new ApiError(String(message), response.status);
  }
  return response.json() as Promise<T>;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: options.credentials ?? 'include',
  });
  return decodeResponse<T>(response, path);
}

async function getWithMeta<T>(path: string): Promise<{ data: T; total: number }> {
  const response = await fetch(path, { credentials: 'include' });
  const totalHeader = response.headers.get('X-Total-Count');
  const data = await decodeResponse<T>(response, path);
  const total = totalHeader ? Number(totalHeader) : Array.isArray(data) ? data.length : 0;
  return { data, total };
}

async function telegramLogin<T>(): Promise<T> {
  const initData = getTelegramInitData();
  if (!initData) throw new ApiError('Telegram initData недоступен в этом окне.', 401);
  const headers = new Headers({ 'X-Telegram-Init-Data': initData });
  return request<T>('/api/v1/auth/telegram', { method: 'POST', headers });
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  getWithMeta,
  post: <T>(path: string, value?: unknown) =>
    request<T>(path, {
      method: 'POST',
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, {
      method: 'POST',
      body: formData,
    }),
  patch: <T>(path: string, value: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(value) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  telegramLogin,
};
