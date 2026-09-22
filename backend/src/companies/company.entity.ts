import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** A client company (CUI) managed by an accountant. */
@Entity('companies')
@Unique('uq_companies_accountant_cui', ['accountantId', 'cui'])
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'accountant_id', type: 'uuid' })
  accountantId: string;

  /** Digits only, without the RO prefix. */
  @Column({ type: 'varchar', length: 20 })
  cui: string;

  @Column({ type: 'text' })
  name: string;

  /** The certificate used to call ANAF for this company. */
  @Column({ name: 'anaf_connection_id', type: 'uuid', nullable: true })
  anafConnectionId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
