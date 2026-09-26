import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { AnafTvaRecord } from './anaf-company-info.js';

@Entity('companies')
@Unique('uq_companies_accountant_cui', ['accountantId', 'cui'])
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

  @Column({ name: 'anaf_connection_id', type: 'uuid', nullable: true })
  anafConnectionId: string | null;

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

  @Column({ name: 'anaf_data', type: 'jsonb', nullable: true })
  anafData: AnafTvaRecord | null;

  @Column({ name: 'anaf_synced_at', type: 'timestamptz', nullable: true })
  anafSyncedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
