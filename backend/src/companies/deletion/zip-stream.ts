import { PassThrough } from 'node:stream';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';

export class ZipStream {
  readonly output = new PassThrough();
  private readonly zip = new Zip((err, chunk, final) => {
    if (err) {
      this.output.destroy(err);
      return;
    }
    this.output.write(chunk);
    if (final) this.output.end();
  });

  add(name: string, content: Buffer | string, compress = true): void {
    const entry = compress
      ? new ZipDeflate(name, { level: 6 })
      : new ZipPassThrough(name);
    this.zip.add(entry);
    entry.push(
      typeof content === 'string' ? Buffer.from(content, 'utf8') : content,
      true,
    );
  }

  async ready(): Promise<boolean> {
    const out = this.output;
    if (!out.destroyed && out.writableNeedDrain) {
      await new Promise<void>((resolve) => {
        const done = () => {
          out.off('drain', done);
          out.off('close', done);
          resolve();
        };
        out.on('drain', done);
        out.on('close', done);
      });
    }
    return !out.destroyed;
  }

  end(): void {
    this.zip.end();
  }

  fail(err: Error): void {
    this.output.destroy(err);
  }
}
