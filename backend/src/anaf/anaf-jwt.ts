export interface AnafTokenClaims {
  serial: string | null;
  roles: string[];
  exp: Date | null;
}

interface RawClaims {
  serial?: unknown;
  role?: unknown;
  exp?: unknown;
  scope_data?: { id?: unknown; value?: unknown }[];
}

export function decodeJwtPayload(token: string): RawClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload: unknown = JSON.parse(json);
    return payload && typeof payload === 'object'
      ? (payload as RawClaims)
      : null;
  } catch {
    return null;
  }
}

export function decodeAnafClaims(token: string): AnafTokenClaims {
  const payload = decodeJwtPayload(token);
  if (!payload) return { serial: null, roles: [], exp: null };

  const fromScope = (id: string) =>
    payload.scope_data?.find((s) => s.id === id)?.value;

  const serial = payload.serial ?? fromScope('serial');
  const role = payload.role ?? fromScope('role');

  return {
    serial: typeof serial === 'string' && serial ? serial : null,
    roles:
      typeof role === 'string'
        ? role
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean)
        : [],
    exp: parseExp(payload.exp),
  };
}

function parseExp(exp: unknown): Date | null {
  const seconds =
    typeof exp === 'string' && /^\d+$/.test(exp) ? Number(exp) : exp;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : null;
}

export function describeTokenShape(token: string): string {
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return `opaque, ${token.split('.').length} segment(s), ${token.length} chars`;
  }
  const claims = Object.keys(payload).sort().join(', ') || 'none';
  return `JWT, claims: ${claims}; exp is ${typeof payload.exp}`;
}
