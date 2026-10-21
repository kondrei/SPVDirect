import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  passwordChanged,
  profileUpdated,
} from '../../api-logs/activity-entries.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { normalizeCaenCode, type CaenInfo } from '../../open-data/caen.js';
import { CaenService } from '../../open-data/services/caen.service.js';
import { hashPassword, verifyPassword } from '../../common/crypto/password.js';
import { AnafCompanyLookupService } from '../../companies/services/anaf-company-lookup.service.js';
import { CUI_NOT_FOUND } from '../../companies/services/companies.service.js';
import { Accountant } from '../accountant.entity.js';
import type {
  ChangePasswordDto,
  UpdateProfileDto,
} from '../dto/profile.dto.js';
import type { AccountantProfile, FirmLookup } from '../dto/accountant.types.js';

export function toProfile(a: Accountant, firmCaen: CaenInfo | null) {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    phone: a.phone,
    ceccarMember: a.ceccarMember,
    professionalTitle: a.professionalTitle,
    ceccarNumber: a.ceccarNumber,
    ceccarBranch: a.ceccarBranch,
    ccfNumber: a.ccfNumber,
    firmName: a.firmName,
    firmCui: a.firmCui,
    firmCaenCode: a.firmCaenCode,
    firmCaen,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

@Injectable()
export class AccountantsService {
  constructor(
    @InjectRepository(Accountant)
    private readonly accountants: Repository<Accountant>,
    private readonly anafLookup: AnafCompanyLookupService,
    private readonly caen: CaenService,
    private readonly activity: ActivityLogsService,
  ) {}

  findById(id: number): Promise<Accountant | null> {
    return this.accountants.findOneBy({ id });
  }

  findSessionState(
    id: number,
  ): Promise<Pick<Accountant, 'status' | 'passwordChangedAt'> | null> {
    return this.accountants.findOne({
      where: { id },
      select: { id: true, status: true, passwordChangedAt: true },
    });
  }

  findByEmailWithPassword(email: string): Promise<Accountant | null> {
    return this.accountants
      .createQueryBuilder('a')
      .addSelect('a.passwordHash')
      .where('a.email = :email', { email })
      .getOne();
  }

  async getProfile(id: number): Promise<AccountantProfile> {
    return this.profile(await this.getOrThrow(id));
  }

  async updateProfile(
    id: number,
    dto: UpdateProfileDto,
  ): Promise<AccountantProfile> {
    const accountant = await this.getOrThrow(id);
    const changed: string[] = [];
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined) continue;
      if (accountant[key as keyof Accountant] !== value) changed.push(key);
      Object.assign(accountant, { [key]: value });
    }
    if (!accountant.ceccarMember) {
      accountant.professionalTitle = null;
      accountant.ceccarNumber = null;
      accountant.ceccarBranch = null;
    } else if (!accountant.professionalTitle || !accountant.ceccarNumber) {
      throw new BadRequestException(
        'Pentru membrii CECCAR completați calitatea profesională și numărul de legitimație',
      );
    }
    if (dto.firmCaenCode && !(await this.caen.describe(dto.firmCaenCode))) {
      throw new BadRequestException(
        'Cod CAEN necunoscut în nomenclatorul CAEN',
      );
    }
    const saved = await this.accountants.save(accountant);
    if (changed.length) {
      await this.activity.record(id, profileUpdated(changed));
    }
    return this.profile(saved);
  }

  async lookupFirm(accountantId: number, cui: string): Promise<FirmLookup> {
    const record = await this.anafLookup.lookup(accountantId, cui);
    if (!record) throw new BadRequestException(CUI_NOT_FOUND);
    const g = record.date_generale;
    const firmCaenCode = normalizeCaenCode(g.cod_CAEN);
    return {
      firmCui: cui,
      firmName: g.denumire.trim(),
      firmCaenCode,
      firmCaen: await this.caen.tryDescribe(firmCaenCode),
    };
  }

  async changePassword(id: number, dto: ChangePasswordDto): Promise<void> {
    const accountant = await this.accountants
      .createQueryBuilder('a')
      .addSelect('a.passwordHash')
      .where('a.id = :id', { id })
      .getOne();
    if (!accountant) throw new NotFoundException('Contul nu a fost găsit');
    if (!(await verifyPassword(dto.currentPassword, accountant.passwordHash))) {
      throw new BadRequestException('Parola actuală este incorectă');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'Parola nouă trebuie să fie diferită de cea actuală',
      );
    }
    await this.accountants.update(
      { id },
      {
        passwordHash: await hashPassword(dto.newPassword),
        passwordChangedAt: new Date(),
      },
    );
    await this.activity.record(id, passwordChanged());
  }

  private async profile(a: Accountant): Promise<AccountantProfile> {
    return toProfile(a, await this.caen.tryDescribe(a.firmCaenCode));
  }

  private async getOrThrow(id: number): Promise<Accountant> {
    const accountant = await this.findById(id);
    if (!accountant) throw new NotFoundException('Contul nu a fost găsit');
    return accountant;
  }
}
