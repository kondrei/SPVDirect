import type {
  InvoiceLine,
  InvoiceLineInput,
  InvoiceTotals,
  VatBreakdownRow,
} from '../dto/invoice.types.js';

export function toCents(amount: number): number {
  return Math.round(amount * 100 + Math.sign(amount) * 1e-7);
}

export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function computeInvoice(
  lines: InvoiceLineInput[],
  exchangeRate: number | null,
): { lines: InvoiceLine[]; totals: InvoiceTotals } {
  const priced = lines.map((line) => ({
    ...line,
    netAmount: fromCents(toCents(line.quantity * line.unitPrice)),
  }));

  const groups = new Map<string, VatBreakdownRow & { taxableCents: number }>();
  for (const line of priced) {
    const key = `${line.vatCategory}|${line.vatRate}|${line.vatExemptionReason ?? ''}`;
    const group = groups.get(key) ?? {
      category: line.vatCategory,
      rate: line.vatRate,
      exemptionReason: line.vatExemptionReason,
      taxableAmount: 0,
      vatAmount: 0,
      taxableCents: 0,
    };
    group.taxableCents += toCents(line.netAmount);
    groups.set(key, group);
  }

  const breakdown: VatBreakdownRow[] = [];
  let netCents = 0;
  let vatCents = 0;
  for (const group of groups.values()) {
    const groupVat = roundHalfAwayFromZero(
      (group.taxableCents * group.rate) / 100,
    );
    netCents += group.taxableCents;
    vatCents += groupVat;
    breakdown.push({
      category: group.category,
      rate: group.rate,
      exemptionReason: group.exemptionReason,
      taxableAmount: fromCents(group.taxableCents),
      vatAmount: fromCents(groupVat),
    });
  }

  const vatRonCents =
    exchangeRate === null
      ? vatCents
      : roundHalfAwayFromZero(vatCents * exchangeRate);
  return {
    lines: priced,
    totals: {
      net: fromCents(netCents),
      vat: fromCents(vatCents),
      gross: fromCents(netCents + vatCents),
      vatRon: fromCents(vatRonCents),
      breakdown,
    },
  };
}
