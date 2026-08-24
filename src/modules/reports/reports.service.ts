import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { FinancialSummary } from '../../shared/types';
import { computeLoan, roundTo } from '../../common/utils/financial';
import { todayISO } from '../../common/utils/dates';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(referenceDate?: string): Promise<FinancialSummary> {
    const today = referenceDate ?? todayISO();
    const rows = await this.prisma.loan.findMany();
    const loans = rows
      .map((row: any) => (row.data ?? {}) as Record<string, any>)
      .map((data: any) => computeLoan({ ...data, payments: data.payments ?? [] } as any, today));

    let totalDisbursedAmount = 0;
    let totalOutstandingBalance = 0;
    let totalCollectedAmount = 0;
    let totalInterestEarned = 0;
    const counts = {
      totalLoansDisbursed: 0,
      active: 0,
      overdue: 0,
      pendingApproval: 0,
      pendingKyc: 0,
      settled: 0,
    };

    for (const loan of loans) {
      if (loan.disbursedAmount > 0) counts.totalLoansDisbursed += 1;
      totalDisbursedAmount = roundTo(totalDisbursedAmount + loan.disbursedAmount);
      totalOutstandingBalance = roundTo(totalOutstandingBalance + loan.outstandingBalance);
      totalCollectedAmount = roundTo(totalCollectedAmount + loan.totalPaidAmount);

      for (const inst of loan.installments) {
        totalInterestEarned = roundTo(totalInterestEarned + (inst.paidInterest ?? 0));
      }

      switch (loan.status) {
        case 'Active':
          counts.active += 1;
          break;
        case 'Overdue':
          counts.overdue += 1;
          break;
        case 'Pending Approval':
          counts.pendingApproval += 1;
          break;
        case 'KYC Pending':
          counts.pendingKyc += 1;
          break;
        case 'Settled':
        case 'Early Settled':
          counts.settled += 1;
          break;
      }
    }

    return {
      totalLoansDisbursed: counts.totalLoansDisbursed,
      totalDisbursedAmount: roundTo(totalDisbursedAmount),
      totalOutstandingBalance,
      totalCollectedAmount,
      activeLoansCount: counts.active,
      overdueLoansCount: counts.overdue,
      pendingApprovalCount: counts.pendingApproval,
      pendingKycCount: counts.pendingKyc,
      settledLoansCount: counts.settled,
      totalInterestEarned,
    };
  }
}