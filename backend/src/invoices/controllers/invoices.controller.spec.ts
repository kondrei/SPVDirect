import { ParseCuiPipe } from '../../companies/dto/company.dto.js';
import { paramPipes } from '../../testing/param-pipes.js';
import { InvoicesController } from './invoices.controller.js';

describe('InvoicesController buyer routes', () => {
  it.each(['lookupBuyer', 'findBuyer'])(
    'validates the CUI of %s with ParseCuiPipe',
    (method) => {
      expect(paramPipes(InvoicesController, method, 'cui')).toContain(ParseCuiPipe);
    },
  );
});
