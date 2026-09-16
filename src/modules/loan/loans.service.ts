import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { StorageService } from "../../config/storage.service";
import { SmsService } from "../sms/sms.service";
import { PaginationDto } from "../../common/dto/pagination.dto";
import {
  PaginationService,
  PaginatedResult,
} from "../../common/services/pagination.service";
import {
  allocatePayment,
  calculateEarlySettlementQuote,
  generateSchedule,
  roundTo,
} from "../../common/utils/financial";
import { todayISO } from "../../common/utils/dates";
import { CreateLoanDto } from "./dto/create-loan.dto";
import {
  RecordPaymentDto,
  ExecuteSettlementDto,
} from "./dto/payment-settlement.dto";
import { DisburseLoanDto, UpdateKYCDto } from "./dto/loan-transition.dto";
import { AuthedUser } from "../../common/guards/auth.types";
import { randomSuffix } from "../../common/utils/id-generator";
import { PrismaService } from "../../config/prisma.service";
import {
  InstallmentStatus,
  InterestMethod,
  KYCPayload,
  Loan,
  LoanType,
  PaymentRecord,
  RepaymentFrequency,
} from "../../shared/types";
import { accountNumber, customerId, loanId } from "../../common/utils/id";
import { Prisma } from "@prisma/client";

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly sms: SmsService,
    private readonly paginationService: PaginationService,
  ) {}

  // ---------------------------------------------------------------------------
  // Read path with pagination
  // ---------------------------------------------------------------------------

  async list(paginationDto: PaginationDto): Promise<PaginatedResult<any>> {
    const where: any = {};

    if (paginationDto.search) {
      where.OR = [
        {
          customer: {
            fullName: { contains: paginationDto.search, mode: "insensitive" },
          },
        },
        {
          accountNumber: {
            contains: paginationDto.search,
            mode: "insensitive",
          },
        },
        { loanNumber: { contains: paginationDto.search, mode: "insensitive" } },
        { customer: { phone: { contains: paginationDto.search } } },
      ];
    }

    if (paginationDto.status) {
      where.status = paginationDto.status;
    }

    const options = this.paginationService.getPaginationOptions(
      paginationDto,
      "createdAt",
      "desc",
    );

    const total = await this.prisma.loan.count({ where });

    const rows = await this.prisma.loan.findMany({
      where,
      include: {
        account: true,
        customer: true,
        installments: {
          orderBy: { installmentNumber: "asc" },
        },
        guarantor: true,
        documents: true,
        loanOfficer: true,
        approvedBy: true,
        disbursedBy: true,
        payments: {
          orderBy: { createdAt: "desc" },
          include: { receivedBy: true },
        },
      },
      orderBy: { [options.sortBy]: options.sortOrder },
      skip: options.skip,
      take: options.limit,
    });

    const items = rows.map((row) => this.formatLoanListResponse(row));
    return this.paginationService.createPaginatedResponse(
      items,
      total,
      options.page,
      options.limit,
    );
  }

  async listPayment(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<any>> {
    const where: any = {};

    if (paginationDto.search) {
      where.OR = [
        {
          customer: {
            fullName: { contains: paginationDto.search, mode: "insensitive" },
          },
        },
        {
          accountNumber: {
            contains: paginationDto.search,
            mode: "insensitive",
          },
        },
        { loanNumber: { contains: paginationDto.search, mode: "insensitive" } },
        { customer: { phone: { contains: paginationDto.search } } },
      ];
    }

    where.status = {
      notIn: [
        "Pending_Approval",
        "KYC_Pending",
        "Approved_Pending_Disbursement",
        "Rejected",
      ],
    };

    if (paginationDto.status) {
      where.status = paginationDto.status;
    }

    const options = this.paginationService.getPaginationOptions(
      paginationDto,
      "createdAt",
      "desc",
    );

    const total = await this.prisma.loan.count({ where });

    const rows = await this.prisma.loan.findMany({
      where,
      include: {
        account: true,
        customer: true,
        installments: {
          orderBy: { installmentNumber: "asc" },
        },
        guarantor: true,
        documents: true,
        loanOfficer: true,
        approvedBy: true,
        disbursedBy: true,
        payments: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { [options.sortBy]: options.sortOrder },
      skip: options.skip,
      take: options.limit,
    });

    const items = rows.map((row) => this.formatLoanListResponse(row));
    return this.paginationService.createPaginatedResponse(
      items,
      total,
      options.page,
      options.limit,
    );
  }

  async getOne(id: string): Promise<any> {
    const row = await this.prisma.loan.findUnique({
      where: { id },
      include: {
        account: true,
        customer: true,
        installments: {
          orderBy: { installmentNumber: "asc" },
        },
        guarantor: true,
        documents: true,
        loanOfficer: true,
        approvedBy: true,
        disbursedBy: true,
        payments: {
          orderBy: { createdAt: "desc" },
          include: { receivedBy: true },
        },
      },
    });

    if (!row) throw new NotFoundException("Loan not found");
    return this.formatLoanResponse(row);
  }

  async getListByStatus(statuses: string[]): Promise<any[]> {
    // Guard — if nothing was passed, return empty instead of matching everything
    if (!statuses || statuses.length === 0) {
      throw new BadRequestException("At least one status is required");
    }

    const rows = await this.prisma.loan.findMany({
      where: { status: { in: statuses } },
      include: {
        customer: true,
        account: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (rows.length === 0) {
      throw new NotFoundException("No loans found with this status");
    }

    return rows.map((row) => ({
      id: row.id,
      loanNumber: row.loanNumber,
      accountNumber: row.accountNumber || row.account?.accountNumber,
      status: row.status,
      customer: {
        id: row.customer.id,
        fullName: row.customer.fullName,
      },
    }));
  }

  // ---------------------------------------------------------------------------
  // Create Loan with Customer
  // ---------------------------------------------------------------------------
  // async create(input: CreateLoanDto, auth: AuthedUser): Promise<any> {
  //   const today = todayISO();

  //   // 1. Find or create customer
  //   let customer = await this.prisma.customer.findFirst({
  //     where: {
  //       OR: [{ idNumber: input.idNumber }],
  //     },
  //   });

  //   if (!customer) {
  //     const customerCount = await this.prisma.customer.count();
  //     customer = await this.prisma.customer.create({
  //       data: {
  //         customerNumber: `${customerId(customerCount + 1)}`,
  //         fullName: input.customerName,
  //         phone: input.customerPhone,
  //         idNumber: input.idNumber,
  //         idType: "NIC",
  //         isVerified: false,
  //       },
  //     });
  //   }

  //   // 2. Generate loan number
  //   const loanCount = await this.prisma.loan.count();
  //   const loanNumber = loanId(loanCount + 1);
  //   const accNo = accountNumber();

  //   // 3. Generate installment schedule
  //   const schedule = generateSchedule({
  //     principal: input.requestedAmount,
  //     annualRatePct: input.interestRatePerAnnum,
  //     termMonths: input.termMonths,
  //     frequency: input.repaymentFrequency as RepaymentFrequency,
  //     method: input.interestMethod as InterestMethod,
  //     startDate: today,
  //   });

  //   // 4. Create loan
  //   const loan = await this.prisma.loan.create({
  //     data: {
  //       loanNumber,
  //       accountNumber: accNo,
  //       customerId: customer.id,
  //       loanOfficerId: (auth as any).sub || (auth as any).id,
  //       loanType: input.loanType,
  //       requestedAmount: input.requestedAmount,
  //       interestRatePerAnnum: input.interestRatePerAnnum,
  //       termMonths: input.termMonths,
  //       repaymentFrequency: input.repaymentFrequency,
  //       interestMethod: input.interestMethod,
  //       processingFee: Math.round(input.requestedAmount * 0.02),
  //       earlySettlementPenaltyPercent: 2.5,
  //       purpose: input.purpose,
  //       status: "Pending_Approval",
  //       requestedDate: new Date(today),
  //       totalPaidAmount: 0,
  //       outstandingBalance: input.requestedAmount,
  //     },
  //     include: {
  //       customer: true,
  //       installments: true,
  //       guarantor: true,
  //     },
  //   });

  //   // 5. Create installments
  //   for (const inst of schedule.installments) {
  //     await this.prisma.installment.create({
  //       data: {
  //         loanId: loan.id,
  //         installmentNumber: inst.installmentNumber,
  //         dueDate: new Date(inst.dueDate),
  //         principalAmount: inst.principalAmount,
  //         interestAmount: inst.interestAmount,
  //         totalInstallment: inst.totalInstallment,
  //         paidAmount: 0,
  //         remainingAmount: inst.totalInstallment,
  //         status: "Pending",
  //         lateFee: 0,
  //       },
  //     });
  //   }

  //   return this.getOne(loan.id);
  // }
  async create(input: CreateLoanDto, auth: AuthedUser): Promise<any> {
    const today = todayISO();

    // 1. Generate IDs OUTSIDE the transaction (they're independent reads/generators)
    const loanCount = await this.prisma.loan.count();
    const loanNumber = loanId(loanCount + 1);
    const accNo = accountNumber();

    const schedule = generateSchedule({
      principal: input.requestedAmount,
      annualRatePct: input.interestRatePerAnnum,
      termMonths: input.termMonths,
      frequency: input.repaymentFrequency as RepaymentFrequency,
      method: input.interestMethod as InterestMethod,
      startDate: today,
    });

    const officerId = (auth as any).sub || (auth as any).id;

    // 2. Run customer + loan + account + installments atomically
    const loanId_ = await this.prisma.$transaction(async (tx) => {
      // ---- Find or create customer ----
      let customer = await tx.customer.findFirst({
        where: { idNumber: input.idNumber },
      });

      if (!customer) {
        const customerCount = await tx.customer.count();
        customer = await tx.customer.create({
          data: {
            customerNumber: customerId(customerCount + 1),
            fullName: input.customerName,
            phone: input.customerPhone,
            idNumber: input.idNumber,
            idType: "NIC",
            isVerified: false,
          },
        });
      }

      // ---- Create loan (no nested account) ----
      const loan = await tx.loan.create({
        data: {
          loanNumber,
          accountNumber: accNo,
          customerId: customer.id,
          loanOfficerId: officerId,
          loanType: input.loanType,
          requestedAmount: input.requestedAmount,
          interestRatePerAnnum: input.interestRatePerAnnum,
          termMonths: input.termMonths,
          repaymentFrequency: input.repaymentFrequency,
          interestMethod: input.interestMethod,
          processingFee: Math.round(input.requestedAmount * 0.02),
          earlySettlementPenaltyPercent: 2.5,
          purpose: input.purpose,
          status: "Pending_Approval",
          requestedDate: new Date(today),
          totalPaidAmount: 0,
          outstandingBalance: input.requestedAmount,
        },
        select: { id: true },
      });

      // ---- Create the account row ----
      const account = await tx.loanAccount.create({
        data: {
          accountNumber: accNo,
          disbursedAmount: 0,
          totalCollected: 0,
          remainingBalance: 0,
        },
      });

      // ---- Link the account to the loan ----
      await tx.loan.update({
        where: { id: loan.id },
        data: { accountId: account.id },
      });

      // ---- Create installments ----
      await tx.installment.createMany({
        data: schedule.installments.map((inst) => ({
          loanId: loan.id,
          installmentNumber: inst.installmentNumber,
          dueDate: new Date(inst.dueDate),
          principalAmount: inst.principalAmount,
          interestAmount: inst.interestAmount,
          totalInstallment: inst.totalInstallment,
          paidAmount: 0,
          remainingAmount: inst.totalInstallment,
          status: "Pending",
          lateFee: 0,
        })),
      });

      return loan.id;
    });

    // 3. Return the fully hydrated loan (outside the transaction is fine)
    return this.getOne(loanId_);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle transitions
  // ---------------------------------------------------------------------------

  async approve(
    id: string,
    notes: string | undefined,
    auth: AuthedUser,
  ): Promise<any> {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: { customer: true },
    });

    if (!loan) throw new NotFoundException("Loan not found");
    if (loan.status !== "Pending_Approval") {
      throw new BadRequestException(
        "Only Pending Approval loans can be approved",
      );
    }

    const updated = await this.prisma.loan.update({
      where: { id },
      data: {
        status: "KYC_Pending",
        approvedDate: new Date(),
        approvedById: (auth as any).sub || (auth as any).id,
      },
      include: {
        customer: true,
        account: true,
        installments: true,
        guarantor: true,
      },
    });

    return this.formatLoanResponse(updated);
  }

  async reject(id: string, reason: string): Promise<any> {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: { customer: true },
    });

    if (!loan) throw new NotFoundException("Loan not found");

    const preDisburseStatuses = [
      "Pending_Approval",
      "KYC_Pending",
      "Approved_Pending_Disbursement",
    ];

    if (!preDisburseStatuses.includes(loan.status)) {
      throw new BadRequestException("Loan cannot be rejected at this stage");
    }

    const updated = await this.prisma.loan.update({
      where: { id },
      data: {
        status: "Rejected",
        rejectedAt: new Date(),
        rejectReason: reason,
      },
      include: {
        customer: true,
        account: true,
        installments: true,
        guarantor: true,
      },
    });

    return this.formatLoanResponse(updated);
  }

  // async updateKYC(id: string, dto: KYCPayload, auth: AuthedUser): Promise<any> {
  //   const loan = await this.prisma.loan.findUnique({
  //     where: { id },
  //     include: { customer: true, guarantor: true },
  //   });

  //   if (!loan) throw new NotFoundException("Loan not found");
  //   if (loan.status === "Rejected") {
  //     throw new BadRequestException("Rejected loans cannot be edited");
  //   }

  //   // -------- Customer update --------
  //   const rawCustomer = dto.kycData.customer;

  //   // Whitelist only fields the client is allowed to update.
  //   // Never spread rawCustomer directly — it may contain id, customerNumber,
  //   // createdAt, updatedAt, isVerified, etc.
  //   const customerUpdate: Prisma.CustomerUpdateInput = {};

  //   if (rawCustomer.idNumber !== undefined)
  //     customerUpdate.idNumber = rawCustomer.idNumber;
  //   if (rawCustomer.idType !== undefined)
  //     customerUpdate.idType = rawCustomer.idType as any;
  //   if (rawCustomer.dateOfBirth !== undefined)
  //     customerUpdate.dateOfBirth = rawCustomer.dateOfBirth
  //       ? new Date(rawCustomer.dateOfBirth)
  //       : null;
  //   if (rawCustomer.gender !== undefined)
  //     customerUpdate.gender = rawCustomer.gender;
  //   if (rawCustomer.occupation !== undefined)
  //     customerUpdate.occupation = rawCustomer.occupation;
  //   if (rawCustomer.employerName !== undefined)
  //     customerUpdate.employerName = rawCustomer.employerName;
  //   if (rawCustomer.monthlyIncome !== undefined) {
  //     const income = Number(rawCustomer.monthlyIncome);
  //     if (Number.isNaN(income)) {
  //       throw new BadRequestException("monthlyIncome must be a valid number");
  //     }
  //     customerUpdate.monthlyIncome = income;
  //   }
  //   if (rawCustomer.addressLine !== undefined)
  //     customerUpdate.addressLine = rawCustomer.addressLine;
  //   if (rawCustomer.city !== undefined) customerUpdate.city = rawCustomer.city;
  //   // if (rawCustomer.postalCode !== undefined)
  //   //   customerUpdate.postalCode = rawCustomer.postalCode;

  //   // Mark verified only when core KYC data is present.
  //   // Adjust this condition to your business rules.
  //   const hasCoreKyc =
  //     !!rawCustomer.idNumber && !!rawCustomer.addressLine && !!rawCustomer.city;

  //   if (hasCoreKyc) {
  //     customerUpdate.isVerified = true;
  //   }

  //   if (Object.keys(customerUpdate).length > 0) {
  //     await this.prisma.customer.update({
  //       where: { id: loan.customerId },
  //       data: customerUpdate,
  //     });
  //   }

  //   // -------- Guarantor update --------
  //   const rawGuarantor = dto.kycData.guarantor;

  //   const guarantorUpdate: Prisma.GuarantorUpdateInput = {};

  //   if (rawGuarantor.fullName !== undefined)
  //     guarantorUpdate.fullName = rawGuarantor.fullName;
  //   if (rawGuarantor.phone !== undefined)
  //     guarantorUpdate.phone = rawGuarantor.phone;
  //   if (rawGuarantor.relation !== undefined)
  //     guarantorUpdate.relation = rawGuarantor.relation;

  //   if (Object.keys(guarantorUpdate).length > 0) {
  //     await this.prisma.guarantor.create({
  //       data: {
  //         loanId: loan.id,
  //         customerId: loan.customer.id,
  //         fullName: guarantorUpdate.fullName as string,
  //         phone: guarantorUpdate.phone as string,
  //         relation: (guarantorUpdate.relation as string) ?? "Relative",
  //       },
  //     });
  //   }

  //   // -------- Status transition --------
  //   let newStatus = loan.status;
  //   if (loan.status === "KYC_Pending" && hasCoreKyc) {
  //     newStatus = "Approved_Pending_Disbursement";
  //   }

  //   const updated = await this.prisma.loan.update({
  //     where: { id },
  //     data: {
  //       status: newStatus,
  //       ...(newStatus === "Approved_Pending_Disbursement" && {
  //         approvedDate: new Date(),
  //       }),
  //     },
  //     include: {
  //       account: true,
  //       customer: true,
  //       installments: true,
  //       guarantor: true,
  //     },
  //   });

  //   return this.formatLoanResponse(updated);
  // }
  async updateKYC(id: string, dto: KYCPayload, auth: AuthedUser): Promise<any> {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: { customer: true, guarantor: true },
    });

    if (!loan) throw new NotFoundException("Loan not found");
    if (loan.status === "Rejected") {
      throw new BadRequestException("Rejected loans cannot be edited");
    }

    // -------- Build customer update payload (outside tx — pure computation) --------
    const rawCustomer = dto.kycData.customer;

    const customerUpdate: Prisma.CustomerUpdateInput = {};

    if (rawCustomer.idNumber !== undefined)
      customerUpdate.idNumber = rawCustomer.idNumber;
    if (rawCustomer.idType !== undefined)
      customerUpdate.idType = rawCustomer.idType as any;
    if (rawCustomer.dateOfBirth !== undefined)
      customerUpdate.dateOfBirth = rawCustomer.dateOfBirth
        ? new Date(rawCustomer.dateOfBirth)
        : null;
    if (rawCustomer.gender !== undefined)
      customerUpdate.gender = rawCustomer.gender;
    if (rawCustomer.occupation !== undefined)
      customerUpdate.occupation = rawCustomer.occupation;
    if (rawCustomer.employerName !== undefined)
      customerUpdate.employerName = rawCustomer.employerName;
    if (rawCustomer.monthlyIncome !== undefined) {
      const income = Number(rawCustomer.monthlyIncome);
      if (Number.isNaN(income)) {
        throw new BadRequestException("monthlyIncome must be a valid number");
      }
      customerUpdate.monthlyIncome = income;
    }
    if (rawCustomer.addressLine !== undefined)
      customerUpdate.addressLine = rawCustomer.addressLine;
    if (rawCustomer.city !== undefined) customerUpdate.city = rawCustomer.city;

    // Determine verification: an already-verified customer stays verified.
    // A new verification is granted only when core KYC fields are present.
    const hasCoreKyc =
      !!rawCustomer.idNumber && !!rawCustomer.addressLine && !!rawCustomer.city;

    if (hasCoreKyc) {
      customerUpdate.isVerified = true;
    }

    // -------- Build guarantor payload --------
    const rawGuarantor = dto.kycData.guarantor;

    const guarantorUpdate: Prisma.GuarantorUpdateInput = {};

    if (rawGuarantor.fullName !== undefined)
      guarantorUpdate.fullName = rawGuarantor.fullName;
    if (rawGuarantor.phone !== undefined)
      guarantorUpdate.phone = rawGuarantor.phone;
    if (rawGuarantor.relation !== undefined)
      guarantorUpdate.relation = rawGuarantor.relation;

    const hasGuarantorData = Object.keys(guarantorUpdate).length > 0;

    // -------- Determine new status --------
    let newStatus = loan.status;
    if (loan.status === "KYC_Pending" && hasCoreKyc) {
      newStatus = "Approved_Pending_Disbursement";
    }

    // -------- Run everything in a single transaction --------
    await this.prisma.$transaction(async (tx) => {
      // 1. Update customer
      if (Object.keys(customerUpdate).length > 0) {
        await tx.customer.update({
          where: { id: loan.customerId },
          data: customerUpdate,
        });
      }

      // 2. Upsert guarantor (create if none exists, otherwise update)
      if (hasGuarantorData) {
        if (loan.guarantor) {
          await tx.guarantor.update({
            where: { id: loan.guarantor.id },
            data: guarantorUpdate,
          });
        } else {
          await tx.guarantor.create({
            data: {
              loanId: loan.id,
              customerId: loan.customer.id,
              fullName: (guarantorUpdate.fullName as string) ?? "",
              phone: (guarantorUpdate.phone as string) ?? "",
              relation: (guarantorUpdate.relation as string) ?? "Relative",
            },
          });
        }
      }

      // 3. Update loan status
      await tx.loan.update({
        where: { id },
        data: {
          status: newStatus,
          ...(newStatus === "Approved_Pending_Disbursement" &&
            loan.status !== "Approved_Pending_Disbursement" && {
              approvedDate: new Date(),
            }),
        },
      });
    });

    // -------- Re-fetch with all relations for the response --------
    const updated = await this.prisma.loan.findUnique({
      where: { id },
      include: {
        account: true,
        customer: true,
        installments: { orderBy: { installmentNumber: "asc" } },
        guarantor: true,
        documents: true,
      },
    });

    return this.formatLoanResponse(updated);
  }

  // async disburse(
  //   id: string,
  //   auth: AuthedUser,
  //   body: DisburseLoanDto,
  // ): Promise<any> {
  //   const loan = await this.prisma.loan.findUnique({
  //     where: { id },
  //     include: { customer: true, installments: true },
  //   });

  //   if (!loan) throw new NotFoundException("Loan not found");
  //   if (loan.status !== "Approved_Pending_Disbursement") {
  //     throw new BadRequestException(
  //       "Loan must be Approved - Pending Disbursement to disburse",
  //     );
  //   }

  //   const requestedAmount = Number(loan.requestedAmount);

  //   // Use the provided deductedFee if sent; otherwise keep the loan's stored processingFee.
  //   const deductedFee =
  //     body.deductedFee !== undefined
  //       ? Number(body.deductedFee)
  //       : Number(loan.processingFee);

  //   if (deductedFee < 0) {
  //     throw new BadRequestException("Deducted fee cannot be negative");
  //   }
  //   if (deductedFee > requestedAmount) {
  //     throw new BadRequestException(
  //       "Deducted fee cannot exceed the requested amount",
  //     );
  //   }

  //   // Net amount actually disbursed to the customer
  //   const disbursedAmount = requestedAmount - deductedFee;

  //   const updated = await this.prisma.loan.update({
  //     where: { id },
  //     data: {
  //       status: "Active",
  //       disbursedAmount: disbursedAmount,
  //       processingFee: deductedFee, // persist the final deducted fee
  //       outstandingBalance: disbursedAmount, // if you track outstanding principal
  //       disbursedDate: new Date(),
  //       disbursedById: (auth as any).sub || (auth as any).id,
  //     },
  //     include: {
  //       customer: true,
  //       installments: true,
  //       guarantor: true,
  //     },
  //   });

  //   // Optional: persist the note somewhere (e.g. on the loan or a log table)
  //   // if (body.notes) { ... }

  //   return this.formatLoanResponse(updated);
  // }

  // ---------------------------------------------------------------------------
  // Payments
  // ---------------------------------------------------------------------------

  // async receivePayment(id: string, dto: RecordPaymentDto): Promise<any> {
  //   const loan = await this.prisma.loan.findUnique({
  //     where: { id },
  //     include: {
  //       customer: true,
  //       installments: {
  //         orderBy: { installmentNumber: "asc" },
  //       },
  //       payments: {
  //         orderBy: { createdAt: "desc" },
  //       },
  //     },
  //   });

  //   if (!loan) throw new NotFoundException("Loan not found");

  //   const closedStatuses = ["Settled", "Early Settled", "Rejected"];
  //   const preDisburseStatuses = [
  //     "Pending Approval",
  //     "KYC Pending",
  //     "Approved - Pending Disbursement",
  //   ];

  //   if (
  //     closedStatuses.includes(loan.status) ||
  //     preDisburseStatuses.includes(loan.status)
  //   ) {
  //     throw new BadRequestException(
  //       "Payments are only accepted on Active/Overdue loans",
  //     );
  //   }

  //   const refDate = dto.paymentDate ? dto.paymentDate.slice(0, 10) : todayISO();
  //   const amount = roundTo(dto.amount);

  //   // Build installments for allocation
  //   const installments = loan.installments.map((inst) => ({
  //     installmentNumber: inst.installmentNumber,
  //     dueDate: inst.dueDate.toISOString().slice(0, 10),
  //     principalAmount: Number(inst.principalAmount),
  //     interestAmount: Number(inst.interestAmount),
  //     totalInstallment: Number(inst.totalInstallment),
  //     paidAmount: Number(inst.paidAmount),
  //     remainingAmount: Number(inst.remainingAmount),
  //     status: inst.status,
  //     lateFee: Number(inst.lateFee),
  //     paidPrincipal: Number(inst.paidPrincipal) || 0,
  //     paidInterest: Number(inst.paidInterest) || 0,
  //     lateFeePaid: Number(inst.lateFeePaid) || 0,
  //   }));

  //   const loanLike = {
  //     id: loan.id,
  //     accountNumber: loan.accountNumber,
  //     customerName: loan.customer.fullName,
  //     customerPhone: loan.customer.phone,
  //     customerEmail: loan.customer.email || "",
  //     loanType: loan.loanType,
  //     requestedAmount: Number(loan.requestedAmount),
  //     disbursedAmount: Number(loan.disbursedAmount),
  //     interestRatePerAnnum: Number(loan.interestRatePerAnnum),
  //     termMonths: loan.termMonths,
  //     repaymentFrequency: loan.repaymentFrequency,
  //     interestMethod: loan.interestMethod,
  //     processingFee: Number(loan.processingFee),
  //     earlySettlementPenaltyPercent: Number(loan.earlySettlementPenaltyPercent),
  //     status: loan.status,
  //     requestedDate: loan.requestedDate.toISOString(),
  //     installments: installments,
  //     payments: loan.payments || [],
  //     totalPaidAmount: Number(loan.totalPaidAmount),
  //     outstandingBalance: Number(loan.outstandingBalance),
  //     purpose: loan.purpose || "",
  //     creditScore: 0,
  //     kyc: null as any,
  //   };

  //   const alloc = allocatePayment(loanLike, amount, refDate);

  //   // Update installments
  //   for (const inst of loan.installments) {
  //     const updatedInst = installments.find(
  //       (i) => i.installmentNumber === inst.installmentNumber,
  //     );
  //     if (updatedInst) {
  //       await this.prisma.installment.update({
  //         where: { id: inst.id },
  //         data: {
  //           paidAmount: updatedInst.paidAmount,
  //           remainingAmount: updatedInst.remainingAmount,
  //           status: updatedInst.status,
  //           paidPrincipal: updatedInst.paidPrincipal || 0,
  //           paidInterest: updatedInst.paidInterest || 0,
  //           lateFeePaid: updatedInst.lateFeePaid || 0,
  //           paidDate:
  //             updatedInst.status === "Paid" ? new Date(refDate) : undefined,
  //         },
  //       });
  //     }
  //   }

  //   // Create payment record
  //   const payment = await this.prisma.payment.create({
  //     data: {
  //       loanId: loan.id,
  //       customerName: loan.customer.fullName,
  //       amount: amount,
  //       paymentDate: new Date(refDate),
  //       paymentMethod: dto.paymentMethod,
  //       referenceNumber: dto.referenceNumber,
  //       receivedById: dto.receivedBy,
  //       notes: dto.notes,
  //       allocatedPrincipal: alloc.principalAllocated,
  //       allocatedInterest: alloc.interestAllocated,
  //       allocatedLateFee: alloc.lateFeeAllocated,
  //       installmentNumbersCovered: alloc.coveredInstallmentNumbers,
  //     },
  //   });

  //   // Update loan totals
  //   const totalPaid = Number(loan.totalPaidAmount) + amount;
  //   const outstandingBalance = Math.max(
  //     0,
  //     Number(loan.outstandingBalance) - amount,
  //   );

  //   await this.prisma.loan.update({
  //     where: { id: loan.id },
  //     data: {
  //       totalPaidAmount: totalPaid,
  //       outstandingBalance: outstandingBalance,
  //       status: outstandingBalance <= 0 ? "Settled" : loan.status,
  //       settledDate: outstandingBalance <= 0 ? new Date() : undefined,
  //     },
  //   });

  //   // Send SMS notification
  //   await this.smsPaymentAlert(loan, payment);
  //   return this.getOne(loan.id);
  // }

  // async earlySettle(id: string, dto: ExecuteSettlementDto): Promise<any> {
  //   const loan = await this.prisma.loan.findUnique({
  //     where: { id },
  //     include: {
  //       customer: true,
  //       installments: {
  //         orderBy: { installmentNumber: "asc" },
  //       },
  //       payments: {
  //         orderBy: { createdAt: "desc" },
  //       },
  //     },
  //   });

  //   if (!loan) throw new NotFoundException("Loan not found");

  //   const closedStatuses = ["Settled", "Early Settled", "Rejected"];
  //   if (closedStatuses.includes(loan.status)) {
  //     throw new BadRequestException("Loan is already closed");
  //   }
  //   if (!loan.disbursedAmount || Number(loan.disbursedAmount) === 0) {
  //     throw new BadRequestException(
  //       "Loan must be disbursed before early settlement",
  //     );
  //   }

  //   const refDate = dto.settlementDate ?? todayISO();

  //   // Build installments for quote
  //   const installments = loan.installments.map((inst) => ({
  //     installmentNumber: inst.installmentNumber,
  //     dueDate: inst.dueDate.toISOString().slice(0, 10),
  //     principalAmount: Number(inst.principalAmount),
  //     interestAmount: Number(inst.interestAmount),
  //     totalInstallment: Number(inst.totalInstallment),
  //     paidAmount: Number(inst.paidAmount),
  //     remainingAmount: Number(inst.remainingAmount),
  //     status: inst.status,
  //     lateFee: Number(inst.lateFee),
  //     paidPrincipal: Number(inst.paidPrincipal) || 0,
  //     paidInterest: Number(inst.paidInterest) || 0,
  //     lateFeePaid: Number(inst.lateFeePaid) || 0,
  //   }));

  //   const loanLike: Loan = {
  //     id: loan.id,
  //     accountNumber: loan.accountNumber,
  //     customerName: loan.customer.fullName,
  //     customerPhone: loan.customer.phone,
  //     customerEmail: loan.customer.email || "",
  //     loanType: loan.loanType,
  //     requestedAmount: Number(loan.requestedAmount),
  //     disbursedAmount: Number(loan.disbursedAmount),
  //     interestRatePerAnnum: Number(loan.interestRatePerAnnum),
  //     termMonths: loan.termMonths,
  //     repaymentFrequency: loan.repaymentFrequency,
  //     interestMethod: loan.interestMethod,
  //     processingFee: Number(loan.processingFee),
  //     earlySettlementPenaltyPercent: Number(loan.earlySettlementPenaltyPercent),
  //     status: loan.status,
  //     requestedDate: loan.requestedDate.toISOString(),
  //     installments: installments,
  //     payments: loan.payments || [],
  //     totalPaidAmount: Number(loan.totalPaidAmount),
  //     outstandingBalance: Number(loan.outstandingBalance),
  //     purpose: loan.purpose || "",
  //     creditScore: 0,
  //     kyc: null as any,
  //   };

  //   const quote = calculateEarlySettlementQuote(loanLike, refDate);
  //   const amount = quote.totalSettlementAmount;

  //   // Mark all installments as paid
  //   for (const inst of loan.installments) {
  //     await this.prisma.installment.update({
  //       where: { id: inst.id },
  //       data: {
  //         paidAmount: Number(inst.totalInstallment),
  //         remainingAmount: 0,
  //         status: "Paid",
  //         paidPrincipal: Number(inst.principalAmount),
  //         paidInterest: Number(inst.interestAmount),
  //         paidDate: new Date(refDate),
  //       },
  //     });
  //   }

  //   // Create settlement payment
  //   const payment = await this.prisma.payment.create({
  //     data: {
  //       loanId: loan.id,
  //       customerName: loan.customer.fullName,
  //       amount: amount,
  //       paymentDate: new Date(refDate),
  //       paymentMethod: dto.paymentMethod,
  //       referenceNumber: dto.referenceNumber,
  //       receivedById: dto.receivedBy,
  //       notes: dto.notes || "Early settlement payoff",
  //       allocatedPrincipal: quote.outstandingPrincipalBalance,
  //       allocatedInterest: quote.accruedInterestToDate,
  //       allocatedLateFee: quote.earlySettlementPenaltyFee,
  //       installmentNumbersCovered: installments
  //         .filter((i) => i.status !== "Paid")
  //         .map((i) => i.installmentNumber),
  //     },
  //   });

  //   // Update loan
  //   await this.prisma.loan.update({
  //     where: { id: loan.id },
  //     data: {
  //       status: "Early Settled",
  //       settledDate: new Date(refDate),
  //       totalPaidAmount: amount,
  //       outstandingBalance: 0,
  //       earlySettlementQuote: quote as any,
  //     },
  //   });

  //   await this.smsPaymentAlert(loan, payment);
  //   return this.getOne(loan.id);
  // }

  async disburse(
    id: string,
    auth: AuthedUser,
    body: DisburseLoanDto,
  ): Promise<any> {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: { customer: true, installments: true, account: true },
    });

    if (!loan) throw new NotFoundException("Loan not found");
    if (loan.status !== "Approved_Pending_Disbursement") {
      throw new BadRequestException(
        "Loan must be Approved - Pending Disbursement to disburse",
      );
    }

    const requestedAmount = Number(loan.requestedAmount);

    // Use the provided deductedFee if sent; otherwise keep the loan's stored processingFee.
    const deductedFee =
      body.deductedFee !== undefined
        ? Number(body.deductedFee)
        : Number(loan.processingFee);

    if (deductedFee < 0) {
      throw new BadRequestException("Deducted fee cannot be negative");
    }
    if (deductedFee > requestedAmount) {
      throw new BadRequestException(
        "Deducted fee cannot exceed the requested amount",
      );
    }

    // Net amount actually disbursed to the customer
    const disbursedAmount = requestedAmount - deductedFee;
    const officerId = (auth as any).sub || (auth as any).id;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // ---- Update loan ----
      await tx.loan.update({
        where: { id },
        data: {
          status: "Active",
          disbursedAmount,
          processingFee: deductedFee, // persist the final deducted fee
          outstandingBalance: disbursedAmount,
          disbursedDate: now,
          disbursedById: officerId,
        },
      });

      // ---- Update / create linked account ----
      if (loan.accountId) {
        await tx.loanAccount.update({
          where: { id: loan.accountId },
          data: {
            disbursedAmount,
            remainingBalance: disbursedAmount,
          },
        });
      } else {
        // Fallback: loan had no account row yet — create and link one
        const account = await tx.loanAccount.create({
          data: {
            accountNumber: loan.accountNumber,
            disbursedAmount,
            totalCollected: 0,
            remainingBalance: disbursedAmount,
          },
        });
        await tx.loan.update({
          where: { id },
          data: { accountId: account.id },
        });
      }
    });

    // ---------- SMS alert (best-effort, outside tx) ----------
    let smsResult: {
      status: string;
      recipient: string;
      message: string;
    } | null = null;
    try {
      smsResult = await this.smsDisbursementAlert(loan, disbursedAmount);
    } catch (err) {
      console.error("Disbursement SMS send failed:", err);
    }

    // Optional: persist the note somewhere (e.g. on the loan or a log table)
    // if (body.notes) { ... }

    // Re-fetch with full relations for the response
    const updated = await this.prisma.loan.findUnique({
      where: { id },
      include: {
        customer: true,
        installments: { orderBy: { installmentNumber: "asc" } },
        account: true,
        guarantor: true,
      },
    });

    return this.formatLoanResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const loan = await this.prisma.loan.findUnique({ where: { id } });
    if (!loan) throw new NotFoundException("Loan not found");
    await this.prisma.loan.delete({ where: { id } });
  }

  async receivePayment(id: string, dto: RecordPaymentDto): Promise<any> {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: {
        customer: true,
        account: true,
        installments: { orderBy: { installmentNumber: "asc" } },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!loan) throw new NotFoundException("Loan not found");

    // Payments are only accepted on disbursed loans
    const payableStatuses = ["Active", "Overdue"];
    if (!payableStatuses.includes(loan.status)) {
      throw new BadRequestException(
        "Payments are only accepted on Active or Overdue loans",
      );
    }

    const refDate = dto.paymentDate ? dto.paymentDate.slice(0, 10) : todayISO();
    const amount = roundTo(dto.amount);

    if (amount <= 0) {
      throw new BadRequestException("Payment amount must be greater than zero");
    }

    // Build the installment view the allocator expects
    const installmentsForAlloc = loan.installments.map((inst) => ({
      installmentNumber: inst.installmentNumber,
      dueDate: inst.dueDate.toISOString().slice(0, 10),
      principalAmount: Number(inst.principalAmount),
      interestAmount: Number(inst.interestAmount),
      totalInstallment: Number(inst.totalInstallment),
      paidAmount: Number(inst.paidAmount),
      remainingAmount: Number(inst.remainingAmount),
      status: inst.status,
      lateFee: Number(inst.lateFee),
      paidPrincipal: Number(inst.paidPrincipal) || 0,
      paidInterest: Number(inst.paidInterest) || 0,
      lateFeePaid: Number(inst.lateFeePaid) || 0,
    }));

    // Shape the loan the way `allocatePayment` expects
    const loanLike = {
      id: loan.id,
      accountNumber: loan.accountNumber,
      customerName: loan.customer.fullName,
      customerPhone: loan.customer.phone,
      customerEmail: loan.customer.email || "",
      loanType: loan.loanType,
      requestedAmount: Number(loan.requestedAmount),
      disbursedAmount: Number(loan.disbursedAmount),
      interestRatePerAnnum: Number(loan.interestRatePerAnnum),
      termMonths: loan.termMonths,
      repaymentFrequency: loan.repaymentFrequency,
      interestMethod: loan.interestMethod,
      processingFee: Number(loan.processingFee),
      earlySettlementPenaltyPercent: Number(loan.earlySettlementPenaltyPercent),
      status: loan.status,
      requestedDate: loan.requestedDate.toISOString(),
      installments: installmentsForAlloc,
      payments: loan.payments || [],
      totalPaidAmount: Number(loan.totalPaidAmount),
      outstandingBalance: Number(loan.outstandingBalance),
      purpose: loan.purpose || "",
      creditScore: 0,
      kyc: null as any,
    };

    // Run the allocation engine
    const alloc = allocatePayment(loanLike, amount, refDate);

    // Compute the new loan totals
    const newTotalPaid = Number(loan.totalPaidAmount) + amount;
    const newOutstanding = Math.max(
      0,
      Number(loan.outstandingBalance) - amount,
    );
    const isFullySettled = newOutstanding <= 0;
    // Determine post-payment status
    const hasRemainingOverdue = installmentsForAlloc.some(
      (inst) =>
        inst.status !== "Paid" &&
        inst.remainingAmount > 0 &&
        new Date(inst.dueDate).getTime() < new Date(refDate).getTime(),
    );

    let nextStatus: string;
    if (isFullySettled) {
      nextStatus = "Settled";
    } else if (hasRemainingOverdue) {
      nextStatus = "Overdue";
    } else {
      // No overdue installments left — but only downgrade if it was Overdue
      nextStatus = loan.status === "Overdue" ? "Active" : loan.status;
    }

    // ---------- Run everything in a transaction ----------
    let createdPaymentId = "";

    await this.prisma.$transaction(async (tx) => {
      // 1. Update each affected installment
      for (const inst of loan.installments) {
        const updatedInst = installmentsForAlloc.find(
          (i) => i.installmentNumber === inst.installmentNumber,
        );
        if (!updatedInst) continue;

        // Only write if something changed (avoids pointless updates)
        const changed =
          updatedInst.paidAmount !== Number(inst.paidAmount) ||
          updatedInst.remainingAmount !== Number(inst.remainingAmount) ||
          updatedInst.status !== inst.status ||
          updatedInst.paidPrincipal !== (Number(inst.paidPrincipal) || 0) ||
          updatedInst.paidInterest !== (Number(inst.paidInterest) || 0) ||
          updatedInst.lateFeePaid !== (Number(inst.lateFeePaid) || 0);

        if (!changed) continue;

        await tx.installment.update({
          where: { id: inst.id },
          data: {
            paidAmount: updatedInst.paidAmount,
            remainingAmount: updatedInst.remainingAmount,
            status: updatedInst.status,
            paidPrincipal: updatedInst.paidPrincipal || 0,
            paidInterest: updatedInst.paidInterest || 0,
            lateFeePaid: updatedInst.lateFeePaid || 0,
            paidDate:
              updatedInst.status === "Paid" ? new Date(refDate) : undefined,
          },
        });
      }

      // 2. Create the Payment record
      const payment = await tx.payment.create({
        data: {
          loanId: loan.id,
          customerName: loan.customer.fullName,
          amount,
          paymentDate: new Date(refDate),
          paymentMethod: dto.paymentMethod,
          referenceNumber: dto.referenceNumber,
          receivedById: dto.receivedBy,
          notes: dto.notes,
          allocatedPrincipal: alloc.principalAllocated,
          allocatedInterest: alloc.interestAllocated,
          allocatedLateFee: alloc.lateFeeAllocated,
          installmentNumbersCovered: alloc.coveredInstallmentNumbers,
        },
        select: { id: true },
      });
      createdPaymentId = payment.id;

      // 3. Update the loan totals + status
      await tx.loan.update({
        where: { id: loan.id },
        data: {
          totalPaidAmount: newTotalPaid,
          outstandingBalance: newOutstanding,
          status: nextStatus,
          ...(isFullySettled && { settledDate: new Date(refDate) }),
          // recompute next due date from updated installments
          nextDueDate: (() => {
            const next = installmentsForAlloc
              .filter((i) => i.status !== "Paid" && i.remainingAmount > 0)
              .sort(
                (a, b) =>
                  new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
              )[0];
            return next ? new Date(next.dueDate) : null;
          })(),
          nextDueAmount: (() => {
            const next = installmentsForAlloc
              .filter((i) => i.status !== "Paid" && i.remainingAmount > 0)
              .sort(
                (a, b) =>
                  new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
              )[0];
            return next ? next.remainingAmount : null;
          })(),
        },
      });

      // 4. Sync the linked LoanAccount
      if (loan.accountId) {
        await tx.loanAccount.update({
          where: { id: loan.accountId },
          data: {
            totalCollected: { increment: amount },
            remainingBalance: Math.max(0, newOutstanding),
          },
        });
      }
    });

    // ---------- SMS alert (outside the tx — best-effort) ----------
    const freshPayment = await this.prisma.payment.findUnique({
      where: { id: createdPaymentId },
      include: {
        receivedBy: true,
        loan: { include: { customer: true } },
      },
    });

    let smsResult: { status?: string; recipient?: string; message?: string } =
      {};

    if (freshPayment) {
      try {
        smsResult = isFullySettled
          ? await this.smsSettlementAlert(loan, freshPayment, "final")
          : await this.smsPaymentAlert(loan, freshPayment);
      } catch (err) {
        // swallow — SMS failure should not break the payment response
        console.error("SMS send failed:", err);
      }
    }

    return this.formatPaymentResponse(freshPayment, alloc, smsResult);
  }

  async earlySettle(id: string, dto: ExecuteSettlementDto): Promise<any> {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: {
        customer: true,
        account: true,
        installments: { orderBy: { installmentNumber: "asc" } },
        payments: {
          orderBy: { createdAt: "desc" },
          include: { receivedBy: true },
        },
      },
    });

    if (!loan) throw new NotFoundException("Loan not found");

    // Only disbursed, not-yet-closed loans can be settled
    const closedStatuses = ["Settled", "Early_Settled", "Rejected"];
    if (closedStatuses.includes(loan.status)) {
      throw new BadRequestException("Loan is already closed");
    }
    if (!loan.disbursedAmount || Number(loan.disbursedAmount) <= 0) {
      throw new BadRequestException(
        "Loan must be disbursed before early settlement",
      );
    }

    const refDate = dto.settlementDate
      ? dto.settlementDate.slice(0, 10)
      : todayISO();

    // Build the installment view for the quote calculator
    const installmentsForCalc = loan.installments.map((inst) => ({
      installmentNumber: inst.installmentNumber,
      dueDate: inst.dueDate.toISOString().slice(0, 10),
      principalAmount: Number(inst.principalAmount),
      interestAmount: Number(inst.interestAmount),
      totalInstallment: Number(inst.totalInstallment),
      paidAmount: Number(inst.paidAmount),
      remainingAmount: Number(inst.remainingAmount),
      status: inst.status as InstallmentStatus,
      lateFee: Number(inst.lateFee),
      paidPrincipal: Number(inst.paidPrincipal) || 0,
      paidInterest: Number(inst.paidInterest) || 0,
      lateFeePaid: Number(inst.lateFeePaid) || 0,
    }));

    // Shape a Loan for the quote calculator (server always recomputes)
    const loanLike: Loan = {
      id: loan.id,
      accountNumber: loan.accountNumber,
      customerName: loan.customer.fullName,
      customerPhone: loan.customer.phone,
      customerEmail: loan.customer.email || "",
      loanType: loan.loanType as LoanType,
      requestedAmount: Number(loan.requestedAmount),
      disbursedAmount: Number(loan.disbursedAmount),
      interestRatePerAnnum: Number(loan.interestRatePerAnnum),
      termMonths: loan.termMonths,
      repaymentFrequency: loan.repaymentFrequency as RepaymentFrequency,
      interestMethod: loan.interestMethod as InterestMethod,
      processingFee: Number(loan.processingFee),
      earlySettlementPenaltyPercent: Number(loan.earlySettlementPenaltyPercent),
      status: loan.status as Loan["status"],
      requestedDate: loan.requestedDate.toISOString(),
      installments: installmentsForCalc,
      payments: loan.payments.map((p) => this.toPaymentRecord(p)),
      totalPaidAmount: Number(loan.totalPaidAmount),
      outstandingBalance: Number(loan.outstandingBalance),
      purpose: loan.purpose || "",
      creditScore: 0,
      kyc: null as any,
    };

    // Compute the authoritative quote
    const quote = calculateEarlySettlementQuote(loanLike, refDate);
    const settlementAmount = roundTo(quote.totalSettlementAmount);

    // Covered installment numbers = those not fully paid
    const coveredInstallmentNumbers = installmentsForCalc
      .filter((i) => i.status !== "Paid" || i.remainingAmount > 0)
      .map((i) => i.installmentNumber);

    const officerId = (dto as any).receivedBy; // will be null-safe below
    const receivedById = dto.receivedBy || null;

    // ---------- Run everything in a transaction ----------
    let createdPaymentId = "";

    await this.prisma.$transaction(async (tx) => {
      // 1. Mark all installments as paid (settlement closes them)
      for (const inst of loan.installments) {
        if (inst.status === "Paid" && Number(inst.remainingAmount) <= 0) {
          continue;
        }

        await tx.installment.update({
          where: { id: inst.id },
          data: {
            paidAmount: Number(inst.totalInstallment),
            remainingAmount: 0,
            status: "Paid",
            paidPrincipal: Number(inst.principalAmount),
            paidInterest: Number(inst.interestAmount),
            paidDate: new Date(refDate),
          },
        });
      }

      // 2. Create the settlement Payment record
      const payment = await tx.payment.create({
        data: {
          loanId: loan.id,
          customerName: loan.customer.fullName,
          amount: settlementAmount,
          paymentDate: new Date(refDate),
          paymentMethod: dto.paymentMethod,
          referenceNumber: dto.referenceNumber,
          receivedById,
          notes: dto.notes || "Early settlement payoff",
          allocatedPrincipal: quote.outstandingPrincipalBalance,
          allocatedInterest: quote.accruedInterestToDate,
          allocatedLateFee: quote.earlySettlementPenaltyFee,
          installmentNumbersCovered: coveredInstallmentNumbers,
        },
        select: { id: true },
      });
      createdPaymentId = payment.id;

      // 3. Update the loan: status, quote, totals, dates
      await tx.loan.update({
        where: { id: loan.id },
        data: {
          status: "Early_Settled",
          settledDate: new Date(refDate),
          totalPaidAmount: {
            increment: settlementAmount,
          },
          outstandingBalance: 0,
          nextDueDate: null,
          nextDueAmount: null,
          earlySettlementQuote: quote as any,
        },
      });

      // 4. Sync the linked LoanAccount
      if (loan.accountId) {
        await tx.loanAccount.update({
          where: { id: loan.accountId },
          data: {
            totalCollected: { increment: settlementAmount },
            remainingBalance: 0,
          },
        });
      }
    });

    // ---------- SMS alert (best-effort, outside tx) ----------
    const freshPayment = await this.prisma.payment.findUnique({
      where: { id: createdPaymentId },
      include: {
        receivedBy: true,
        loan: { include: { customer: true } },
      },
    });

    if (freshPayment) {
      try {
        await this.smsSettlementAlert(loan, freshPayment, "early");
      } catch (err) {
        console.error("SMS send failed:", err);
      }
    }

    // Return the fully-hydrated loan with the new quote
    return this.getOne(loan.id);
  }

  // ---------------------------------------------------------------------------
  // Document uploads
  // ---------------------------------------------------------------------------

  async presignDocument(
    id: string,
    input: { fileName: string; contentType: string; documentType: string },
  ): Promise<{ documentId: string; key: string; uploadUrl: string }> {
    await this.getOne(id);
    const documentId = `DOC-${randomSuffix(8)}`;
    const key = `loans/${id}/documents/${Date.now()}-${input.fileName}`;
    const uploadUrl = await this.storage.presignPut(key, input.contentType);
    return { documentId, key, uploadUrl };
  }

  async attachDocument(
    id: string,
    input: {
      documentId: string;
      key: string;
      documentType: string;
      fileName: string;
    },
  ): Promise<any> {
    const loan = await this.prisma.loan.findUnique({ where: { id } });
    if (!loan) throw new NotFoundException("Loan not found");

    const existingDoc = await this.prisma.loanDocument.findFirst({
      where: {
        loanId: id,
        documentType: input.documentType,
      },
    });

    if (existingDoc) {
      throw new BadRequestException(
        `Document of type ${input.documentType} already exists`,
      );
    }

    await this.prisma.loanDocument.create({
      data: {
        loanId: id,
        documentType: input.documentType,
        fileName: input.fileName,
        fileKey: input.key,
        fileUrl: await this.storage.presignGet(input.key),
        status: "Pending_Review",
        uploadedAt: new Date(),
      },
    });

    return this.getOne(id);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private toPaymentRecord(payment: any): PaymentRecord {
    return {
      id: payment.id,
      loanId: payment.loanId,
      customerName: payment.customerName,
      amount: Number(payment.amount),
      paymentDate: payment.paymentDate.toISOString().slice(0, 10),
      paymentMethod: payment.paymentMethod,
      referenceNumber: payment.referenceNumber ?? "",
      receivedBy: payment.receivedBy?.fullName || payment.receivedById || "",
      notes: payment.notes ?? undefined,
      allocatedPrincipal: Number(payment.allocatedPrincipal) || 0,
      allocatedInterest: Number(payment.allocatedInterest) || 0,
      allocatedLateFee: Number(payment.allocatedLateFee) || 0,
      principalPortion: Number(payment.allocatedPrincipal) || 0, // fallback
      interestPortion: Number(payment.allocatedInterest) || 0, // fallback
      installmentNumbersCovered: payment.installmentNumbersCovered ?? [],
      smsStatus: (payment.smsStatus as any) ?? undefined,
      smsRecipient: payment.smsRecipient ?? undefined,
      smsMessage: payment.smsMessage ?? undefined,
    };
  }

  private formatLoanResponse(loan: any): any {
    // Calculate next due date and amount from installments
    let nextDueDate: string | undefined = undefined;
    let nextDueAmount: number | undefined = undefined;

    if (loan.installments && loan.installments.length > 0) {
      const nextPendingInstallment = loan.installments
        .filter(
          (inst: any) =>
            inst.status !== "Paid" && Number(inst.remainingAmount) > 0,
        )
        .sort(
          (a: any, b: any) =>
            new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
        )[0];

      if (nextPendingInstallment) {
        nextDueDate = nextPendingInstallment.dueDate.toISOString().slice(0, 10);
        nextDueAmount = Number(nextPendingInstallment.remainingAmount);
      }
    }

    return {
      // Identity
      id: loan.id,
      loanNumber: loan.loanNumber,

      // Account
      account: loan.account,

      // Customer
      customer: loan.customer,

      // Guarantor
      guarantor: loan.guarantor,

      // Loan Details
      loanType: loan.loanType,
      requestedAmount: Number(loan.requestedAmount),
      // disbursedAmount: Number(loan.disbursedAmount),
      interestRatePerAnnum: Number(loan.interestRatePerAnnum),
      termMonths: loan.termMonths,
      repaymentFrequency: loan.repaymentFrequency,
      interestMethod: loan.interestMethod,
      processingFee: Number(loan.processingFee),
      earlySettlementPenaltyPercent: Number(loan.earlySettlementPenaltyPercent),

      // Status & Dates
      status: loan.status,
      requestedDate: loan.requestedDate.toISOString().slice(0, 10),
      approvedDate: loan.approvedDate
        ? loan.approvedDate.toISOString().slice(0, 10)
        : undefined,
      disbursedDate: loan.disbursedDate
        ? loan.disbursedDate.toISOString().slice(0, 10)
        : undefined,
      settledDate: loan.settledDate
        ? loan.settledDate.toISOString().slice(0, 10)
        : undefined,

      // Installments
      installments:
        loan.installments?.map((i: any) => ({
          installmentNumber: i.installmentNumber,
          dueDate: i.dueDate.toISOString().slice(0, 10),
          principalAmount: Number(i.principalAmount),
          interestAmount: Number(i.interestAmount),
          totalInstallment: Number(i.totalInstallment),
          paidAmount: Number(i.paidAmount),
          remainingAmount: Number(i.remainingAmount),
          status: i.status,
          paidDate: i.paidDate
            ? i.paidDate.toISOString().slice(0, 10)
            : undefined,
          lateFee: Number(i.lateFee),
        })) || [],

      // Payments
      payments:
        loan.payments?.map((p: any) => ({
          id: p.id,
          loanId: p.loanId,
          customerName: p.customerName,
          amount: Number(p.amount),
          paymentDate: p.paymentDate.toISOString().slice(0, 10),
          paymentMethod: p.paymentMethod,
          referenceNumber: p.referenceNumber || "",
          receivedBy: p.receivedBy?.fullName || p.receivedById || "",
          notes: p.notes || undefined,
          allocatedPrincipal: Number(p.allocatedPrincipal) || 0,
          allocatedInterest: Number(p.allocatedInterest) || 0,
          allocatedLateFee: Number(p.allocatedLateFee) || 0,
          installmentNumbersCovered: p.installmentNumbersCovered || [],
        })) || [],

      // Documents
      documents: loan.documents,

      // Early Settlement Quote
      earlySettlementQuote: loan.earlySettlementQuote || undefined,

      // Totals
      totalPaidAmount: Number(loan.totalPaidAmount),
      outstandingBalance: Number(loan.outstandingBalance),

      // Next Due
      nextDueDate,
      nextDueAmount,

      // Other
      purpose: loan.purpose || "",
    };
  }

  private formatLoanListResponse(loan: any): any {
    // Calculate next due date and amount from installments
    let nextDueDate: string | undefined = undefined;
    let nextDueAmount: number | undefined = undefined;

    // if (loan.installments && loan.installments.length > 0) {
    //   // Find the next pending/overdue installment
    //   const nextPendingInstallment = loan.installments
    //     .filter(
    //       (inst: any) =>
    //         inst.status !== "Paid" && Number(inst.remainingAmount) > 0,
    //     )
    //     .sort(
    //       (a: any, b: any) =>
    //         new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    //     )[0];

    //   if (nextPendingInstallment) {
    //     nextDueDate = nextPendingInstallment.dueDate.toISOString().slice(0, 10);
    //     nextDueAmount = Number(nextPendingInstallment.remainingAmount);
    //   }
    // }

    return {
      ...loan,
      // customerName: loan.customer?.fullName,
      // customerNumber: loan.customer?.customerNumber,
      requestedAmount: Number(loan.requestedAmount),
      disbursedAmount: Number(loan.disbursedAmount),
      interestRatePerAnnum: Number(loan.interestRatePerAnnum),
      totalPaidAmount: Number(loan.totalPaidAmount),
      outstandingBalance: Number(loan.outstandingBalance),
      processingFee: Number(loan.processingFee),
      earlySettlementPenaltyPercent: Number(loan.earlySettlementPenaltyPercent),
      nextDueDate,
      nextDueAmount,
      // installments:
      //   loan.installments?.map((i: any) => ({
      //     ...i,
      //     dueDate: i.dueDate.toISOString().slice(0, 10),
      //     principalAmount: Number(i.principalAmount),
      //     interestAmount: Number(i.interestAmount),
      //     totalInstallment: Number(i.totalInstallment),
      //     paidAmount: Number(i.paidAmount),
      //     remainingAmount: Number(i.remainingAmount),
      //     lateFee: Number(i.lateFee),
      //     paidPrincipal: Number(i.paidPrincipal) || 0,
      //     paidInterest: Number(i.paidInterest) || 0,
      //     lateFeePaid: Number(i.lateFeePaid) || 0,
      //     paidDate: i.paidDate
      //       ? i.paidDate.toISOString().slice(0, 10)
      //       : undefined,
      //   })) || [],
      // payments:
      //   loan.payments?.map((p: any) => ({
      //     ...p,
      //     amount: Number(p.amount),
      //     allocatedPrincipal: Number(p.allocatedPrincipal) || 0,
      //     allocatedInterest: Number(p.allocatedInterest) || 0,
      //     allocatedLateFee: Number(p.allocatedLateFee) || 0,
      //     paymentDate: p.paymentDate.toISOString().slice(0, 10),
      //   })) || [],
    };
  }

  private formatPaymentResponse(
    payment: any,
    alloc: {
      principalAllocated: number;
      interestAllocated: number;
      lateFeeAllocated: number;
    },
    sms?: { status?: string; recipient?: string; message?: string },
  ): PaymentRecord {
    return {
      id: payment.id,
      loanId: payment.loanId,
      customerName: payment.customerName,
      amount: Number(payment.amount),
      paymentDate: payment.paymentDate.toISOString().slice(0, 10),
      paymentMethod: payment.paymentMethod,
      referenceNumber: payment.referenceNumber ?? "",
      receivedBy: payment.receivedBy?.fullName || payment.receivedById || "",
      notes: payment.notes ?? undefined,
      allocatedPrincipal: Number(payment.allocatedPrincipal) || 0,
      allocatedInterest: Number(payment.allocatedInterest) || 0,
      allocatedLateFee: Number(payment.allocatedLateFee) || 0,
      principalPortion: alloc.principalAllocated,
      interestPortion: alloc.interestAllocated,
      installmentNumbersCovered: payment.installmentNumbersCovered ?? [],
      smsStatus: (sms?.status as any) ?? undefined,
      smsRecipient: sms?.recipient ?? undefined,
      smsMessage: sms?.message ?? undefined,
    };
  }

  private async smsPaymentAlert(
    loan: any,
    record: any,
  ): Promise<{ status: string; recipient: string; message: string }> {
    const message = `Dear ${loan.customer.fullName}, LKR ${Number(
      record.amount,
    ).toLocaleString("en-LK", {
      minimumFractionDigits: 2,
    })} received for Loan ${loan.loanNumber}. Thank you, SMV Holdings.`;

    try {
      const result = await this.sms.send({
        recipient: loan.customer.phone,
        message,
        loanId: loan.id,
        customerName: loan.customer.fullName,
        amount: Number(record.amount),
      });

      return {
        status: (result as any)?.status ?? "SENT",
        recipient: loan.customer.phone,
        message,
      };
    } catch (error) {
      console.error("SMS send failed:", error);
      return {
        status: "FAILED",
        recipient: loan.customer.phone,
        message,
      };
    }
  }

  private async smsSettlementAlert(
    loan: any,
    record: any,
    settlementType: "early" | "final",
  ): Promise<{ status: string; recipient: string; message: string }> {
    const amount = Number(record.amount).toLocaleString("en-LK", {
      minimumFractionDigits: 2,
    });

    const message =
      settlementType === "early"
        ? `Dear ${loan.customer.fullName}, your loan ${loan.loanNumber} has been EARLY SETTLED with a final payment of LKR ${amount}. All obligations are cleared. Thank you, SMV Holdings.`
        : `Dear ${loan.customer.fullName}, your loan ${loan.loanNumber} has been FULLY SETTLED with a final payment of LKR ${amount}. All obligations are cleared. Thank you, SMV Holdings.`;

    try {
      const result = await this.sms.send({
        recipient: loan.customer.phone,
        message,
        loanId: loan.id,
        customerName: loan.customer.fullName,
        amount: Number(record.amount),
      });

      return {
        status: (result as any)?.status ?? "SENT",
        recipient: loan.customer.phone,
        message,
      };
    } catch (error) {
      console.error("Settlement SMS send failed:", error);
      return {
        status: "FAILED",
        recipient: loan.customer.phone,
        message,
      };
    }
  }

  private async smsDisbursementAlert(
    loan: any,
    disbursedAmount: number,
  ): Promise<{ status: string; recipient: string; message: string }> {
    const amountFormatted = disbursedAmount.toLocaleString("en-LK", {
      minimumFractionDigits: 2,
    });

    const nextDue = loan.installments
      ?.filter((i: any) => i.status !== "Paid" && Number(i.remainingAmount) > 0)
      .sort(
        (a: any, b: any) =>
          new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
      )[0];

    const firstDueLine = nextDue
      ? ` First installment of LKR ${Number(
          nextDue.remainingAmount,
        ).toLocaleString("en-LK", {
          minimumFractionDigits: 2,
        })} is due on ${nextDue.dueDate.toISOString().slice(0, 10)}.`
      : "";

    const message = `Dear ${loan.customer.fullName}, your loan ${loan.loanNumber} has been disbursed. Net amount credited: LKR ${amountFormatted}.${firstDueLine} Thank you, SMV Holdings.`;

    try {
      const result = await this.sms.send({
        recipient: loan.customer.phone,
        message,
        loanId: loan.id,
        customerName: loan.customer.fullName,
        amount: disbursedAmount,
      });

      return {
        status: (result as any)?.status ?? "SENT",
        recipient: loan.customer.phone,
        message,
      };
    } catch (error) {
      console.error("Disbursement SMS send failed:", error);
      return {
        status: "FAILED",
        recipient: loan.customer.phone,
        message,
      };
    }
  }
}
