import type { EntityManager, Repository } from 'typeorm';
import { Accountant } from '../accountant.entity.js';
import { AccountantRepository } from './accountant.repository.js';

describe('AccountantRepository.markMfaChanged', () => {
  it('stamps mfa_changed_at through the transaction manager', async () => {
    const update = vi.fn().mockResolvedValue({ affected: 1 });
    const repository = new AccountantRepository({} as Repository<Accountant>);
    const at = new Date('2026-10-23T10:00:00Z');
    await repository.markMfaChanged(
      { update } as unknown as EntityManager,
      7,
      at,
    );
    expect(update).toHaveBeenCalledWith(
      Accountant,
      { id: 7 },
      { mfaChangedAt: at },
    );
  });
});
