import { parseAnafDateTime } from '../../anaf/spv/spv-date.js';
import {
  UploadStatus,
  AnafUploadState,
  AnafExecutionStatus,
} from '../dto/efactura.enums.js';

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decode(value: string): string {
  return value
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    );
}

function attribute(xml: string, element: string, name: string): string | null {
  const tag = new RegExp(`<(?:[\\w-]+:)?${element}\\b([^>]*)>`, 'i').exec(xml);
  if (!tag) return null;
  const attr = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag[1]);
  return attr ? decode(attr[1]) : null;
}

export interface UploadResponse {
  accepted: boolean;
  uploadIndex: string | null;
  error: string | null;
}

export function parseUploadResponse(xml: string): UploadResponse {
  const status = attribute(xml, 'header', 'ExecutionStatus');
  const index = attribute(xml, 'header', 'index_incarcare');
  const error = attribute(xml, 'Errors', 'errorMessage');
  return {
    accepted:
      status === AnafExecutionStatus.Success && index !== null && index !== '',
    uploadIndex: index || null,
    error,
  };
}

export interface StatusResponse {
  status: UploadStatus | null;
  downloadId: string | null;
  error: string | null;
}

export function parseStatusResponse(xml: string): StatusResponse {
  const error = attribute(xml, 'Errors', 'errorMessage');
  const stare = attribute(xml, 'header', 'stare')?.trim().toLowerCase() ?? null;
  const downloadId = attribute(xml, 'header', 'id_descarcare') || null;
  let status: UploadStatus | null = null;
  if (stare === AnafUploadState.Ok) status = UploadStatus.Ok;
  else if (stare === AnafUploadState.Nok) status = UploadStatus.Nok;
  else if (stare === AnafUploadState.InProgress)
    status = UploadStatus.Processing;
  else if (stare?.startsWith(AnafUploadState.XmlErrors))
    status = UploadStatus.Rejected;
  return { status, downloadId, error };
}

export function anafStampToIso(
  stamp: string | null | undefined,
): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(stamp ?? '');
  if (!m) return null;
  return (
    parseAnafDateTime(
      `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}:00`,
    )?.toISOString() ?? null
  );
}
