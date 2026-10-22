import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable } from '../components/ui';

const ROWS = [{ id: 1, name: 'ALFA SRL', cui: '123', total: '10,00' }];

function table(stack?: boolean) {
  return render(
    <DataTable
      caption="Firme"
      rows={ROWS}
      rowKey={(r) => r.id}
      stack={stack}
      columns={[
        { key: 'name', header: 'Firmă', wide: true },
        { key: 'cui', header: 'CUI', mono: true },
        { key: 'total', header: 'Total', align: 'num', mono: true },
      ]}
    />,
  );
}

describe('DataTable', () => {
  it('marks a stacking table so it turns into cards in a narrow container', () => {
    table(true);
    expect(screen.getByRole('table')).toHaveClass('spv-table', 'spv-table-stack');
  });

  it('keeps a plain table without stacking', () => {
    table();
    expect(screen.getByRole('table')).not.toHaveClass('spv-table-stack');
  });

  it('gives long-text columns the wide cell and labels every cell for the cards', () => {
    table(true);
    const name = screen.getByText('ALFA SRL');
    expect(name).toHaveClass('spv-cell-wide');
    expect(name).toHaveAttribute('data-label', 'Firmă');
    expect(screen.getByText('123')).toHaveClass('spv-mono');
    expect(screen.getByText('123')).not.toHaveClass('spv-cell-wide');
    expect(screen.getByText('10,00')).toHaveClass('spv-num');
    expect(screen.getByText('10,00')).not.toHaveClass('spv-mono');
  });
});
