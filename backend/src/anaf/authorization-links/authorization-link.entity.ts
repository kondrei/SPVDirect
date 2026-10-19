import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('authorization_links')
export class AuthorizationLink {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'authorization_links_pkey',
  })
  id: number;

  @Column({ name: 'accountant_id', type: 'integer' })
  accountantId: number;

  @Column({ name: 'company_id', type: 'integer' })
  companyId: number;

  @Column({ name: 'token_hash', type: 'text', unique: true })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'anaf_connection_id', type: 'integer', nullable: true })
  anafConnectionId: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
