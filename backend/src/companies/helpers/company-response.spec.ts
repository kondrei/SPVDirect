import type { CaenService } from '../../open-data/services/caen.service.js';
import type { Company } from '../company.entity.js';
import { toCompanyResponse } from './company-response.js';

const INFO = {
  code: '6920',
  name: 'Contabilitate',
  revision: 3,
  rev2Name: null,
};

describe('toCompanyResponse', () => {
  it('adds the CAEN name for the company code', async () => {
    const caen = { tryDescribe: vi.fn().mockResolvedValue(INFO) };
    const res = await toCompanyResponse(
      { id: 1, caenCode: '6920' } as Company,
      caen as unknown as CaenService,
    );
    expect(caen.tryDescribe).toHaveBeenCalledWith('6920');
    expect(res).toMatchObject({ id: 1, caenCode: '6920', caen: INFO });
  });

  it('returns null CAEN when the name is not available', async () => {
    const caen = { tryDescribe: vi.fn().mockResolvedValue(null) };
    const res = await toCompanyResponse(
      { caenCode: '6920' } as Company,
      caen as unknown as CaenService,
    );
    expect(res.caen).toBeNull();
  });
});

describe('toCompanyResponse logo flag', () => {
  it('tells the frontend whether the company has a logo without sending it', async () => {
    const caen = { tryDescribe: vi.fn().mockResolvedValue(null) };
    const withLogo = await toCompanyResponse(
      { id: 1, logoContentType: 'image/png' } as Company,
      caen as unknown as CaenService,
    );
    const without = await toCompanyResponse(
      { id: 2, logoContentType: null } as Company,
      caen as unknown as CaenService,
    );
    expect(withLogo.hasLogo).toBe(true);
    expect(without.hasLogo).toBe(false);
    expect(withLogo).not.toHaveProperty('logo');
  });
});
