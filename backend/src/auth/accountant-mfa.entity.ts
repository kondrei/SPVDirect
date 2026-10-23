import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('accountant_mfa')
export class AccountantMfa {
  @PrimaryColumn({
    name: 'accountant_id',
    type: 'integer',
    primaryKeyConstraintName: 'accountant_mfa_pkey',
  })
  accountantId: number;

  @Column({ type: 'text', nullable: true, select: false })
  secret: string | null;

  @Column({ name: 'app_enabled_at', type: 'timestamptz', nullable: true })
  appEnabledAt: Date | null;

  @Column({ name: 'email_enabled_at', type: 'timestamptz', nullable: true })
  emailEnabledAt: Date | null;

  @Column({ name: 'last_used_step', type: 'integer', nullable: true })
  lastUsedStep: number | null;

  @Column({ name: 'failed_attempts', type: 'integer', default: 0 })
  failedAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({
    name: 'recovery_hash',
    type: 'text',
    nullable: true,
    select: false,
  })
  recoveryHash: string | null;

  @Column({ name: 'recovery_failures', type: 'integer', default: 0 })
  recoveryFailures: number;

  @Column({
    name: 'email_code_hash',
    type: 'text',
    nullable: true,
    select: false,
  })
  emailCodeHash: string | null;

  @Column({
    name: 'email_code_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  emailCodeExpiresAt: Date | null;

  @Column({ name: 'email_code_sent_at', type: 'timestamptz', nullable: true })
  emailCodeSentAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
