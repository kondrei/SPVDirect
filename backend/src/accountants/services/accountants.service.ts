import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import type { Accountant } from '../accountant.entity.js';
import { AccountantRepository } from '../repositories/accountant.repository.js';
import type {
  ChangePasswordDto,
  UpdateProfileDto,
} from '../dto/profile.dto.js';
import type { AccountantProfile, FirmLookup } from '../dto/accountant.types.js';
import type { MfaSessionState } from '../../auth/dto/auth.types.js';

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
    private readonly accountantRepository: AccountantRepository,
    private readonly anafCompanyLookupService: AnafCompanyLookupService,
    private readonly caenService: CaenService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  findById(id: number): Promise<Accountant | null> {
    return this.accountantRepository.findById(id);
  }

  findSessionState(id: number): Promise<MfaSessionState | null> {
    return this.accountantRepository.findSessionState(id);
  }

  findByEmailWithPassword(email: string): Promise<Accountant | null> {
    return this.accountantRepository.findByEmailWithPassword(email);
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
    if (
      dto.firmCaenCode &&
      !(await this.caenService.describe(dto.firmCaenCode))
    ) {
      throw new BadRequestException(
        'Cod CAEN necunoscut în nomenclatorul CAEN',
      );
    }
    const saved = await this.accountantRepository.save(accountant);
    if (changed.length) {
      await this.activityLogsService.record(id, profileUpdated(changed));
    }
    return this.profile(saved);
  }

  async lookupFirm(accountantId: number, cui: string): Promise<FirmLookup> {
    const record = await this.anafCompanyLookupService.lookup(
      accountantId,
      cui,
    );
    if (!record) throw new BadRequestException(CUI_NOT_FOUND);
    const g = record.date_generale;
    const firmCaenCode = normalizeCaenCode(g.cod_CAEN);
    return {
      firmCui: cui,
      firmName: g.denumire.trim(),
      firmCaenCode,
      firmCaen: await this.caenService.tryDescribe(firmCaenCode),
    };
  }

  async changePassword(id: number, dto: ChangePasswordDto): Promise<void> {
    const accountant = await this.accountantRepository.findWithPassword(id);
    if (!accountant) throw new NotFoundException('Contul nu a fost găsit');
    if (!(await verifyPassword(dto.currentPassword, accountant.passwordHash))) {
      throw new BadRequestException('Parola actuală este incorectă');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'Parola nouă trebuie să fie diferită de cea actuală',
      );
    }
    await this.accountantRepository.updatePassword(
      id,
      await hashPassword(dto.newPassword),
      new Date(),
    );
    await this.activityLogsService.record(id, passwordChanged());
  }

  private async profile(a: Accountant): Promise<AccountantProfile> {
    return toProfile(a, await this.caenService.tryDescribe(a.firmCaenCode));
  }

  private async getOrThrow(id: number): Promise<Accountant> {
    const accountant = await this.findById(id);
    if (!accountant) throw new NotFoundException('Contul nu a fost găsit');
    return accountant;
  }
}
