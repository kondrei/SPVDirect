import type { CaenService } from '../open-data/caen.service.js';
import type { Company } from './company.entity.js';

export async function toCompanyResponse(company: Company, caen: CaenService) {
  return Object.assign({}, company, {
    caen: await caen.tryDescribe(company.caenCode),
  });
}
