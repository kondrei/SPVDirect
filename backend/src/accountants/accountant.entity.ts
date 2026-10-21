import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountStatus, ProfessionalTitle } from './dto/accountant.enums.js';

@Entity('accountants')
@Index('accountants_email_key', { synchronize: false })
@Index('idx_accountants_deleted_at', { synchronize: false })
export class Accountant {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'accountants_pkey',
  })
  id: number;

  @Column({ type: 'citext' })
  email: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash: string;

  @Column({ type: 'text', nullable: true })
  name: string | null;

  @Column({ type: 'text', default: AccountStatus.Pending })
  status: AccountStatus;

  @Column({
    name: 'approval_token_hash',
    type: 'text',
    nullable: true,
    unique: true,
    select: false,
  })
  approvalTokenHash: string | null;

  @Column({ name: 'admin_notified_at', type: 'timestamptz', nullable: true })
  adminNotifiedAt: Date | null;

  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true })
  passwordChangedAt: Date | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ name: 'ceccar_member', type: 'boolean', default: false })
  ceccarMember: boolean;

  @Column({ name: 'professional_title', type: 'text', nullable: true })
  professionalTitle: ProfessionalTitle | null;

  @Column({
    name: 'ceccar_number',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  ceccarNumber: string | null;

  @Column({ name: 'ceccar_branch', type: 'text', nullable: true })
  ceccarBranch: string | null;

  @Column({ name: 'ccf_number', type: 'varchar', length: 20, nullable: true })
  ccfNumber: string | null;

  @Column({ name: 'firm_name', type: 'text', nullable: true })
  firmName: string | null;

  @Column({ name: 'firm_cui', type: 'varchar', length: 10, nullable: true })
  firmCui: string | null;

  @Column({
    name: 'firm_caen_code',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  firmCaenCode: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
