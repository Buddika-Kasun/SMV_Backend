import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { StorageService } from '../../config/storage.service';
import { ConsultancyAgreement, ConsultancyStatus } from '../../shared/types';
import { consultancyId } from '../../common/utils/id';
import { addMonthsISO, diffDays, todayISO } from '../../common/utils/dates';
import { CreateConsultancyDto, ReturnFundsDto } from './dto/consultancy.dto';

const FIXED_TERM_MONTHS = 6;
const MATURITY_WARNING_WINDOW_DAYS = 30;

@Injectable()
export class ConsultancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(status?: string, search?: string): Promise<ConsultancyAgreement[]> {
    const rows = await this.prisma.consultancyAgreement.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { customerName: { contains: search, mode: 'insensitive' } },
                { agreementNumber: { contains: search, mode: 'insensitive' } },
                { customerPhone: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    const agreements = rows.map((row: any) => this.withRecalculatedStatus(this.fromRow(row)));
    return Promise.all(agreements.map((a: any) => this.hydratePassbook(a)));
  }

  async getOne(id: string): Promise<ConsultancyAgreement> {
    const agreement = this.withRecalculatedStatus(await this.requireAgreement(id));
    return this.hydratePassbook(agreement);
  }

  async create(input: CreateConsultancyDto): Promise<ConsultancyAgreement> {
    const seq = await this.prisma.consultancyAgreement.count();
    const id = consultancyId(seq + 1);
    const agreement: ConsultancyAgreement = {
      id,
      agreementNumber: id,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail ?? '',
      nationalIdNumber: input.nationalIdNumber,
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      lastStatementBalance: input.lastStatementBalance,
      lastStatementDate: input.lastStatementDate,
      placedAmount: input.placedAmount,
      startDate: input.startDate.split('T')[0],
      maturityDate: addMonthsISO(input.startDate.split('T')[0], FIXED_TERM_MONTHS),
      termMonths: FIXED_TERM_MONTHS,
      monthlyConsultancyFee: input.monthlyConsultancyFee,
      status: 'Active Placed',
      notes: input.notes,
      createdDate: todayISO(),
    };

    await this.prisma.consultancyAgreement.create({ data: this.toColumns(agreement) as any });
    return agreement;
  }

  async returnFunds(id: string, input: ReturnFundsDto): Promise<ConsultancyAgreement> {
    const agreement = await this.requireAgreement(id);
    if (agreement.status === 'Returned & Closed') {
      throw new BadRequestException('Funds already returned for this agreement');
    }
    agreement.returnRecord = {
      id: `RET-${agreement.id.replace(/\D/g, '').slice(-6)}`,
      returnDate: input.returnDate.split('T')[0],
      returnedAmount: input.returnedAmount,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber,
      processedBy: input.processedBy,
      notes: input.notes,
    };
    agreement.status = 'Returned & Closed';
    await this.persist(agreement);
    return agreement;
  }

  /**
   * Step 1 - Initiate a passbook upload.
   * Builds an object key and returns a presigned PUT URL. Nothing is persisted
   * until the file has actually been uploaded and confirmed via confirmPassbook().
   */
  async presignPassbook(
    id: string,
    fileName: string,
    contentType: string,
  ): Promise<{ key: string; uploadUrl: string }> {
    await this.requireAgreement(id);
    const key = this.storage.buildKey(`consultancy/${id}/passbook`, fileName);
    const uploadUrl = await this.storage.presignPut(key, contentType);
    return { key, uploadUrl };
  }

  /**
   * Step 2 - Confirm the passbook upload.
   * Verifies the object exists in the bucket, persists the object key into the
   * passbook_key column and returns the agreement with a presigned GET URL.
   */
  async confirmPassbook(id: string, key: string, fileName?: string): Promise<ConsultancyAgreement> {
    const agreement = await this.requireAgreement(id);
    if (!(await this.storage.exists(key))) {
      throw new BadRequestException(
        `Object "${key}" was not found in the bucket. Upload it against the presigned URL first.`,
      );
    }
    agreement.passbookKey = key;
    agreement.passbookUrl = await this.storage.presignGet(key);
    if (fileName) {
      agreement.notes = agreement.notes
        ? `${agreement.notes}\nPassbook: ${fileName}`
        : `Passbook: ${fileName}`;
    }
    await this.persist(agreement);
    return agreement;
  }

  // ---------------------------------------------------------------------------

  private async requireAgreement(id: string): Promise<ConsultancyAgreement> {
    const row = await this.prisma.consultancyAgreement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Consultancy agreement not found');
    return this.fromRow(row);
  }

  private fromRow(row: any): ConsultancyAgreement {
    const data = (row.data ?? {}) as ConsultancyAgreement;
    return {
      ...data,
      id: row.id,
      agreementNumber: row.agreementNumber,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      customerEmail: row.customerEmail ?? '',
      nationalIdNumber: row.nationalIdNumber,
      placedAmount: this.prisma.toNumber(row.placedAmount),
      startDate: row.startDate.toISOString().slice(0, 10),
      maturityDate: row.maturityDate.toISOString().slice(0, 10),
      status: row.status as ConsultancyStatus,
      passbookKey: row.passbookKey ?? undefined,
    };
  }

  private toColumns(a: ConsultancyAgreement): Record<string, unknown> {
    return {
      id: a.id,
      agreementNumber: a.agreementNumber,
      customerName: a.customerName,
      customerPhone: a.customerPhone,
      customerEmail: a.customerEmail || null,
      nationalIdNumber: a.nationalIdNumber,
      placedAmount: a.placedAmount,
      startDate: new Date(`${a.startDate}T00:00:00`),
      maturityDate: new Date(`${a.maturityDate}T00:00:00`),
      status: a.status,
      passbookKey: a.passbookKey ?? null,
      data: a as unknown as Record<string, unknown>,
    };
  }

  /** Refreshes the (short-lived) presigned GET URL when a passbook key exists. */
  private async hydratePassbook(agreement: ConsultancyAgreement): Promise<ConsultancyAgreement> {
    if (agreement.passbookKey) {
      agreement.passbookUrl = await this.storage.presignGet(agreement.passbookKey);
    }
    return agreement;
  }

  private async persist(agreement: ConsultancyAgreement): Promise<void> {
    await this.prisma.consultancyAgreement.update({
      where: { id: agreement.id },
      data: { ...this.toColumns(agreement), status: agreement.status } as any,
    });
  }

  private withRecalculatedStatus(agreement: ConsultancyAgreement): ConsultancyAgreement {
    if (agreement.status === 'Returned & Closed') return agreement;
    const today = todayISO();
    if (diffDays(today, agreement.maturityDate) < 0) {
      agreement.status = 'Maturity Reached';
    } else if (diffDays(today, agreement.maturityDate) <= MATURITY_WARNING_WINDOW_DAYS) {
      agreement.status = 'Maturing Soon';
    } else {
      agreement.status = 'Active Placed';
    }
    return agreement;
  }
}