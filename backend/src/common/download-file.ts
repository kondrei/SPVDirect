import { StreamableFile } from '@nestjs/common';

export interface DownloadFile {
  content: Buffer;
  contentType: string;
  filename: string;
}

export function attachment(file: DownloadFile): StreamableFile {
  return new StreamableFile(file.content, {
    type: file.contentType,
    disposition: `attachment; filename="${file.filename}"`,
  });
}
