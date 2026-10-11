import { BadRequestException, ConflictException } from '@nestjs/common';
import { line } from '../../testing/invoice-fixtures.js';
import { computeInvoice } from './invoice-calc.js';
import { buildStornoLines, remainingQuantities } from './invoice-storno.js';

const original = computeInvoice(
  [
    line({ description: 'A', quantity: 10, unitPrice: 5 }),
    line({ description: 'B', quantity: 2, unitPrice: 100, vatRate: 11 }),
  ],
  null,
);

function stornoOf(quantities: Record<number, number>) {
  const built = buildStornoLines(
    original,
    remainingQuantities(original, []),
    Object.entries(quantities).map(([lineIndex, quantity]) => ({
      lineIndex: Number(lineIndex),
      quantity,
    })),
  );
  return computeInvoice(built, null);
}

describe('remainingQuantities', () => {
  it('is the invoiced quantity when nothing was reversed', () => {
    expect(remainingQuantities(original, [])).toEqual([10, 2]);
  });

  it('subtracts what earlier storno invoices reversed per line', () => {
    const first = stornoOf({ 0: 4 });
    const second = stornoOf({ 0: 1.5, 1: 2 });
    expect(remainingQuantities(original, [first, second])).toEqual([4.5, 0]);
  });
});

describe('buildStornoLines', () => {
  it('reverses every remaining line when no lines are given', () => {
    const lines = buildStornoLines(
      original,
      remainingQuantities(original, []),
      undefined,
    );
    expect(lines.map((l) => l.quantity)).toEqual([-10, -2]);
    expect(lines[0]).toMatchObject({
      description: 'A',
      unitPrice: 5,
      vatRate: 21,
      vatCategory: 'S',
      stornoOfLine: 0,
    });
  });

  it('skips lines that are already fully reversed', () => {
    const done = stornoOf({ 1: 2 });
    const lines = buildStornoLines(
      original,
      remainingQuantities(original, [done]),
      undefined,
    );
    expect(lines.map((l) => [l.stornoOfLine, l.quantity])).toEqual([[0, -10]]);
  });

  it('answers 409 when everything was already reversed', () => {
    const done = stornoOf({ 0: 10, 1: 2 });
    expect(() =>
      buildStornoLines(
        original,
        remainingQuantities(original, [done]),
        undefined,
      ),
    ).toThrow(ConflictException);
  });

  it('reverses only the requested quantity', () => {
    const lines = buildStornoLines(
      original,
      remainingQuantities(original, []),
      [{ lineIndex: 0, quantity: 2.5 }],
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(-2.5);
  });

  it('refuses more than what is left on the line', () => {
    expect(() =>
      buildStornoLines(original, remainingQuantities(original, []), [
        { lineIndex: 1, quantity: 3 },
      ]),
    ).toThrow('se mai poate storna cel mult 2');
  });

  it('refuses an unknown line, a repeated line and an empty selection', () => {
    const remaining = remainingQuantities(original, []);
    expect(() =>
      buildStornoLines(original, remaining, [{ lineIndex: 5, quantity: 1 }]),
    ).toThrow(BadRequestException);
    expect(() =>
      buildStornoLines(original, remaining, [
        { lineIndex: 0, quantity: 1 },
        { lineIndex: 0, quantity: 1 },
      ]),
    ).toThrow('de două ori');
    expect(() => buildStornoLines(original, remaining, [])).toThrow(
      BadRequestException,
    );
  });

  it('produces totals that exactly cancel the original', () => {
    const full = computeInvoice(
      buildStornoLines(original, remainingQuantities(original, []), undefined),
      null,
    );
    expect(full.totals.net).toBe(-original.totals.net);
    expect(full.totals.vat).toBe(-original.totals.vat);
    expect(full.totals.gross).toBe(-original.totals.gross);
  });
});
