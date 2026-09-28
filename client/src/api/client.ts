import type { Session } from './types';

const API_URL = import.meta.env.VITE_API_URL as string;

export class ApiError extends Error {
  status: number; // 0 = network down
  code: string; // e.g. INVALID_CREDENTIALS, from the server's { error: { code } }

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// The access token lives ONLY in this variable (memory), never in localStorage/sessionStorage,
// where any XSS bug could read it. A page reload forgets it; the httpOnly refresh cookie
// (which JavaScript can't read at all) gets a new one.
let accessToken: string | null = null;

let onSessionExpired = () => {};
export const setSessionExpiredHandler = (fn: () => void) => {
  onSessionExpired = fn;
};

type RequestOptions = { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown };

async function request<T>(path: string, opts: RequestOptions): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'include', // lets the browser send the refresh cookie (only to /auth/*)
      headers: {
        ...(opts.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', "Can't reach the server. Check the internet connection.");
  }
  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      json?.error?.code ?? 'UNKNOWN',
      json?.error?.message ?? 'Something went wrong. Try again.',
    );
  }
  return json.data as T;
}

// Only ONE refresh at a time. Refresh tokens work once (rotation), so two parallel refreshes
// would look like token theft to the server and log the user out everywhere.
// React StrictMode runs effects twice in development, which triggers exactly that.
let refreshing: Promise<Session> | null = null;

export function refreshSession(): Promise<Session> {
  refreshing ??= request<Session>('/auth/refresh', { method: 'POST' })
    .then((session) => {
      accessToken = session.accessToken;
      return session;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function login(username: string, password: string) {
  const session = await request<Session>('/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  accessToken = session.accessToken;
  return session.user;
}

export async function logout() {
  try {
    await request<void>('/auth/logout', { method: 'POST' });
  } finally {
    accessToken = null; // forget it locally even if the server couldn't be reached
  }
}

// For every normal API call. The access token lasts 15 minutes: on a 401 we refresh ONCE and
// retry. Never for /auth/* (a wrong password or PIN must not trigger a retry) and never twice.
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await request<T>(path, opts);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || path.startsWith('/auth/')) throw err;
    try {
      await refreshSession();
    } catch {
      accessToken = null;
      onSessionExpired();
      throw err;
    }
    return request<T>(path, opts);
  }
}
