export const API_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(
  /\/$/,
  '',
);

export class ApiError extends Error {
  readonly status: number;
  readonly details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
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

export function errorDetails(body: unknown): string[] {
  if (body && typeof body === 'object' && 'errors' in body) {
    const e = (body as { errors: unknown }).errors;
    if (Array.isArray(e)) return e.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

export function detailsOf(err: unknown): string[] {
  return err instanceof ApiError ? err.details : [];
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
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: json === undefined ? rest.body : JSON.stringify(json),
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
  if (!res.ok) {
    throw new ApiError(
      res.status,
      errorMessage(res.status, body),
      errorDetails(body),
    );
  }
  return body as T;
}

async function fetchOk(path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, credentials: 'include' });
  } catch {
    throw new ApiError(
      0,
      'Nu se poate contacta serverul SPVDirect. Verificați conexiunea.',
    );
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw new ApiError(
      res.status,
      errorMessage(res.status, body),
      errorDetails(body),
    );
  }
  return res;
}

export async function fetchFile(path: string, name: string): Promise<File> {
  const res = await fetchOk(path, {});
  return new File([await res.blob()], name, {
    type: res.headers.get('content-type') ?? 'application/xml',
  });
}

const BLOB_URL_LIFETIME_MS = 30_000;

export function filenameFrom(disposition: string | null): string | null {
  if (!disposition) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      return null;
    }
  }
  return /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? null;
}

export async function downloadFile(
  path: string,
  fallbackName: string,
  init: RequestInit = {},
): Promise<void> {
  const res = await fetchOk(path, init);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download =
    filenameFrom(res.headers.get('content-disposition')) ?? fallbackName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_LIFETIME_MS);
}
