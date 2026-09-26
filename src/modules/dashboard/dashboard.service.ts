import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../config/prisma.service";
import { SmsService } from "../sms/sms.service";
import { AuthedUser } from "../../common/guards/auth.types";

interface HeaderStats {
  totalDisbursedAmount: number;
  totalOutstanding: number;
  smsUnit: number;
}

interface DashboardLoanRow {
  id: string;
  loanNumber: string;
  accountNumber: string | null;
  customerId: string;
  customerName: string;
  loanType: string;
  requestedAmount: number;
  disbursedAmount: number;
  totalPaidAmount: number;
  outstandingBalance: number;
  paidProgressPercent: number;
  status: string;
  requestedDate: string;
  nextDueDate?: string;
  nextDueAmount?: number;
}

interface DashboardStats {
  totalDisbursedAmount: number;
  totalOutstanding: number;
  totalCollected: number;
  disbursedLoanCount: number;
  settledLoanCount: number;
  pendingActions: {
    total: number;
    pendingApproval: number;
    kycPending: number;
    pendingDisbursement: number;
  };
  latestLoans: DashboardLoanRow[];
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Header (lightweight — called frequently)
  // ---------------------------------------------------------------------------
  async getHeader(user: AuthedUser): Promise<HeaderStats> {
    const canSeeAmounts = user.role === "admin" || user.role === "manager";

    // SMS unit is visible to everyone — fetch in parallel with (optional) aggregates
    const [smsUnit, disbursedAgg, outstandingAgg] = await Promise.all([
      this.fetchSmsUnit(),
      canSeeAmounts
        ? this.prisma.loan.aggregate({
            where: {
              status: {
                in: ["Active", "Overdue", "Settled", "Early_Settled"],
              },
            },
            _sum: { disbursedAmount: true },
          })
        : Promise.resolve({ _sum: { disbursedAmount: 0 } } as any),
      canSeeAmounts
        ? this.prisma.loan.aggregate({
            where: { status: { in: ["Active", "Overdue"] } },
            _sum: { outstandingBalance: true },
          })
        : Promise.resolve({ _sum: { outstandingBalance: 0 } } as any),
    ]);

    return {
      totalDisbursedAmount: Number(disbursedAgg._sum.disbursedAmount ?? 0),
      totalOutstanding: Number(outstandingAgg._sum.outstandingBalance ?? 0),
      smsUnit,
    };
  }

  // ---------------------------------------------------------------------------
  // SMS balance — best-effort, never breaks the header
  // ---------------------------------------------------------------------------
  private async fetchSmsUnit(): Promise<number> {
    try {
      const balance = await this.sms.getBalance();
      return balance.remainingBalance ?? 0;
    } catch (err) {
      // this.logger.warn(
      //   `Failed to fetch SMS balance: ${
      //     err instanceof Error ? err.message : String(err)
      //   }`,
      // );
      return 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Full dashboard
  // ---------------------------------------------------------------------------
  async getDashboard(): Promise<DashboardStats> {
    const disbursedStatuses = ["Active", "Overdue", "Settled", "Early_Settled"];
    const settledStatuses = ["Settled", "Early_Settled"];

    const [
      disbursedAgg,
      outstandingAgg,
      collectedAgg,
      disbursedCount,
      settledCount,
      pendingApprovalCount,
      kycPendingCount,
      pendingDisbursementCount,
      latestLoansRaw,
    ] = await Promise.all([
      this.prisma.loan.aggregate({
        where: { status: { in: disbursedStatuses } },
        _sum: { disbursedAmount: true },
      }),
      this.prisma.loan.aggregate({
        where: { status: { in: ["Active", "Overdue"] } },
        _sum: { outstandingBalance: true },
      }),
      this.prisma.loan.aggregate({
        where: { status: { in: disbursedStatuses } },
        _sum: { totalPaidAmount: true },
      }),
      this.prisma.loan.count({ where: { status: { in: disbursedStatuses } } }),
      this.prisma.loan.count({ where: { status: { in: settledStatuses } } }),
      this.prisma.loan.count({ where: { status: "Pending_Approval" } }),
      this.prisma.loan.count({ where: { status: "KYC_Pending" } }),
      this.prisma.loan.count({
        where: { status: "Approved_Pending_Disbursement" },
      }),

      // Latest 10 loans — only what we need for progress + next due
      this.prisma.loan.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          loanNumber: true,
          loanType: true,
          requestedAmount: true,
          disbursedAmount: true,
          totalPaidAmount: true,
          outstandingBalance: true,
          status: true,
          requestedDate: true,
          customer: { select: { id: true, fullName: true } },
          account: { select: { accountNumber: true } },
          installments: {
            where: { status: { not: "Paid" } },
            orderBy: { dueDate: "asc" },
            take: 1,
            select: {
              dueDate: true,
              remainingAmount: true,
            },
          },
        },
      }),
    ]);

    return {
      totalDisbursedAmount: Number(disbursedAgg._sum.disbursedAmount ?? 0),
      totalOutstanding: Number(outstandingAgg._sum.outstandingBalance ?? 0),
      totalCollected: Number(collectedAgg._sum.totalPaidAmount ?? 0),
      disbursedLoanCount: disbursedCount,
      settledLoanCount: settledCount,
      pendingActions: {
        total:
          pendingApprovalCount + kycPendingCount + pendingDisbursementCount,
        pendingApproval: pendingApprovalCount,
        kycPending: kycPendingCount,
        pendingDisbursement: pendingDisbursementCount,
      },
      latestLoans: latestLoansRaw.map((row) => this.toDashboardLoan(row)),
    };
  }

  // ---------------------------------------------------------------------------
  // Quick search — lightweight endpoint for the global search bar
  // ---------------------------------------------------------------------------
  async search(term: string, limit: number): Promise<any[]> {
    const q = term?.trim() ?? "";
    if (q.length < 2) return [];

    const cappedLimit = Math.min(Math.max(limit, 1), 50);

    const rows = await this.prisma.loan.findMany({
      where: {
        OR: [
          { customer: { fullName: { contains: q, mode: "insensitive" } } },
          { customer: { idNumber: { contains: q } } },
          { customer: { phone: { contains: q } } },
          { loanNumber: { contains: q, mode: "insensitive" } },
          //   { account: { accountNumber: { contains: q, mode: "insensitive" } } },
          // Optional — uncomment if you want status text search too
          { status: { contains: q.replace(/\s+/g, "_"), mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        loanNumber: true,
        status: true,
        requestedAmount: true,
        customer: {
          select: {
            id: true,
            fullName: true,
            idNumber: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: cappedLimit,
    });

    return rows.map((row) => ({
      id: row.id,
      loanNumber: row.loanNumber,
      status: row.status,
      requestedAmount: Number(row.requestedAmount),
      customer: {
        id: row.customer.id,
        fullName: row.customer.fullName,
        idNumber: row.customer.idNumber,
      },
    }));
  }

  // ---------------------------------------------------------------------------
  // Navigation counts — badges for sidebar / nav items
  // ---------------------------------------------------------------------------
  async getNavigationCounts(): Promise<{
    pendingApproval: number;
    pendingKyc: number;
    overdue: number;
  }> {
    const [pendingApproval, kycPending, pendingDisbursement, overdue] =
      await Promise.all([
        this.prisma.loan.count({ where: { status: "Pending_Approval" } }),
        this.prisma.loan.count({ where: { status: "KYC_Pending" } }),
        this.prisma.loan.count({
          where: { status: "Approved_Pending_Disbursement" },
        }),
        this.prisma.loan.count({ where: { status: "Overdue" } }),
      ]);

    return {
      pendingApproval,
      // "KYC" nav badge = KYC_Pending + Approved_Pending_Disbursement
      pendingKyc: kycPending + pendingDisbursement,
      overdue,
    };
  }

  // ---------------------------------------------------------------------------
  // Per-loan summary: paid progress, paid total, outstanding, next due
  // ---------------------------------------------------------------------------
  private toDashboardLoan(loan: any): DashboardLoanRow {
    const requestedAmount = Number(loan.requestedAmount);
    const disbursedAmount = Number(loan.disbursedAmount);
    const totalPaidAmount = Number(loan.totalPaidAmount);
    const outstandingBalance = Number(loan.outstandingBalance);

    // Progress = paid / total payable, where total payable = paid + outstanding
    // (equivalent to interest + principal owed). This makes progress reach 100%
    // exactly when outstanding reaches 0.
    const totalPayable = totalPaidAmount + outstandingBalance;
    const paidProgressPercent =
      totalPayable > 0
        ? Math.min(100, Math.round((totalPaidAmount / totalPayable) * 100))
        : 0;

    const showNextDue = loan.status === "Active" || loan.status === "Overdue";

    const nextInst = showNextDue ? loan.installments?.[0] : undefined;

    const nextDueDate = nextInst?.dueDate
      ? nextInst.dueDate.toISOString().slice(0, 10)
      : undefined;
    const nextDueAmount = nextInst?.remainingAmount
      ? Number(nextInst.remainingAmount)
      : undefined;

    return {
      id: loan.id,
      loanNumber: loan.loanNumber,
      accountNumber: loan.account?.accountNumber ?? null,
      customerId: loan.customer?.id ?? "",
      customerName: loan.customer?.fullName ?? "",
      loanType: loan.loanType,
      requestedAmount,
      disbursedAmount,
      totalPaidAmount,
      outstandingBalance,
      paidProgressPercent,
      status: loan.status,
      requestedDate: loan.requestedDate.toISOString().slice(0, 10),
      nextDueDate,
      nextDueAmount,
    };
  }
}
