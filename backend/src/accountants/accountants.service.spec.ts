import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { describeCaen, parseCaenCsv } from '../open-data/caen.js';
import type { CaenService } from '../open-data/caen.service.js';
import { hashPassword, verifyPassword } from '../common/crypto/password.js';
import type { AnafCompanyLookupService } from '../companies/anaf-company-lookup.service.js';
import { anafTvaRecord } from '../testing/anaf-tva-record.js';
import { CAEN_CSV } from '../testing/caen-csv.js';
import type { Accountant } from './accountant.entity.js';
import { AccountantsService } from './accountants.service.js';

function accountant(overrides: Partial<Accountant> = {}): Accountant {
  return {
    id: 1,
    email: 'a@example.com',
    passwordHash: '',
    name: 'Ana',
    phone: null,
    ceccarMember: false,
    professionalTitle: null,
    ceccarNumber: null,
    ceccarBranch: null,
    ccfNumber: null,
    firmName: null,
    firmCui: null,
    firmCaenCode: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

function setup(
  stored: Accountant | null = accountant(),
  lookup: () => Promise<unknown> = () => Promise.resolve(anafTvaRecord()),
) {
  const getOne = vi.fn().mockResolvedValue(stored);
  const qb = { addSelect: vi.fn(), where: vi.fn(), getOne };
  qb.addSelect.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  const repo = {
    findOneBy: vi.fn().mockResolvedValue(stored),
    save: vi.fn((a: Accountant) => Promise.resolve(a)),
    update: vi.fn().mockResolvedValue({}),
    createQueryBuilder: vi.fn().mockReturnValue(qb),
  };
  const anaf = { lookup: vi.fn(lookup) };
  const table = parseCaenCsv(CAEN_CSV);
  const caen = {
    describe: vi.fn((c: string | null) =>
      Promise.resolve(describeCaen(table, c)),
    ),
    tryDescribe: vi.fn((c: string | null) =>
      Promise.resolve(describeCaen(table, c)),
    ),
  };
  const service = new AccountantsService(
    repo as unknown as Repository<Accountant>,
    anaf as unknown as AnafCompanyLookupService,
    caen as unknown as CaenService,
  );
  return { service, repo, qb, anaf, caen };
}

describe('AccountantsService.lookupFirm', () => {
  it('returns the name, CUI and CAEN from ANAF without saving', async () => {
    const { service, repo, anaf } = setup();
    const firm = await service.lookupFirm(1, '14399840');
    expect(anaf.lookup).toHaveBeenCalledWith(1, '14399840');
    expect(firm).toMatchObject({
      firmCui: '14399840',
      firmName: 'AGRO VEST SRL',
      firmCaenCode: '0111',
      firmCaen: { code: '0111', revision: 3 },
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('returns a null CAEN when ANAF has none', async () => {
    const record = anafTvaRecord();
    record.date_generale.cod_CAEN = '';
    const { service } = setup(accountant(), () => Promise.resolve(record));
    await expect(service.lookupFirm(1, '14399840')).resolves.toMatchObject({
      firmCaenCode: null,
      firmCaen: null,
    });
  });

  it('rejects a CUI unknown to ANAF', async () => {
    const { service } = setup(accountant(), () => Promise.resolve(null));
    await expect(service.lookupFirm(1, '12')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AccountantsService.getProfile', () => {
  it('returns the profile without the password hash', async () => {
    const { service } = setup(accountant({ passwordHash: 'scrypt$x$y' }));
    const profile = await service.getProfile(1);
    expect(profile).toMatchObject({ id: 1, email: 'a@example.com' });
    expect(profile).not.toHaveProperty('passwordHash');
  });

  it('throws 404 for a missing accountant', async () => {
    const { service } = setup(null);
    await expect(service.getProfile(1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AccountantsService.updateProfile', () => {
  it('updates only the fields that were sent', async () => {
    const { service, repo } = setup(accountant({ phone: '0722000000' }));
    const profile = await service.updateProfile(1, { name: 'Ana Pop' });
    expect(profile).toMatchObject({ name: 'Ana Pop', phone: '0722000000' });
    expect(repo.save).toHaveBeenCalledOnce();
  });

  it('stores the firm CAEN code and returns its name', async () => {
    const { service } = setup();
    const profile = await service.updateProfile(1, { firmCaenCode: '6920' });
    expect(profile.firmCaenCode).toBe('6920');
    expect(profile.firmCaen).toMatchObject({ code: '6920', revision: 3 });
  });

  it('rejects a CAEN code missing from the nomenclator', async () => {
    const { service, repo } = setup();
    await expect(
      service.updateProfile(1, { firmCaenCode: '0000' }),
    ).rejects.toThrow('Cod CAEN necunoscut');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('checks the CAEN code only when it is being changed', async () => {
    const { service, caen } = setup(accountant({ firmCaenCode: '6920' }));
    await service.updateProfile(1, { phone: '0722000000' });
    expect(caen.describe).not.toHaveBeenCalled();
  });

  it('clears a field sent as null', async () => {
    const { service } = setup(accountant({ firmName: 'Cabinet' }));
    const profile = await service.updateProfile(1, { firmName: null });
    expect(profile.firmName).toBeNull();
  });

  it('stores CECCAR membership data', async () => {
    const { service } = setup();
    const profile = await service.updateProfile(1, {
      ceccarMember: true,
      professionalTitle: 'expert_contabil',
      ceccarNumber: '12345',
      ceccarBranch: 'București',
    });
    expect(profile).toMatchObject({
      ceccarMember: true,
      professionalTitle: 'expert_contabil',
      ceccarNumber: '12345',
      ceccarBranch: 'București',
    });
  });

  it('requires title and number for CECCAR members', async () => {
    const { service, repo } = setup();
    await expect(
      service.updateProfile(1, { ceccarMember: true, ceccarNumber: '12345' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('keeps stored CECCAR data when other fields change', async () => {
    const { service } = setup(
      accountant({
        ceccarMember: true,
        professionalTitle: 'contabil_autorizat',
        ceccarNumber: '999',
      }),
    );
    const profile = await service.updateProfile(1, { phone: '0722000000' });
    expect(profile).toMatchObject({
      ceccarMember: true,
      professionalTitle: 'contabil_autorizat',
      ceccarNumber: '999',
    });
  });

  it('clears CECCAR data when membership is turned off', async () => {
    const { service } = setup(
      accountant({
        ceccarMember: true,
        professionalTitle: 'expert_contabil',
        ceccarNumber: '12345',
        ceccarBranch: 'Cluj',
      }),
    );
    const profile = await service.updateProfile(1, {
      ceccarMember: false,
      ceccarNumber: '777',
    });
    expect(profile).toMatchObject({
      ceccarMember: false,
      professionalTitle: null,
      ceccarNumber: null,
      ceccarBranch: null,
    });
  });
});

describe('AccountantsService.changePassword', () => {
  const current = 'old-password-123';

  async function withPassword() {
    return setup(accountant({ passwordHash: await hashPassword(current) }));
  }

  it('stores a new scrypt hash', async () => {
    const { service, repo, qb } = await withPassword();
    await service.changePassword(1, {
      currentPassword: current,
      newPassword: 'new-password-456',
    });
    expect(qb.where).toHaveBeenCalledWith('a.id = :id', { id: 1 });
    const [criteria, data] = repo.update.mock.calls[0] as [
      unknown,
      { passwordHash: string },
    ];
    expect(criteria).toEqual({ id: 1 });
    await expect(
      verifyPassword('new-password-456', data.passwordHash),
    ).resolves.toBe(true);
  });

  it('rejects a wrong current password', async () => {
    const { service, repo } = await withPassword();
    await expect(
      service.changePassword(1, {
        currentPassword: 'wrong-password',
        newPassword: 'new-password-456',
      }),
    ).rejects.toThrow('Parola actuală este incorectă');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('rejects reusing the current password', async () => {
    const { service, repo } = await withPassword();
    await expect(
      service.changePassword(1, {
        currentPassword: current,
        newPassword: current,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('throws 404 for a missing accountant', async () => {
    const { service } = setup(null);
    await expect(
      service.changePassword(1, {
        currentPassword: current,
        newPassword: 'new-password-456',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
