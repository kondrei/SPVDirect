export function bodyText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data === undefined || data === null ? '' : JSON.stringify(data);
}

export function bodyJson<T extends object>(data: unknown): T | null {
  if (data && typeof data === 'object' && !Buffer.isBuffer(data)) {
    return data instanceof ArrayBuffer ? bodyJson(bodyText(data)) : (data as T);
  }
  try {
    const parsed: unknown = JSON.parse(bodyText(data));
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export function orNull(
  value: string | number | null | undefined,
): string | null {
  return value === undefined || value === null || value === ''
    ? null
    : String(value);
}

export interface AnafErrorBody {
  stare?: string;
  trace_id?: string;
  Messages?: { message?: string }[];
  message?: string;
  eroare?: string;
}

export function validationMessages(body: AnafErrorBody | null): string[] {
  return (body?.Messages ?? []).map((m) => m.message ?? '').filter(Boolean);
}
