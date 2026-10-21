import { strFromU8, unzipSync } from 'fflate';
import { ZipStream } from './zip-stream.js';

async function collect(zip: ZipStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of zip.output) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('ZipStream', () => {
  it('writes stored and deflated entries with UTF-8 names', async () => {
    const zip = new ZipStream();
    const done = collect(zip);
    zip.add('firmă.json', '{"a":1}');
    zip.add('facturi/a.pdf', Buffer.from('%PDF'), false);
    zip.end();
    const files = unzipSync(await done);
    expect(strFromU8(files['firmă.json'])).toBe('{"a":1}');
    expect(strFromU8(files['facturi/a.pdf'])).toBe('%PDF');
  });

  it('is ready right away while the reader keeps up', async () => {
    await expect(new ZipStream().ready()).resolves.toBe(true);
  });

  it('waits for the reader to drain before more is added', async () => {
    const zip = new ZipStream();
    zip.add('big.bin', Buffer.alloc(64 * 1024, 1), false);
    expect(zip.output.writableNeedDrain).toBe(true);
    let ready = false;
    const waiting = zip.ready().then((r) => (ready = r));
    await Promise.resolve();
    expect(ready).toBe(false);
    zip.output.resume();
    await waiting;
    expect(ready).toBe(true);
  });

  it('stops being ready once the download is aborted', async () => {
    const zip = new ZipStream();
    zip.add('big.bin', Buffer.alloc(64 * 1024, 1), false);
    const waiting = zip.ready();
    zip.output.destroy();
    await expect(waiting).resolves.toBe(false);
    await expect(zip.ready()).resolves.toBe(false);
  });
});
