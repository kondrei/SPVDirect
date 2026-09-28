import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const PROFESSIONAL_TITLES = [
  'expert_contabil',
  'contabil_autorizat',
] as const;

export type ProfessionalTitle = (typeof PROFESSIONAL_TITLES)[number];

@Entity('accountants')
export class Accountant {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'accountants_pkey',
  })
  id: number;

  @Column({ type: 'citext', unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash: string;

  @Column({ type: 'text', nullable: true })
  name: string | null;

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
}
