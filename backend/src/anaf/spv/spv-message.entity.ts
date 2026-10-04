import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('spv_messages')
@Unique('uq_spv_messages_accountant_message', ['accountantId', 'anafMessageId'])
@Index('idx_spv_messages_accountant_created', ['accountantId', 'anafCreatedAt'])
export class SpvMessage {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'spv_messages_pkey',
  })
  id: number;

  @Column({ name: 'accountant_id', type: 'integer' })
  accountantId: number;

  @Column({ name: 'anaf_connection_id', type: 'uuid', nullable: true })
  anafConnectionId: string | null;

  @Column({ name: 'company_id', type: 'integer', nullable: true })
  companyId: number | null;

  @Column({ name: 'anaf_message_id', type: 'varchar', length: 30 })
  anafMessageId: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cif: string | null;

  @Column({ type: 'text', nullable: true })
  type: string | null;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 30, nullable: true })
  requestId: string | null;

  @Column({ name: 'anaf_created_at', type: 'timestamptz', nullable: true })
  anafCreatedAt: Date | null;

  @Column({
    name: 'anaf_created_raw',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  anafCreatedRaw: string | null;

  @Column({ type: 'bytea', nullable: true, select: false })
  content: Buffer | null;

  @Column({ name: 'storage_path', type: 'text', nullable: true })
  storagePath: string | null;

  @Column({ name: 'content_type', type: 'text', nullable: true })
  contentType: string | null;

  @Column({ name: 'size_bytes', type: 'integer', nullable: true })
  sizeBytes: number | null;

  @Column({ name: 'downloaded_at', type: 'timestamptz', nullable: true })
  downloadedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
