import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type AnafConnectionStatus = 'active' | 'expired' | 'revoked';
export type AnafConnectionSource = 'self' | 'link';

@Entity('anaf_connections')
@Unique('uq_anaf_connections_accountant_serial', ['accountantId', 'certSerial'])
export class AnafConnection {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'anaf_connections_pkey',
  })
  id: number;

  @Column({ name: 'accountant_id', type: 'integer' })
  accountantId: number;

  @Column({ type: 'text' })
  label: string;

  @Column({ name: 'cert_serial', type: 'text' })
  certSerial: string;

  @Column({ type: 'text', array: true, default: () => `'{}'` })
  roles: string[];

  @Column({ type: 'text' })
  source: AnafConnectionSource;

  @Column({ name: 'access_token_enc', type: 'text', select: false })
  accessTokenEnc: string;

  @Column({ name: 'refresh_token_enc', type: 'text', select: false })
  refreshTokenEnc: string;

  @Column({ name: 'access_expires_at', type: 'timestamptz' })
  accessExpiresAt: Date;

  @Column({ name: 'refresh_expires_at', type: 'timestamptz' })
  refreshExpiresAt: Date;

  @Column({ name: 'last_refreshed_at', type: 'timestamptz', nullable: true })
  lastRefreshedAt: Date | null;

  @Column({ name: 'token_call_at', type: 'timestamptz', nullable: true })
  tokenCallAt: Date | null;

  @Column({ name: 'refresh_started_at', type: 'timestamptz', nullable: true })
  refreshStartedAt: Date | null;

  @Column({
    name: 'denied_with_fresh_token_at',
    type: 'timestamptz',
    nullable: true,
  })
  deniedWithFreshTokenAt: Date | null;

  @Column({ type: 'text', default: 'active' })
  status: AnafConnectionStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
