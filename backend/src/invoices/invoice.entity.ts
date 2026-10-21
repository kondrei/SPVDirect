import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { numericTransformer } from '../common/numeric.transformer.js';
import type {
  InvoiceLine,
  InvoiceParty,
  VatBreakdownRow,
} from './dto/invoice.types.js';
import { Currency, PaymentMethod } from './dto/invoice.enums.js';

@Entity('invoices')
@Unique('uq_invoices_company_series_number', ['companyId', 'series', 'number'])
@Index('idx_invoices_accountant_issued', ['accountantId', 'issueDate'])
@Index('idx_invoices_company_buyer_cui', { synchronize: false })
@Index('idx_invoices_accountant_buyer_cui', { synchronize: false })
export class Invoice {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'invoices_pkey',
  })
  id: number;

  @Column({ name: 'accountant_id', type: 'integer' })
  accountantId: number;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @Column({ type: 'varchar', length: 10 })
  series: string;

  @Column({ type: 'integer' })
  number: number;

  @Column({ name: 'issue_date', type: 'date' })
  issueDate: string;

  @Column({ name: 'delivery_date', type: 'date' })
  deliveryDate: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'varchar', length: 3, default: Currency.RON })
  currency: Currency;

  @Column({
    name: 'exchange_rate',
    type: 'numeric',
    precision: 12,
    scale: 6,
    nullable: true,
    transformer: numericTransformer,
  })
  exchangeRate: number | null;

  @Column({
    name: 'payment_method',
    type: 'varchar',
    length: 20,
    default: PaymentMethod.Transfer,
  })
  paymentMethod: PaymentMethod;

  @Column({ name: 'vat_on_collection', type: 'boolean', default: false })
  vatOnCollection: boolean;

  @Column({ type: 'jsonb' })
  seller: InvoiceParty;

  @Column({ type: 'jsonb' })
  buyer: InvoiceParty;

  @Column({ type: 'jsonb' })
  lines: InvoiceLine[];

  @Column({ name: 'vat_breakdown', type: 'jsonb' })
  vatBreakdown: VatBreakdownRow[];

  @Column({
    name: 'total_net',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  totalNet: number;

  @Column({
    name: 'total_vat',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  totalVat: number;

  @Column({
    name: 'total_gross',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  totalGross: number;

  @Column({
    name: 'total_vat_ron',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  totalVatRon: number;

  @Column({ name: 'storno_of_invoice_id', type: 'integer', nullable: true })
  stornoOfInvoiceId: number | null;

  @Column({
    name: 'storno_of_series',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  stornoOfSeries: string | null;

  @Column({ name: 'storno_of_number', type: 'integer', nullable: true })
  stornoOfNumber: number | null;

  @Column({ name: 'storno_of_issue_date', type: 'date', nullable: true })
  stornoOfIssueDate: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'storage_path', type: 'text', nullable: true })
  storagePath: string | null;

  @Column({ name: 'emailed_to', type: 'text', nullable: true })
  emailedTo: string | null;

  @Column({ name: 'emailed_at', type: 'timestamptz', nullable: true })
  emailedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
