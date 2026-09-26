import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Accountant } from './accountant.entity.js';

@Injectable()
export class AccountantsService {
  constructor(
    @InjectRepository(Accountant)
    private readonly accountants: Repository<Accountant>,
  ) {}

  findById(id: string): Promise<Accountant | null> {
    return this.accountants.findOneBy({ id });
  }

  findByEmailWithPassword(email: string): Promise<Accountant | null> {
    return this.accountants
      .createQueryBuilder('a')
      .addSelect('a.passwordHash')
      .where('a.email = :email', { email })
      .getOne();
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.accountants.existsBy({ email });
  }

  create(data: {
    email: string;
    passwordHash: string;
    name: string | null;
  }): Promise<Accountant> {
    return this.accountants.save(this.accountants.create(data));
  }
}
