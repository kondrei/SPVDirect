import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One-time link an accountant sends to a company's certificate holder so they
 * can authorize SPVDirect with their own USB token / cloud certificate.
 */
@Entity('authorization_links')
export class AuthorizationLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'accountant_id', type: 'uuid' })
  accountantId: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  /** SHA-256 of the random link token; the token itself is never stored. */
  @Column({ name: 'token_hash', type: 'text', unique: true })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'anaf_connection_id', type: 'uuid', nullable: true })
  anafConnectionId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
