import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { AnafTvaRecord } from './helpers/anaf-company-info.js';

@Entity('companies')
@Index('uq_companies_accountant_cui', { synchronize: false })
@Index('idx_companies_deleted_at', { synchronize: false })
export class Company {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'companies_pkey',
  })
  id: number;

  @Column({ name: 'accountant_id', type: 'integer' })
  accountantId: number;

  @Column({ type: 'varchar', length: 20 })
  cui: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'anaf_connection_id', type: 'integer', nullable: true })
  anafConnectionId: number | null;

  @Column({ name: 'reg_com', type: 'text', nullable: true })
  regCom: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'caen_code', type: 'varchar', length: 10, nullable: true })
  caenCode: string | null;

  @Column({ name: 'registration_status', type: 'text', nullable: true })
  registrationStatus: string | null;

  @Column({ name: 'vat_payer', type: 'boolean', nullable: true })
  vatPayer: boolean | null;

  @Column({ name: 'vat_on_collection', type: 'boolean', nullable: true })
  vatOnCollection: boolean | null;

  @Column({ name: 'split_vat', type: 'boolean', nullable: true })
  splitVat: boolean | null;

  @Column({ name: 'e_factura', type: 'boolean', nullable: true })
  eFactura: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  inactive: boolean | null;

  @Column({ type: 'varchar', length: 34, nullable: true })
  iban: string | null;

  @Column({ name: 'bank_name', type: 'text', nullable: true })
  bankName: string | null;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'bytea', nullable: true, select: false })
  logo: Buffer | null;

  @Column({
    name: 'logo_content_type',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  logoContentType: string | null;

  @Column({ name: 'anaf_data', type: 'jsonb', nullable: true })
  anafData: AnafTvaRecord | null;

  @Column({ name: 'anaf_synced_at', type: 'timestamptz', nullable: true })
  anafSyncedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
