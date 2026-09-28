import type { CaenService } from '../open-data/caen.service.js';
import type { Company } from './company.entity.js';
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
