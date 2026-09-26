import { mkdirSync, writeFileSync } from 'node:fs';
import { generate } from 'selfsigned';

const DAY_MS = 24 * 60 * 60 * 1000;
const dir = new URL('../certs/', import.meta.url);

const pems = await generate([{ name: 'commonName', value: 'localhost' }], {
  keySize: 2048,
  algorithm: 'sha256',
  notAfterDate: new Date(Date.now() + 825 * DAY_MS),
  extensions: [
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
        { type: 7, ip: '::1' },
      ],
    },
  ],
});

mkdirSync(dir, { recursive: true });
writeFileSync(new URL('localhost-key.pem', dir), pems.private, { mode: 0o600 });
writeFileSync(new URL('localhost-cert.pem', dir), pems.cert);
console.log(`Wrote certs/localhost-key.pem and certs/localhost-cert.pem
SHA-1 fingerprint: ${pems.fingerprint}`);
