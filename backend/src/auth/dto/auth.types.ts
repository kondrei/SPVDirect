import type { Accountant } from '../../accountants/accountant.entity.js';

export type PendingRegistration = Pick<
  Accountant,
  'id' | 'email' | 'name' | 'createdAt'
>;

export interface AdminApprovalRequest {
  accountantId: number;
  email: string;
  name: string | null;
  approvalToken: string;
}
