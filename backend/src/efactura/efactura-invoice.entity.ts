import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AnafEnvironment } from '../anaf/dto/anaf.enums.js';
import { numericTransformer } from '../common/numeric.transformer.js';
import { EfacturaDirection, EfacturaStandard } from './dto/efactura.enums.js';
import type { EinvoiceLine } from './dto/efactura.types.js';

@Entity('efactura_invoices')
@Index('uq_efactura_invoices_message', { synchronize: false })
@Index('idx_efactura_invoices_list', { synchronize: false })
export class EfacturaInvoice {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'efactura_invoices_pkey',
  })
  id: number;

  @Column({ name: 'accountant_id', type: 'integer' })
  accountantId: number;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @Column({ name: 'anaf_connection_id', type: 'integer', nullable: true })
  anafConnectionId: number | null;

  @Column({ type: 'varchar', length: 4 })
  environment: AnafEnvironment;

  @Column({ name: 'anaf_message_id', type: 'varchar', length: 20 })
  anafMessageId: string;

  @Column({ name: 'upload_index', type: 'varchar', length: 20, nullable: true })
  uploadIndex: string | null;

  @Column({ name: 'message_created_at', type: 'timestamptz', nullable: true })
  messageCreatedAt: Date | null;

  @Column({ type: 'varchar', length: 8 })
  direction: EfacturaDirection;

  @Column({ type: 'varchar', length: 4 })
  standard: EfacturaStandard;

  @Column({ name: 'type_code', type: 'varchar', length: 3, nullable: true })
  typeCode: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  number: string | null;

  @Column({ name: 'issue_date', type: 'date', nullable: true })
  issueDate: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string | null;

  @Column({ name: 'supplier_cui', type: 'varchar', length: 32, nullable: true })
  supplierCui: string | null;

  @Column({ name: 'supplier_name', type: 'text', nullable: true })
  supplierName: string | null;

  @Column({ name: 'customer_cui', type: 'varchar', length: 32, nullable: true })
  customerCui: string | null;

  @Column({ name: 'customer_name', type: 'text', nullable: true })
  customerName: string | null;

  @Column({
    name: 'total_net',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  totalNet: number | null;

  @Column({
    name: 'total_vat',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  totalVat: number | null;

  @Column({
    name: 'total_gross',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  totalGross: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  lines: EinvoiceLine[];

  @Column({ name: 'parse_error', type: 'text', nullable: true })
  parseError: string | null;

  @Column({ name: 'invoice_id', type: 'integer', nullable: true })
  invoiceId: number | null;

  @Column({ name: 'zip_content', type: 'bytea', nullable: true, select: false })
  zipContent: Buffer | null;

  @Column({ name: 'zip_storage_path', type: 'text', nullable: true })
  zipStoragePath: string | null;

  @Column({ name: 'pdf_content', type: 'bytea', nullable: true, select: false })
  pdfContent: Buffer | null;

  @Column({ name: 'pdf_storage_path', type: 'text', nullable: true })
  pdfStoragePath: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
