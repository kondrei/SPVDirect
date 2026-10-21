import type { Invoice } from '../invoice.entity.js';
import type { Unit } from '../invoice.types.js';
import { VatCategory, Currency } from '../dto/invoice.enums.js';

export const SUGGESTION_INVOICE_LIMIT = 50;
export const MAX_LINE_SUGGESTIONS = 50;

export interface LineSuggestion {
  description: string;
  quantity: number;
  unit: Unit;
  unitPrice: number;
  vatRate: number;
  vatCategory: VatCategory;
  currency: Currency;
  issueDate: string;
}

export function distinctLineSuggestions(
  invoices: Pick<Invoice, 'lines' | 'currency' | 'issueDate'>[],
): LineSuggestion[] {
  const seen = new Set<string>();
  const suggestions: LineSuggestion[] = [];
  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      if (line.quantity <= 0 || line.stornoOfLine !== undefined) continue;
      const description = line.description.trim();
      const key = `${invoice.currency}\u0000${description.toLocaleLowerCase('ro')}`;
      if (!description || seen.has(key)) continue;
      seen.add(key);
      suggestions.push({
        description,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate,
        vatCategory: line.vatCategory,
        currency: invoice.currency,
        issueDate: invoice.issueDate,
      });
      if (suggestions.length === MAX_LINE_SUGGESTIONS) return suggestions;
    }
  }
  return suggestions;
}
