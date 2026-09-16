import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../config/prisma.service";
import { SmsService } from "../sms/sms.service";
import { todayISO } from "../../common/utils/dates";
import { roundTo } from "../../common/utils/financial";

@Injectable()
export class OverdueService {
  private readonly logger = new Logger(OverdueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  /**
   * Runs every day at 06:00 (just after midnight).
   * Marks overdue installments, updates loan status, sends SMS alerts.
   */
  @Cron("0 6 * * *", {
    name: "overdue-check",
    timeZone: "Asia/Colombo",
  })
  async handleOverdueCheck(): Promise<void> {
    this.logger.log("Running overdue check...");

    const today = todayISO();

    // Find loans that are Active (not settled, not pre-disbursement)
    const activeLoans = await this.prisma.loan.findMany({
      where: {
        status: { in: ["Active", "Overdue"] },
      },
      include: {
        customer: true,
        installments: {
          orderBy: { installmentNumber: "asc" },
        },
      },
    });

    this.logger.log(`Checking ${activeLoans.length} active loan(s)`);

    for (const loan of activeLoans) {
      await this.processLoanOverdue(loan, today);
    }

    this.logger.log("Overdue check complete.");
  }

  /**
   * Process a single loan: find overdue installments, mark them,
   * update status, send SMS.
   */
  private async processLoanOverdue(loan: any, today: string): Promise<void> {
    // Find installments past their due date that aren't fully paid
    const overdueInstallments = loan.installments.filter(
      (inst: any) =>
        inst.status !== "Paid" &&
        Number(inst.remainingAmount) > 0 &&
        new Date(inst.dueDate).toISOString().slice(0, 10) < today,
    );

    if (overdueInstallments.length === 0) {
      // No overdue installments — if loan was marked Overdue, revert to Active
      if (loan.status === "Overdue") {
        await this.prisma.loan.update({
          where: { id: loan.id },
          data: { status: "Active" },
        });
        this.logger.log(
          `Loan ${loan.loanNumber} reverted to Active (all caught up)`,
        );
      }
      return;
    }

    // Calculate total overdue amount
    const totalOverdueAmount = roundTo(
      overdueInstallments.reduce(
        (sum: number, inst: any) => sum + Number(inst.remainingAmount),
        0,
      ),
    );

    const earliestDueDate = overdueInstallments[0].dueDate
      .toISOString()
      .slice(0, 10);
    const oldestInstallmentNumber = overdueInstallments[0].installmentNumber;

    // Update installments to Overdue status
    for (const inst of overdueInstallments) {
      if (inst.status === "Overdue") continue; // already marked

      await this.prisma.installment.update({
        where: { id: inst.id },
        data: {
          status: "Overdue",
          // Optionally apply late fee here
          // lateFee: calculateLateFee(inst, today),
        },
      });
    }

    // Update loan status to Overdue
    if (loan.status !== "Overdue") {
      await this.prisma.loan.update({
        where: { id: loan.id },
        data: { status: "Overdue" },
      });
      this.logger.log(
        `Loan ${loan.loanNumber} marked Overdue — ${overdueInstallments.length} installment(s), LKR ${totalOverdueAmount.toLocaleString()}`,
      );
    }

    // Send SMS notification
    await this.sendOverdueSms(
      loan,
      totalOverdueAmount,
      earliestDueDate,
      oldestInstallmentNumber,
    );
  }

  /**
   * Send overdue SMS to customer.
   */
  private async sendOverdueSms(
    loan: any,
    amount: number,
    dueDate: string,
    installmentNumber: number,
  ): Promise<void> {
    try {
      const message =
        `Dear ${loan.customer.fullName}, your loan ${loan.loanNumber} ` +
        `has an overdue installment #${installmentNumber} of LKR ${amount.toLocaleString("en-LK", { minimumFractionDigits: 2 })} ` +
        `due on ${dueDate}. Please settle at your earliest. SMV Holdings.`;

      await this.sms.send({
        recipient: loan.customer.phone,
        message,
        loanId: loan.id,
        customerName: loan.customer.fullName,
        amount,
      });

      this.logger.log(`Overdue SMS sent to ${loan.customer.phone}`);
    } catch (error) {
      this.logger.error(
        `Failed to send overdue SMS for ${loan.loanNumber}: ${error}`,
      );
    }
  }

  /**
   * Manual trigger for testing (call from controller or CLI).
   */
  async runNow(): Promise<{ processed: number }> {
    const before = await this.prisma.loan.count({
      where: { status: "Overdue" },
    });
    await this.handleOverdueCheck();
    const after = await this.prisma.loan.count({
      where: { status: "Overdue" },
    });
    return { processed: after - before };
  }
}
