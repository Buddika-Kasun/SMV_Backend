import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { StorageService } from '../../config/storage.service';
import {
  KYCData,
  KYCDocument,
  KYCDocumentType,
  Loan,
  PaymentRecord,
} from '../../shared/types';
import {
  allocatePayment,
  calculateEarlySettlementQuote,
  computeLoan,
  generateSchedule,
  roundTo,
} from '../../common/utils/financial';
import { loanId, paymentId, randomSuffix } from '../../common/utils/id';
import { nowISO, todayISO } from '../../common/utils/dates';
import { SmsService } from '../sms/sms.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { RecordPaymentDto, ExecuteSettlementDto } from './dto/payment-settlement.dto';
import { UpdateKYCDto } from './dto/loan-transition.dto';

const PRE_DISBURSE = ['Pending Approval', 'KYC Pending', 'Approved - Pending Disbursement'];
const CLOSED = ['Settled', 'Early Settled', 'Rejected'];

type LoanRow = Awaited<ReturnType<PrismaService['loan']['findUnique']>>;

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly sms: SmsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Read path
  // ---------------------------------------------------------------------------

  async list(status?: string, search?: string): Promise<Loan[]> {
    const rows = await this.prisma.loan.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { customerName: { contains: search, mode: 'insensitive' } },
                { accountNumber: { contains: search, mode: 'insensitive' } },
                { customerPhone: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      rows.map(async (row: any) => {
        const loan = computeLoan(this.fromRow(row));
        await this.hydrateKycDocuments(loan);
        return loan;
      }),
    );
  }

  async getOne(id: string): Promise<Loan> {
    const loan = computeLoan(await this.requireLoan(id));
    await this.hydrateKycDocuments(loan);
    return loan;
  }

  async create(input: CreateLoanDto): Promise<Loan> {
    const seq = await this.prisma.loan.count();
    const id = loanId(seq + 1);
    const today = todayISO();

    const kyc: KYCData = {
      nationalIdNumber: input.nationalIdNumber,
      idType: 'NIC',
      dateOfBirth: '',
      gender: '',
      occupation: input.occupation,
      employerName: input.employerName,
      monthlyIncome: roundTo(input.monthlyIncome),
      addressLine: input.addressLine,
      city: input.city,
      postalCode: input.postalCode,
      guarantorName: input.guarantorName,
      guarantorPhone: input.guarantorPhone,
      guarantorRelation: input.guarantorRelation,
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      documents: [],
      isVerified: false,
    };

    const schedule = generateSchedule({
      principal: input.requestedAmount,
      annualRatePct: input.interestRatePerAnnum,
      termMonths: input.termMonths,
      frequency: input.repaymentFrequency,
      method: input.interestMethod,
      startDate: today,
    });

    const loan: Loan = {
      id,
      accountNumber: id,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail ?? '',
      loanType: input.loanType,
      requestedAmount: roundTo(input.requestedAmount),
      disbursedAmount: 0,
      interestRatePerAnnum: input.interestRatePerAnnum,
      termMonths: input.termMonths,
      repaymentFrequency: input.repaymentFrequency,
      interestMethod: input.interestMethod,
      processingFee: 0,
      earlySettlementPenaltyPercent: 2,
      status: 'Pending Approval',
      requestedDate: today,
      kyc,
      installments: schedule.installments,
      payments: [],
      totalPaidAmount: 0,
      outstandingBalance: roundTo(schedule.totalPayable),
      purpose: input.purpose,
      creditScore: 0,
    };

    await this.prisma.loan.create({ data: this.toColumns(loan) as any });
    return computeLoan(loan);
  }

  // ---------------------------------------------------------------------------
  // Persistence helpers
  // ---------------------------------------------------------------------------

  private async requireLoan(id: string): Promise<Loan> {
    const row = await this.prisma.loan.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Loan not found');
    return this.fromRow(row);
  }

  private fromRow(row: NonNullable<LoanRow>): Loan {
    const data = (row.data ?? {}) as unknown as Loan;
    // Denormalised scalar columns are authoritative for money fields.
    return {
      ...data,
      id: row.id,
      accountNumber: row.accountNumber,
      requestedAmount: this.prisma.toNumber(row.requestedAmount),
      disbursedAmount: this.prisma.toNumber(row.disbursedAmount),
      interestRatePerAnnum: this.prisma.toNumber(row.interestRate),
      status: data.status as Loan['status'],
    };
  }

  private toColumns(loan: Loan): Record<string, unknown> {
    return {
      id: loan.id,
      accountNumber: loan.accountNumber,
      customerName: loan.customerName,
      customerPhone: loan.customerPhone,
      customerEmail: loan.customerEmail || null,
      loanType: loan.loanType,
      requestedAmount: loan.requestedAmount,
      disbursedAmount: loan.disbursedAmount,
      interestRate: loan.interestRatePerAnnum,
      termMonths: loan.termMonths,
      status: loan.status,
      data: loan as unknown as Record<string, unknown>,
    };
  }

  private async persist(loan: Loan): Promise<void> {
    await this.prisma.loan.update({
      where: { id: loan.id },
      data: { ...this.toColumns(loan), status: loan.status } as any,
    });
  }
// ---------------------------------------------------------------------------
  // Lifecycle transitions
  // ---------------------------------------------------------------------------

  async approve(id: string, notes?: string): Promise<Loan> {
    const loan = await this.requireLoan(id);
    if (loan.status !== 'Pending Approval') {
      throw new BadRequestException('Only Pending Approval loans can be approved');
    }
    loan.status = 'KYC Pending';
    loan.approvedDate = loan.approvedDate ?? todayISO();
    await this.persist(loan);
    return computeLoan(loan);
  }

  async reject(id: string, reason: string): Promise<Loan> {
    const loan = await this.requireLoan(id);
    if (!PRE_DISBURSE.includes(loan.status)) {
      throw new BadRequestException('Loan cannot be rejected at this stage');
    }
    loan.status = 'Rejected';
    loan.rejectedAt = nowISO();
    loan.rejectReason = reason;
    await this.persist(loan);
    return loan;
  }

  async updateKYC(id: string, dto: UpdateKYCDto, actor?: { username?: string; fullName?: string }): Promise<Loan> {
    const loan = await this.requireLoan(id);
    if (loan.status === 'Rejected') throw new BadRequestException('Rejected loans cannot be edited');

    const merged: KYCData = {
      ...loan.kyc,
      ...dto.kycData,
      documents: dto.kycData.documents ?? loan.kyc.documents,
    };
    if (dto.verified !== undefined) merged.isVerified = dto.verified;
    if (merged.isVerified) {
      merged.verifiedAt = merged.verifiedAt ?? todayISO();
      merged.verifiedBy = merged.verifiedBy ?? actor?.fullName ?? actor?.username ?? 'system';
    }
    loan.kyc = merged;

    if (loan.status === 'KYC Pending' && merged.isVerified) {
      loan.status = 'Approved - Pending Disbursement';
    }

    await this.persist(loan);
    return computeLoan(loan);
  }

  async disburse(id: string): Promise<Loan> {
    const loan = await this.requireLoan(id);
    if (loan.status !== 'Approved - Pending Disbursement') {
      throw new BadRequestException('Loan must be Approved - Pending Disbursement to disburse');
    }
    loan.disbursedAmount = loan.requestedAmount;
    loan.disbursedDate = todayISO();
    loan.status = 'Active';
    await this.persist(loan);
    return computeLoan(loan);
  }
// ---------------------------------------------------------------------------
  // KYC document uploads (storage bucket + presigned URLs)
  // ---------------------------------------------------------------------------

  /**
   * Step 1 - Issue a presigned PUT URL for a KYC document. The object key is
   * namespaced under loans/{id}/kyc. Nothing is persisted to the loan yet.
   */
  async presignDocument(
    id: string,
    input: { fileName: string; contentType: string; documentType: KYCDocumentType },
  ): Promise<{ documentId: string; key: string; uploadUrl: string }> {
    await this.requireLoan(id);
    const documentId = `DOC-${randomSuffix(8)}`;
    const key = this.storage.buildKey(`loans/${id}/kyc`, input.fileName);
    const uploadUrl = await this.storage.presignPut(key, input.contentType);
    return { documentId, key, uploadUrl };
  }

  /**
   * Step 2 - Attach an uploaded KYC document to the loan. The object key is
   * persisted inside loan.data.kyc.documents[] (fileKey), and each read
   * re-issues a fresh presigned GET URL.
   */
  async attachDocument(
    id: string,
    input: { documentId: string; key: string; documentType: KYCDocumentType; fileName: string },
  ): Promise<Loan> {
    const loan = await this.requireLoan(id);
    if (!(await this.storage.exists(input.key))) {
      throw new BadRequestException(
        `Object "${input.key}" was not found in the bucket. Upload it against the presigned URL first.`,
      );
    }
    if (loan.kyc.documents.some((d) => d.id === input.documentId)) {
      throw new BadRequestException('A document with this ID is already attached');
    }

    const document: KYCDocument = {
      id: input.documentId,
      type: input.documentType,
      fileName: input.fileName,
      fileKey: input.key,
      fileUrl: await this.storage.presignGet(input.key),
      status: 'Pending Review',
      uploadedAt: nowISO(),
    };
    loan.kyc.documents = [...(loan.kyc.documents ?? []), document];
    await this.persist(loan);
    return computeLoan(loan);
  }

  /** Refresh short-lived presigned GET urls for every KYC document with a key. */
  private async hydrateKycDocuments(loan: Loan): Promise<void> {
    if (!loan.kyc?.documents?.length) return;
    await Promise.all(
      loan.kyc.documents.map(async (doc) => {
        if (doc.fileKey) {
          doc.fileUrl = await this.storage.presignGet(doc.fileKey);
        }
        return doc;
      }),
    );
  }
// ---------------------------------------------------------------------------
  // Payments
  // ---------------------------------------------------------------------------

  async receivePayment(id: string, dto: RecordPaymentDto): Promise<Loan> {
    const loan = await this.requireLoan(id);
    if (CLOSED.includes(loan.status) || PRE_DISBURSE.includes(loan.status)) {
      throw new BadRequestException('Payments are only accepted on Active/Overdue loans');
    }

    const refDate = dto.paymentDate ? dto.paymentDate.slice(0, 10) : todayISO();
    const amount = roundTo(dto.amount);
    const alloc = allocatePayment(loan, amount, refDate);

    const seq = await this.prisma.payment.count();
    const record: PaymentRecord = {
      id: paymentId(seq + 1),
      loanId: loan.id,
      customerName: loan.customerName,
      amount,
      paymentDate: refDate,
      paymentMethod: dto.paymentMethod,
      referenceNumber: dto.referenceNumber,
      receivedBy: dto.receivedBy,
      notes: dto.notes,
      allocatedPrincipal: roundTo(alloc.principalAllocated),
      allocatedInterest: roundTo(alloc.interestAllocated),
      allocatedLateFee: roundTo(alloc.lateFeeAllocated),
      installmentNumbersCovered: alloc.coveredInstallmentNumbers,
    };

    loan.payments.push(record);
    computeLoan(loan, refDate);

    const smsResult = await this.smsPaymentAlert(loan, record);
    record.smsStatus = smsResult.status;
    record.smsRecipient = smsResult.recipient;
    record.smsMessage = smsResult.message;

    await this.prisma.payment.create({
      data: {
        id: record.id,
        loanId: loan.id,
        customerName: loan.customerName,
        amount: record.amount,
        paymentDate: new Date(`${refDate}T00:00:00`),
        method: record.paymentMethod,
        referenceNumber: record.referenceNumber,
        receivedBy: record.receivedBy,
        notes: record.notes ?? null,
      },
    });

    await this.persist(loan);
    return loan;
  }

  async earlySettle(id: string, dto: ExecuteSettlementDto): Promise<Loan> {
    const loan = await this.requireLoan(id);
    if (CLOSED.includes(loan.status)) {
      throw new BadRequestException('Loan is already closed');
    }
    if (!loan.disbursedAmount) {
      throw new BadRequestException('Loan must be disbursed before early settlement');
    }

    const refDate = dto.settlementDate ?? todayISO();
    // Server recomputes the authoritative quote from current ledger state.
    const quote = calculateEarlySettlementQuote(loan, refDate);
    const amount = quote.totalSettlementAmount;
    const alloc = allocatePayment(loan, amount, refDate);

    // For early settlement the remaining principal & recorded interest are
    // closed out (future interest is waived within the quote).
    for (const inst of loan.installments) {
      inst.paidPrincipal = inst.principalAmount;
      inst.paidInterest = inst.interestAmount;
      inst.lateFeePaid = inst.lateFee ?? 0;
      inst.paidAmount = inst.totalInstallment;
      inst.remainingAmount = 0;
      inst.status = 'Paid';
      inst.paidDate = inst.paidDate ?? refDate;
    }

    loan.earlySettlementQuote = quote;
    computeLoan(loan, refDate);

    const leftover = roundTo(amount - alloc.applied);
    const seq = await this.prisma.payment.count();
    const record: PaymentRecord = {
      id: paymentId(seq + 1),
      loanId: loan.id,
      customerName: loan.customerName,
      amount,
      paymentDate: refDate,
      paymentMethod: dto.paymentMethod,
      referenceNumber: dto.referenceNumber,
      receivedBy: dto.receivedBy,
      notes: dto.notes ?? 'Early settlement payoff',
      allocatedPrincipal: roundTo(alloc.principalAllocated),
      allocatedInterest: roundTo(alloc.interestAllocated),
      allocatedLateFee: roundTo(alloc.lateFeeAllocated + Math.max(0, leftover)),
      installmentNumbersCovered: [...alloc.coveredInstallmentNumbers],
    };
    loan.payments.push(record);

    const smsResult = await this.smsPaymentAlert(loan, record);
    record.smsStatus = smsResult.status;
    record.smsRecipient = smsResult.recipient;
    record.smsMessage = smsResult.message;

    await this.prisma.payment.create({
      data: {
        id: record.id,
        loanId: loan.id,
        customerName: loan.customerName,
        amount: record.amount,
        paymentDate: new Date(`${refDate}T00:00:00`),
        method: record.paymentMethod,
        referenceNumber: record.referenceNumber,
        receivedBy: record.receivedBy,
        notes: record.notes ?? '',
      },
    });

    await this.persist(loan);
    return loan;
  }

  async remove(id: string): Promise<void> {
    await this.requireLoan(id);
    await this.prisma.loan.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // SMS helpers
  // ---------------------------------------------------------------------------

  private async smsPaymentAlert(loan: Loan, record: PaymentRecord) {
    const message = this.formatPaymentMessage(loan, record);
    const entry = await this.sms.send({
      recipient: loan.customerPhone,
      message,
      loanId: loan.id,
      customerName: loan.customerName,
      amount: record.amount,
    });
    return { status: entry.status as 'SENT' | 'FAILED', recipient: entry.recipient, message };
  }

  private formatPaymentMessage(loan: Loan, record: PaymentRecord): string {
    return `Dear ${loan.customerName}, LKR ${record.amount.toLocaleString('en-LK', {
      minimumFractionDigits: 2,
    })} received for Loan ${loan.accountNumber}. Thank you, SMV Holdings.`;
  }
}