export function fakeAnafJwt(
  claims: Record<string, unknown> = {},
  { expInSeconds = 90 * 24 * 3600 } = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    token_type: 'Bearer',
    scope: 'clientappid info issuer role serial',
    iss: 'https://logincert.anaf.ro',
    issuer: 'Anaf',
    role: 'HELLO,EFACTURA,ETRANSPORT,SRV_EFACTURA',
    serial: '34:00:00:25:69:aa:bb:cc:dd:00:25:69',
    iat: now,
    nbf: now,
    exp: now + expInSeconds,
    ...claims,
  };
  const enc = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'RS512', kid: 'anaf_2023_2024' })}.${enc(payload)}.sig`;
}
