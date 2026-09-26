export const API_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(
  /\/$/,
  '',
);

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const FALLBACK: Record<number, string> = {
  401: 'Sesiunea a expirat. Autentificați-vă din nou.',
  403: 'Nu aveți acces la această resursă.',
  404: 'Resursa nu a fost găsită.',
  409: 'Conflict: datele există deja.',
  429: 'Prea multe încercări. Așteptați un minut și reîncercați.',
};

export function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (
      typeof m === 'string' &&
      m &&
      !/^(Unauthorized|Forbidden|Not Found|Bad Request|Conflict|Internal server error)$/i.test(
        m,
      )
    )
      return m;
    if (Array.isArray(m) && m.length) return m.join('; ');
  }
  return (
    FALLBACK[status] ??
    (status >= 500
      ? 'Serverul nu răspunde. Reîncercați în câteva momente.'
      : 'Cererea nu a putut fi procesată.')
  );
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(
      0,
      'Nu se poate contacta serverul SPVDirect. Verificați conexiunea.',
    );
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = text;
  if (text && res.headers.get('content-type')?.includes('application/json')) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) throw new ApiError(res.status, errorMessage(res.status, body));
  return body as T;
}
