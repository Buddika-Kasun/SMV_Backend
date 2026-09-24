import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../config/prisma.service";
import { SmsService } from "../sms/sms.service";
import { todayISO } from "../../common/utils/dates";
import { roundTo } from "../../common/utils/financial";
import { EventBusService } from "../event/event-bus.service";

/** How many days between overdue reminder SMS messages. */
const SMS_REMINDER_INTERVAL_DAYS = 7;

/** Marker embedded in the SMS body so we can identify overdue reminders. */
const OVERDUE_SMS_MARKER = "overdue installment";

type OverdueProcessResult = "no_change" | "marked_overdue" | "reverted_active";

@Injectable()
export class OverdueService {
  private readonly logger = new Logger(OverdueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly eventBus: EventBusService,
  ) {}

  // ---------------------------------------------------------------------------
  // Cron entry — runs daily at 07:00 Asia/Colombo
  // ---------------------------------------------------------------------------
  @Cron("0 7 * * *", {
    name: "overdue-check",
    timeZone: "Asia/Colombo",
  })
  async handleOverdueCheck(): Promise<void> {
    this.logger.log("Running overdue check...");

    const today = todayISO();

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

    let marked = 0;
    let reverted = 0;
    let smsSent = 0;

    for (const loan of activeLoans) {
      const result = await this.processLoanOverdue(loan, today);
      if (result.status === "marked_overdue") marked++;
      else if (result.status === "reverted_active") reverted++;
      if (result.smsSent) smsSent++;
    }

    this.logger.log(
      `Overdue check complete. Marked: ${marked}, Reverted: ${reverted}, SMS sent: ${smsSent}`,
    );

    await this.eventBus.publish({
      type: "stats.changed",
      payload: { source: "overdue-cron", marked, reverted, smsSent },
    });
  }

  // ---------------------------------------------------------------------------
  // Process a single loan
  // ---------------------------------------------------------------------------
  private async processLoanOverdue(
    loan: any,
    today: string,
  ): Promise<{ status: OverdueProcessResult; smsSent: boolean }> {
    // Find installments past their due date that aren't fully paid
    const overdueInstallments = loan.installments.filter(
      (inst: any) =>
        inst.status !== "Paid" &&
        Number(inst.remainingAmount) > 0 &&
        new Date(inst.dueDate).toISOString().slice(0, 10) < today,
    );

    // ---------------------------------------------------------
    // Case 1: No overdue installments
    // ---------------------------------------------------------
    if (overdueInstallments.length === 0) {
      if (loan.status === "Overdue") {
        await this.prisma.loan.update({
          where: { id: loan.id },
          data: { status: "Active" },
        });

        this.logger.log(
          `Loan ${loan.loanNumber} reverted to Active (all caught up)`,
        );

        await this.eventBus.publish({
          type: "loans.changed",
          payload: {
            action: "reverted_active",
            loanId: loan.id,
            loanNumber: loan.loanNumber,
            source: "overdue-cron",
          },
        });

        return { status: "reverted_active", smsSent: false };
      }

      return { status: "no_change", smsSent: false };
    }

    // ---------------------------------------------------------
    // Case 2: There are overdue installments
    // ---------------------------------------------------------
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

    for (const inst of overdueInstallments) {
      if (inst.status === "Overdue") continue;

      await this.prisma.installment.update({
        where: { id: inst.id },
        data: { status: "Overdue" },
      });
    }

    const transitionedToOverdue = loan.status !== "Overdue";

    if (transitionedToOverdue) {
      await this.prisma.loan.update({
        where: { id: loan.id },
        data: { status: "Overdue" },
      });

      this.logger.log(
        `Loan ${loan.loanNumber} marked Overdue — ${overdueInstallments.length} installment(s), LKR ${totalOverdueAmount.toLocaleString()}`,
      );

      await this.eventBus.publish({
        type: "loans.changed",
        payload: {
          action: "marked_overdue",
          loanId: loan.id,
          loanNumber: loan.loanNumber,
          overdueCount: overdueInstallments.length,
          overdueAmount: totalOverdueAmount,
          source: "overdue-cron",
        },
      });
    }

    // ---------------------------------------------------------
    // SMS reminder — first overdue OR 7 days since the last one
    // ---------------------------------------------------------
    const smsSent = await this.maybeSendOverdueSms(
      loan,
      totalOverdueAmount,
      earliestDueDate,
      oldestInstallmentNumber,
      transitionedToOverdue,
    );

    return {
      status: transitionedToOverdue ? "marked_overdue" : "no_change",
      smsSent,
    };
  }

  // ---------------------------------------------------------------------------
  // Decide whether to send the SMS (no schema change — reads SMSLog)
  // ---------------------------------------------------------------------------
  private async maybeSendOverdueSms(
    loan: any,
    amount: number,
    dueDate: string,
    installmentNumber: number,
    justBecameOverdue: boolean,
  ): Promise<boolean> {
    const now = new Date();

    // Look up the last overdue SMS for this loan, if any.
    //
    // The SMS body always contains the literal "overdue installment" when
    // sent by this service, so we can filter on that text via the message
    // column rather than needing a dedicated type column.
    const lastOverdueSms = await this.prisma.sMSLog.findFirst({
      where: {
        loanId: loan.id,
        message: { contains: OVERDUE_SMS_MARKER, mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    const lastSentAt = lastOverdueSms?.createdAt ?? null;

    // First-time overdue → always send immediately
    if (justBecameOverdue) {
      const sent = await this.sendOverdueSms(
        loan,
        amount,
        dueDate,
        installmentNumber,
      );
      return sent;
    }

    // Already overdue — enforce 7-day throttle
    if (lastSentAt) {
      const daysSinceLast =
        (now.getTime() - lastSentAt.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceLast < SMS_REMINDER_INTERVAL_DAYS) {
        this.logger.log(
          `Skipping SMS for ${loan.loanNumber} — last reminder ${Math.floor(
            daysSinceLast,
          )}d ago (interval ${SMS_REMINDER_INTERVAL_DAYS}d)`,
        );
        return false;
      }
    }

    // No prior SMS, or interval elapsed → send
    return this.sendOverdueSms(loan, amount, dueDate, installmentNumber);
  }

  // ---------------------------------------------------------------------------
  // Send SMS via the gateway (SmsService already logs to SMSLog)
  // ---------------------------------------------------------------------------
  private async sendOverdueSms(
    loan: any,
    amount: number,
    dueDate: string,
    installmentNumber: number,
  ): Promise<boolean> {
    try {
      const message =
        `Dear ${loan.customer.fullName}, your loan ${loan.loanNumber} ` +
        `has an overdue installment #${installmentNumber} of LKR ${amount.toLocaleString(
          "en-LK",
          { minimumFractionDigits: 2 },
        )} ` +
        `due on ${dueDate}. Please settle at your earliest. SMV Holdings.`;

      await this.sms.send({
        recipient: loan.customer.phone,
        message,
        loanId: loan.id,
        customerName: loan.customer.fullName,
        amount,
      });

      this.logger.log(`Overdue SMS sent to ${loan.customer.phone}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send overdue SMS for ${loan.loanNumber}: ${error}`,
      );
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Manual trigger (controller / CLI)
  // ---------------------------------------------------------------------------
  async runNow(): Promise<{
    marked: number;
    reverted: number;
    smsSent: number;
  }> {
    this.logger.log("Manual overdue check triggered");

    const today = todayISO();

    const activeLoans = await this.prisma.loan.findMany({
      where: { status: { in: ["Active", "Overdue"] } },
      include: {
        customer: true,
        installments: { orderBy: { installmentNumber: "asc" } },
      },
    });

    let marked = 0;
    let reverted = 0;
    let smsSent = 0;

    for (const loan of activeLoans) {
      const result = await this.processLoanOverdue(loan, today);
      if (result.status === "marked_overdue") marked++;
      else if (result.status === "reverted_active") reverted++;
      if (result.smsSent) smsSent++;
    }

    await this.eventBus.publish({
      type: "stats.changed",
      payload: { source: "overdue-manual", marked, reverted, smsSent },
    });

    this.logger.log(
      `Manual run complete. Marked: ${marked}, Reverted: ${reverted}, SMS sent: ${smsSent}`,
    );

    return { marked, reverted, smsSent };
  }
}
