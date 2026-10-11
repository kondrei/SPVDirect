import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type UploadStatus = 'processing' | 'ok' | 'nok' | 'rejected';
export type EfacturaStandard = 'UBL' | 'CN' | 'CII' | 'RASP';

@Entity('efactura_uploads')
@Index('idx_efactura_uploads_accountant', ['accountantId', 'id'])
export class EfacturaUpload {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'efactura_uploads_pkey',
  })
  id: number;

  @Column({ name: 'accountant_id', type: 'integer' })
  accountantId: number;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @Column({ name: 'invoice_id', type: 'integer', nullable: true })
  invoiceId: number | null;

  @Column({ name: 'anaf_connection_id', type: 'uuid', nullable: true })
  anafConnectionId: string | null;

  @Column({ type: 'varchar', length: 4 })
  environment: 'test' | 'prod';

  @Column({ type: 'varchar', length: 4 })
  standard: EfacturaStandard;

  @Column({ name: 'upload_index', type: 'varchar', length: 20, nullable: true })
  uploadIndex: string | null;

  @Column({ type: 'varchar', length: 12 })
  status: UploadStatus;

  @Column({ name: 'download_id', type: 'varchar', length: 20, nullable: true })
  downloadId: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'checked_at', type: 'timestamptz', nullable: true })
  checkedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
