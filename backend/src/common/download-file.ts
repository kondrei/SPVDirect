import { StreamableFile } from '@nestjs/common';
import type { Readable } from 'node:stream';

export interface DownloadFile {
  content: Buffer;
  contentType: string;
  filename: string;
}

export function attachment(
  file: Omit<DownloadFile, 'content'> & { content: Buffer | Readable },
): StreamableFile {
  const options: ConstructorParameters<typeof StreamableFile>[1] = {
    type: file.contentType,
    disposition: `attachment; filename="${file.filename}"`,
  };
  return Buffer.isBuffer(file.content)
    ? new StreamableFile(file.content, options)
    : new StreamableFile(file.content, options);
}
