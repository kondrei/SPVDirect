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

/** One ANAF OAuth grant, i.e. one qualified certificate authorized for this app. */
@Entity('anaf_connections')
@Unique('uq_anaf_connections_accountant_serial', ['accountantId', 'certSerial'])
export class AnafConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'accountant_id', type: 'uuid' })
  accountantId: string;

  @Column({ type: 'text' })
  label: string;

  /** `serial` claim of the ANAF access token: the certificate serial number. */
  @Column({ name: 'cert_serial', type: 'text' })
  certSerial: string;

  /** `role` claim, e.g. ['HELLO', 'EFACTURA', 'ETRANSPORT']. */
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

  @Column({ type: 'text', default: 'active' })
  status: AnafConnectionStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
