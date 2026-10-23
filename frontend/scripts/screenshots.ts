import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { SCREENSHOTS } from '../src/pages/landing/screenshots.ts';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'public', 'screenshots');
const TMP = join(ROOT, 'node_modules', '.tmp', 'screenshots');
const BASE = 'http://localhost:5198';
const THEMES = ['light', 'dark'] as const;

type Viewport = { width: number; height: number; deviceScaleFactor: number; mobile: boolean };

const DEVICES: Record<'desktop' | 'phone', Viewport> = {
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1.625, mobile: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 1.44, mobile: true },
};
const COLLAGE: Viewport = { width: 1264, height: 814, deviceScaleFactor: 2, mobile: false };
const BROWSERS = [
  process.env.SCREENSHOT_BROWSER,
  String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
  String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

function connect(url: string) {
  const ws = new WebSocket(url);
  const pending = new Map<number, Pending>();
  const warnings: string[] = [];
  let next = 0;
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'warning')
      warnings.push(msg.params.args.map((a: { value?: string }) => a.value).join(' '));
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  });
  const send = (method: string, params: object = {}, sessionId?: string) =>
    new Promise<any>((res, rej) => {
      const id = ++next;
      pending.set(id, { resolve: res, reject: rej });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const open = new Promise<void>((res, rej) => {
    ws.addEventListener('open', () => res());
    ws.addEventListener('error', () => rej(new Error(`cannot connect to ${url}`)));
  });
  return { open, send, warnings, close: () => ws.close() };
}

async function devtoolsUrl(profile: string) {
  for (let i = 0; i < 50; i++) {
    try {
      const [port, path] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n');
      return `ws://127.0.0.1:${port}${path}`;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('the browser did not start');
}

async function main() {
  const browser = BROWSERS.find((b) => b && existsSync(b));
  if (!browser) throw new Error('Set SCREENSHOT_BROWSER to a Chrome or Edge executable.');

  const server = await createServer({ root: ROOT, server: { port: 5198, strictPort: true }, logLevel: 'warn' });
  await server.listen();
  const profile = await mkdtemp(join(tmpdir(), 'spv-shots-'));
  const proc = spawn(browser, [
    '--headless=new',
    '--hide-scrollbars',
    '--lang=ro-RO',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ]);

  const cdp = connect(await devtoolsUrl(profile));
  try {
    await cdp.open;
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const page = (method: string, params: object = {}) => cdp.send(method, params, sessionId);
    await page('Runtime.enable');
    await page('Emulation.setLocaleOverride', { locale: 'ro-RO' });
    await mkdir(OUT, { recursive: true });
    await mkdir(TMP, { recursive: true });

    const open = async (url: string, viewport: Viewport) => {
      await page('Emulation.setDeviceMetricsOverride', viewport);
      await page('Page.navigate', { url: `${BASE}/${url}` });
      await waitForReady(page);
    };

    for (const shot of SCREENSHOTS) {
      for (const theme of THEMES) {
        const app = `screenshots/app.html?${new URLSearchParams({ path: shot.path, theme })}`;
        const views: Record<string, string> = {};
        for (const [name, viewport] of Object.entries(DEVICES)) {
          await open(app, viewport);
          const { data } = await page('Page.captureScreenshot', { format: 'png' });
          await writeFile(join(TMP, `${name}.png`), Buffer.from(data, 'base64'));
          views[name] = `/node_modules/.tmp/screenshots/${name}.png?v=${shot.id}-${theme}`;
        }
        await open(`screenshots/collage.html?${new URLSearchParams({ ...views, path: shot.path, theme })}`, COLLAGE);
        const { data } = await page('Page.captureScreenshot', { format: 'webp', quality: 85 });
        const file = join(OUT, `${shot.id}-${theme}.webp`);
        await writeFile(file, Buffer.from(data, 'base64'));
        console.log(`wrote ${file}`);
      }
    }
    if (cdp.warnings.length) console.warn([...new Set(cdp.warnings)].join('\n'));
  } finally {
    await cdp.send('Browser.close').catch(() => undefined);
    cdp.close();
    proc.kill();
    await server.close();
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function waitForReady(page: (method: string, params?: object) => Promise<any>) {
  for (let i = 0; i < 100; i++) {
    const { result } = await page('Runtime.evaluate', {
      expression: "document.body?.dataset.ready === 'true'",
      returnByValue: true,
    });
    if (result.value === true) {
      await new Promise((r) => setTimeout(r, 300));
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the screenshot page did not finish loading');
}

await main();
