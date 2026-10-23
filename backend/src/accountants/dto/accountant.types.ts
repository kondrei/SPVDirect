import type { Accountant } from '../accountant.entity.js';
import type { CaenInfo } from '../../open-data/caen.js';
import type { toProfile } from '../services/accountants.service.js';

export type AccountantProfile = ReturnType<typeof toProfile>;

export interface FirmLookup {
  firmCui: string;
  firmName: string;
  firmCaenCode: string | null;
  firmCaen: CaenInfo | null;
}

export type PendingAccountantData = Pick<
  Accountant,
  'email' | 'passwordHash' | 'name' | 'approvalTokenHash'
>;
