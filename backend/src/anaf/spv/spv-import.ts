import { BadRequestException } from '@nestjs/common';
import {
  toSpvMessages,
  type RawSpvMessage,
  type SpvMessage,
} from './services/spv.service.js';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_MESSAGES = 10_000;
export const MAX_SPV_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_RIGHTS = 5_000;

const ANAF_MESSAGE_ID = /^\d{1,30}$/;
const CUI_OR_CNP = /^\d{2,13}$/;
const PDF_SIGNATURE = '%PDF-';
const MAX_ANAF_ERROR_BYTES = 4096;

interface RawSpvExport {
  titlu?: unknown;
  mesaje?: unknown;
  cui?: unknown;
  serial?: unknown;
  eroare?: unknown;
}

export interface SpvExport {
  title: string | null;
  certSerial: string | null;
  cuis: string[];
  notice: string | null;
  messages: SpvMessage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number'
  );
}

function parseJson(content: Buffer): unknown {
  return JSON.parse(content.toString('utf8').replace(/^﻿/, ''));
}

function headerText(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function rightsList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((c) => c.trim())
        .filter((c) => CUI_OR_CNP.test(c)),
    ),
  ].slice(0, MAX_RIGHTS);
}

function checkMessage(value: unknown, index: number): RawSpvMessage {
  const where = `Mesajul ${index + 1} din listă`;
  if (!isRecord(value)) {
    throw new BadRequestException(`${where} nu are formatul ANAF.`);
  }
  const id = typeof value.id === 'number' ? String(value.id) : value.id;
  if (typeof id !== 'string' || !ANAF_MESSAGE_ID.test(id)) {
    throw new BadRequestException(`${where} nu are un id ANAF valid.`);
  }
  for (const key of [
    'detalii',
    'cif',
    'data_creare',
    'id_solicitare',
    'tip',
  ] as const) {
    if (!isText(value[key])) {
      throw new BadRequestException(`${where} are câmpul „${key}” invalid.`);
    }
  }
  return value as RawSpvMessage;
}

export function parseSpvExport(content: Buffer | undefined): SpvExport {
  if (!content || content.length === 0) {
    throw new BadRequestException(
      'Lipiți sau încărcați lista de mesaje primită de la ANAF.',
    );
  }
  if (content.length > MAX_IMPORT_BYTES) {
    throw new BadRequestException(
      `Lista poate avea cel mult ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = parseJson(content);
  } catch {
    throw new BadRequestException(
      'Textul nu este JSON-ul primit de la ANAF. Copiați toată pagina deschisă la ANAF.',
    );
  }
  if (!isRecord(parsed)) {
    throw new BadRequestException(
      'JSON-ul nu are formatul listei de mesaje ANAF.',
    );
  }
  const body = parsed as RawSpvExport;
  const header = {
    title: headerText(body.titlu, 200),
    certSerial: headerText(body.serial, 100),
    cuis: rightsList(body.cui),
  };
  if (typeof body.eroare === 'string' && body.eroare) {
    if (/nu exist[aă] mesaje/i.test(body.eroare)) {
      return { ...header, notice: body.eroare.slice(0, 200), messages: [] };
    }
    throw new BadRequestException(`ANAF: ${body.eroare.slice(0, 500)}`);
  }
  if (!Array.isArray(body.mesaje)) {
    throw new BadRequestException(
      'JSON-ul nu conține lista de mesaje SPV (câmpul „mesaje”).',
    );
  }
  if (body.mesaje.length > MAX_IMPORT_MESSAGES) {
    throw new BadRequestException(
      `Lista poate avea cel mult ${MAX_IMPORT_MESSAGES} de mesaje.`,
    );
  }
  return {
    ...header,
    notice: null,
    messages: toSpvMessages(body.mesaje.map(checkMessage)),
  };
}

function anafDownloadError(content: Buffer): string | null {
  if (content.length > MAX_ANAF_ERROR_BYTES) return null;
  try {
    const body = parseJson(content);
    return isRecord(body) && typeof body.eroare === 'string' && body.eroare
      ? body.eroare.slice(0, 500)
      : null;
  } catch {
    return null;
  }
}

export function validateSpvPdf(content: Buffer | undefined): Buffer {
  if (!content || content.length === 0) {
    throw new BadRequestException('Alegeți fișierul PDF descărcat de la ANAF.');
  }
  if (content.length > MAX_SPV_PDF_BYTES) {
    throw new BadRequestException(
      `PDF-ul poate avea cel mult ${MAX_SPV_PDF_BYTES / 1024 / 1024} MB.`,
    );
  }
  if (
    content.subarray(0, PDF_SIGNATURE.length).toString('latin1') !==
    PDF_SIGNATURE
  ) {
    const anafError = anafDownloadError(content);
    throw new BadRequestException(
      anafError
        ? `ANAF nu a dat documentul: ${anafError}`
        : 'Fișierul nu este un PDF.',
    );
  }
  return content;
}
