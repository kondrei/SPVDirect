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
  if (Buffer.isBuffer(file.content)) {
    return new StreamableFile(file.content, options);
  }
  return new StreamableFile(file.content, options);
}
