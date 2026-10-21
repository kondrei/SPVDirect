import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Invoice } from '../invoice.entity.js';
import type {
  InvoiceLine,
  InvoiceLineInput,
  StornoRequestLine,
} from '../dto/invoice.types.js';

function milli(quantity: number): number {
  return Math.round(quantity * 1000);
}

export function remainingQuantities(
  original: Pick<Invoice, 'lines'>,
  stornos: Pick<Invoice, 'lines'>[],
): number[] {
  const reversed = new Map<number, number>();
  for (const storno of stornos) {
    for (const line of storno.lines) {
      if (line.stornoOfLine === undefined) continue;
      reversed.set(
        line.stornoOfLine,
        (reversed.get(line.stornoOfLine) ?? 0) + milli(-line.quantity),
      );
    }
  }
  return original.lines.map(
    (line, index) => (milli(line.quantity) - (reversed.get(index) ?? 0)) / 1000,
  );
}

function reverse(
  line: InvoiceLine,
  index: number,
  quantity: number,
): InvoiceLineInput {
  return {
    description: line.description,
    quantity: -quantity,
    unit: line.unit,
    unitPrice: line.unitPrice,
    vatRate: line.vatRate,
    vatCategory: line.vatCategory,
    vatExemptionReason: line.vatExemptionReason,
    stornoOfLine: index,
  };
}

export function buildStornoLines(
  original: Pick<Invoice, 'lines'>,
  remaining: number[],
  requested: StornoRequestLine[] | undefined,
): InvoiceLineInput[] {
  if (!requested) {
    const lines = original.lines
      .map((line, index) => ({ line, index, quantity: remaining[index] }))
      .filter((l) => l.quantity > 0)
      .map((l) => reverse(l.line, l.index, l.quantity));
    if (lines.length === 0) {
      throw new ConflictException('Factura a fost deja stornată integral');
    }
    return lines;
  }
  if (requested.length === 0) {
    throw new BadRequestException('Alegeți cel puțin o linie de stornat');
  }
  const seen = new Set<number>();
  return requested.map(({ lineIndex, quantity }) => {
    const line = original.lines[lineIndex];
    if (!line) {
      throw new BadRequestException(
        `Linia ${lineIndex + 1} nu există pe factură`,
      );
    }
    if (seen.has(lineIndex)) {
      throw new BadRequestException(`Linia ${lineIndex + 1} apare de două ori`);
    }
    seen.add(lineIndex);
    if (milli(quantity) > milli(remaining[lineIndex])) {
      throw new ConflictException(
        `Linia ${lineIndex + 1}: se mai poate storna cel mult ${remaining[lineIndex]}`,
      );
    }
    return reverse(line, lineIndex, quantity);
  });
}
