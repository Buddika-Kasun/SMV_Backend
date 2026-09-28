import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Subscription } from "rxjs";
import { PrismaService } from "../../config/prisma.service";
import { EventBusService, AppEvent } from "../event/event-bus.service";

const ALL_ROLES = ["admin", "manager", "staff"] as const;
const ADMINS_MANAGERS = ["admin", "manager"] as const;

@Injectable()
export class NotificationListenerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationListenerService.name);
  private sub?: Subscription;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  onModuleInit(): void {
    this.sub = this.eventBus.onEvent().subscribe((event) => {
      this.handleEvent(event).catch((err) => {
        this.logger.error(
          `Failed to handle event "${event.type}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    });

    this.logger.log("Notification listener subscribed to event bus");
  }

  onModuleDestroy(): void {
    this.sub?.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------------
  private async handleEvent(event: AppEvent): Promise<void> {
    this.logger.debug?.(
      `handleEvent: type=${event.type} action=${event.payload?.action ?? "-"}`,
    );

    switch (event.type) {
      case "loans.changed":
        await this.handleLoanEvent(event);
        break;
      case "users.changed":
        await this.handleUserEvent(event);
        break;
      default:
        break;
    }
  }

  private async handleLoanEvent(event: AppEvent): Promise<void> {
    const action = event.payload?.action as string | undefined;
    const loanId = event.payload?.loanId as string | undefined;
    if (!loanId) return;

    switch (action) {
      case "created":
        await this.onLoanCreated(loanId, event);
        break;
      case "approved":
        await this.onLoanApproved(loanId, event);
        break;
      case "rejected":
        await this.onLoanRejected(loanId, event);
        break;
      case "kyc_updated":
        await this.onKycUpdated(loanId, event);
        break;
      case "disbursed":
        await this.onLoanDisbursed(loanId, event);
        break;
      case "payment":
        await this.onPaymentRecorded(loanId, event);
        break;
      case "settled":
        await this.onLoanSettled(loanId, event);
        break;
      case "marked_overdue":
        await this.onLoanMarkedOverdue(loanId, event);
        break;
      default:
        break;
    }
  }

  private async handleUserEvent(event: AppEvent): Promise<void> {
    const action = event.payload?.action as string | undefined;
    const userId = event.payload?.userId as string | undefined;
    const actorId = event.payload?.actorId as string | undefined;

    this.logger.log(
      `handleUserEvent: action=${action} userId=${userId} actorId=${actorId} keys=[${Object.keys(event.payload ?? {}).join(",")}]`,
    );

    switch (action) {
      case "created":
        if (userId) await this.onUserCreated(userId, actorId, event.timestamp);
        else this.logger.warn("handleUserEvent: 'created' missing userId");
        break;
      case "updated":
        if (userId)
          await this.onUserUpdated(
            userId,
            actorId,
            (event.payload?.changes as string[]) ?? [],
            event.timestamp,
          );
        else this.logger.warn("handleUserEvent: 'updated' missing userId");
        break;
      case "deleted":
        if (userId)
          await this.onUserDeleted(
            userId,
            actorId,
            event.payload?.snapshot as
              | { fullName: string; username: string; role: string }
              | undefined,
            event.timestamp,
          );
        else this.logger.warn("handleUserEvent: 'deleted' missing userId");
        break;
      default:
        this.logger.debug?.(`handleUserEvent: unhandled action=${action}`);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Loan handlers
  // ---------------------------------------------------------------------------

  private async onLoanCreated(loanId: string, event: AppEvent) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        customer: { select: { fullName: true } },
        loanOfficer: { select: { id: true, fullName: true, role: true } },
      },
    });
    if (!loan) return;

    const officerId = loan.loanOfficer?.id ?? null;
    const officerName = loan.loanOfficer?.fullName ?? "Staff";
    const officerRole = loan.loanOfficer?.role ?? "staff";
    const amountFmt = Number(loan.requestedAmount).toLocaleString("en-LK", {
      minimumFractionDigits: 2,
    });

    const recipients = await this.collectRecipients(ADMINS_MANAGERS, [
      officerId,
    ]);

    const notifications = recipients.map((u) => {
      const isActor = u.id === officerId;
      return {
        userId: u.id,
        type: "loan.created",
        title: isActor ? "Loan Application Submitted" : "New Loan Application",
        body: isActor
          ? `You submitted loan application ${loan.loanNumber} for ${loan.customer.fullName} (LKR ${amountFmt}). Waiting for manager approval.`
          : `${officerName} (${officerRole}) submitted loan application ${loan.loanNumber} for ${loan.customer.fullName} (LKR ${amountFmt}). Waiting for manager approval.`,
        data: { loanId },
        dedupeKey: `loan.created:${loanId}:${u.id}`,
      };
    });

    await this.createManySafely(notifications);
    await this.publishTargeted(notifications);
  }

  private async onLoanApproved(loanId: string, event: AppEvent) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        customer: { select: { fullName: true } },
        approvedBy: { select: { id: true, fullName: true, role: true } },
      },
    });
    if (!loan) return;

    const actorId = loan.approvedBy?.id ?? null;
    const actorName = loan.approvedBy?.fullName ?? "Manager";
    const actorRole = loan.approvedBy?.role ?? "manager";
    const amountFmt = Number(loan.requestedAmount).toLocaleString("en-LK", {
      minimumFractionDigits: 2,
    });

    const recipients = await this.collectRecipients(ALL_ROLES);

    const notifications = recipients.map((u) => {
      const isActor = u.id === actorId;
      return {
        userId: u.id,
        type: "loan.approved",
        title: `${loan.loanNumber} Loan Approved`,
        body: isActor
          ? `You approved loan ${loan.loanNumber} for ${loan.customer.fullName} (LKR ${amountFmt}). KYC step is next.`
          : `${actorName} (${actorRole}) approved loan ${loan.loanNumber} for ${loan.customer.fullName} (LKR ${amountFmt}). KYC step is next.`,
        data: { loanId },
        dedupeKey: `loan.approved:${loanId}:${u.id}`,
      };
    });

    await this.createManySafely(notifications);
    await this.publishTargeted(notifications);
  }

  private async onLoanRejected(loanId: string, event: AppEvent) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        customer: { select: { fullName: true } },
        approvedBy: { select: { id: true, fullName: true, role: true } },
      },
    });
    if (!loan) return;

    const actorId = loan.approvedBy?.id ?? null;
    const actorName = loan.approvedBy?.fullName ?? "Manager";
    const actorRole = loan.approvedBy?.role ?? "manager";
    const reason = loan.rejectReason ?? "—";

    const recipients = await this.collectRecipients(ALL_ROLES);

    const notifications = recipients.map((u) => {
      const isActor = u.id === actorId;
      return {
        userId: u.id,
        type: "loan.rejected",
        title: `${loan.loanNumber} Loan Rejected`,
        body: isActor
          ? `You rejected loan ${loan.loanNumber} of ${loan.customer.fullName}. Reason: ${reason}.`
          : `${actorName} (${actorRole}) rejected loan ${loan.loanNumber} of ${loan.customer.fullName}. Reason: ${reason}.`,
        data: { loanId },
        dedupeKey: `loan.rejected:${loanId}:${u.id}`,
      };
    });

    await this.createManySafely(notifications);
    await this.publishTargeted(notifications);
  }

  private async onKycUpdated(loanId: string, event: AppEvent) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        customer: { select: { fullName: true } },
        loanOfficer: { select: { id: true, fullName: true, role: true } },
      },
    });
    if (!loan) return;

    const actorId = loan.loanOfficer?.id ?? null;
    const actorName = loan.loanOfficer?.fullName ?? "Staff";
    const actorRole = loan.loanOfficer?.role ?? "staff";

    const recipients = await this.collectRecipients(ALL_ROLES);

    const notifications = recipients.map((u) => {
      const isActor = u.id === actorId;
      return {
        userId: u.id,
        type: "kyc.completed",
        title: `${loan.loanNumber} KYC Updated`,
        body: isActor
          ? `You updated KYC data for loan ${loan.loanNumber} (${loan.customer.fullName}).`
          : `${actorName} (${actorRole}) updated KYC data for loan ${loan.loanNumber} (${loan.customer.fullName}).`,
        data: { loanId },
        dedupeKey: `kyc.updated:${loanId}:${u.id}`,
      };
    });

    await this.createManySafely(notifications);
    await this.publishTargeted(notifications);
  }

  private async onLoanDisbursed(loanId: string, event: AppEvent) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        customer: { select: { fullName: true } },
        disbursedBy: { select: { id: true, fullName: true, role: true } },
      },
    });
    if (!loan) return;

    const actorId = loan.disbursedBy?.id ?? null;
    const actorName = loan.disbursedBy?.fullName ?? "Staff";
    const actorRole = loan.disbursedBy?.role ?? "staff";
    const amountFmt = Number(loan.disbursedAmount).toLocaleString("en-LK", {
      minimumFractionDigits: 2,
    });

    const recipients = await this.collectRecipients(ALL_ROLES);

    const notifications = recipients.map((u) => {
      const isActor = u.id === actorId;
      return {
        userId: u.id,
        type: "loan.disbursed",
        title: `${loan.loanNumber} Loan Disbursed`,
        body: isActor
          ? `You disbursed loan ${loan.loanNumber} for ${loan.customer.fullName}. Net credited: LKR ${amountFmt}.`
          : `${actorName} (${actorRole}) disbursed loan ${loan.loanNumber} for ${loan.customer.fullName}. Net credited: LKR ${amountFmt}.`,
        data: { loanId },
        dedupeKey: `loan.disbursed:${loanId}:${u.id}`,
      };
    });

    await this.createManySafely(notifications);
    await this.publishTargeted(notifications);
  }

  private async onPaymentRecorded(loanId: string, event: AppEvent) {
    const paymentId = event.payload?.paymentId as string | undefined;
    if (!paymentId) return;

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        loan: { include: { customer: { select: { fullName: true } } } },
        receivedBy: { select: { id: true, fullName: true, role: true } },
      },
    });
    if (!payment) return;

    const actorId = payment.receivedBy?.id ?? null;
    const actorName = payment.receivedBy?.fullName ?? "Staff";
    const actorRole = payment.receivedBy?.role ?? "staff";
    const amountFmt = Number(payment.amount).toLocaleString("en-LK", {
      minimumFractionDigits: 2,
    });
    const loan = payment.loan;

    const recipients = await this.collectRecipients(ALL_ROLES);

    const notifications = recipients.map((u) => {
      const isActor = u.id === actorId;
      return {
        userId: u.id,
        type: "payment.received",
        title: `${loan.loanNumber} Payment Received`,
        body: isActor
          ? `You recorded LKR ${amountFmt} for loan ${loan.loanNumber} (${loan.customer.fullName}).`
          : `${actorName} (${actorRole}) recorded LKR ${amountFmt} for loan ${loan.loanNumber} (${loan.customer.fullName}).`,
        data: { loanId, paymentId },
        dedupeKey: `payment.received:${paymentId}:${u.id}`,
      };
    });

    await this.createManySafely(notifications);
    await this.publishTargeted(notifications);
  }

  private async onLoanSettled(loanId: string, event: AppEvent) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: { customer: { select: { fullName: true } } },
    });
    if (!loan) return;

    const recipients = await this.collectRecipients(ALL_ROLES);
    const isEarly = loan.status === "Early_Settled";

    const notifications = recipients.map((u) => ({
      userId: u.id,
      type: "loan.settled",
      title: isEarly
        ? `${loan.loanNumber} Loan Early Settled`
        : `${loan.loanNumber} Loan Fully Settled`,
      body: `Loan ${loan.loanNumber} for ${loan.customer.fullName} has been ${
        isEarly ? "early-settled" : "fully settled"
      }.`,
      data: { loanId },
      dedupeKey: `loan.settled:${loanId}:${u.id}`,
    }));

    await this.createManySafely(notifications);
    await this.publishTargeted(notifications);
  }

  private async onLoanMarkedOverdue(loanId: string, event: AppEvent) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        customer: { select: { fullName: true } },
        loanOfficer: { select: { id: true } },
      },
    });
    if (!loan) return;

    const overdueAmount = Number(event.payload?.overdueAmount ?? 0);
    const overdueCount = Number(event.payload?.overdueCount ?? 0);
    const amountFmt = overdueAmount.toLocaleString("en-LK", {
      minimumFractionDigits: 2,
    });

    const recipients = await this.collectRecipients(ADMINS_MANAGERS, [
      loan.loanOfficer?.id,
    ]);

    const notifications = recipients.map((u) => ({
      userId: u.id,
      type: "loan.overdue",
      title: `⚠ Overdue: ${loan.loanNumber}`,
      body: `Loan ${loan.loanNumber} for ${loan.customer.fullName} is now overdue. ${overdueCount} installment(s), LKR ${amountFmt}.`,
      data: { loanId, overdueAmount, overdueCount },
      dedupeKey: `loan.overdue:${loanId}:${new Date().toISOString().slice(0, 10)}:${u.id}`,
    }));

    await this.createManySafely(notifications);
    await this.publishTargeted(notifications);
  }

  // ---------------------------------------------------------------------------
  // User handlers
  // ---------------------------------------------------------------------------

  private async onUserCreated(
    userId: string,
    actorId: string | undefined,
    nonce: string,
  ) {
    this.logger.log(
      `onUserCreated: userId=${userId} actorId=${actorId} nonce=${nonce}`,
    );

    const created = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, username: true, role: true },
    });

    if (!created) {
      this.logger.warn(
        `onUserCreated: user ${userId} not found — skipping notification`,
      );
      return;
    }

    const actorName = await this.resolveActorName(actorId);
    const recipients = await this.collectRecipients(ADMINS_MANAGERS);

    this.logger.log(
      `onUserCreated: recipients=[${recipients.map((u) => u.id).join(",")}]`,
    );

    const notifications = recipients
      .filter((u) => u.id !== userId)
      .map((u) => {
        const isActor = u.id === actorId;
        return {
          userId: u.id,
          type: "user.created",
          title: "New User Account Created",
          body: isActor
            ? `You created a new user: ${created.fullName} (${created.role}).`
            : `${actorName} created a new user: ${created.fullName} (${created.role}).`,
          data: { userId: created.id },
          // nonce distinguishes separate create events for the same userId
          // (possible when the ID generator reuses IDs after deletion)
          dedupeKey: `user.created:${userId}:${nonce}:${u.id}`,
        };
      });

    await this.createManySafely(notifications);
    await this.publishTargeted(notifications);
  }

  private async onUserUpdated(
    userId: string,
    actorId: string | undefined,
    changes: string[],
    nonce: string,
  ) {
    this.logger.log(
      `onUserUpdated: userId=${userId} actorId=${actorId} changes=[${changes.join(",")}] nonce=${nonce}`,
    );

    const updated = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, username: true, role: true },
    });

    if (!updated) {
      this.logger.warn(
        `onUserUpdated: user ${userId} not found — skipping notification`,
      );
      return;
    }

    const actorName = await this.resolveActorName(actorId);
    const changeSummary =
      changes.length > 0 ? changes.join(", ") : "no field changes";

    const recipients = await this.collectRecipients(ADMINS_MANAGERS);

    const notifications = recipients.map((u) => {
      const isActor = u.id === actorId;
      const isTarget = u.id === userId;

      if (isTarget && !isActor) {
        return {
          userId: u.id,
          type: "user.updated",
          title: "Your Account Was Updated",
          body: `${actorName} updated your account (${changeSummary}).`,
          data: { userId: updated.id, changes },
          dedupeKey: `user.updated:${userId}:${nonce}:${u.id}`,
        };
      }

      return {
        userId: u.id,
        type: "user.updated",
        title: "User Account Updated",
        body: isActor
          ? `You updated ${updated.fullName} (${updated.role}): ${changeSummary}.`
          : `${actorName} updated ${updated.fullName} (${updated.role}): ${changeSummary}.`,
        data: { userId: updated.id, changes },
        dedupeKey: `user.updated:${userId}:${nonce}:${u.id}`,
      };
    });

    await this.createManySafely(notifications);
    await this.publishTargeted(notifications);
  }

  private async onUserDeleted(
    userId: string,
    actorId: string | undefined,
    snapshot: { fullName: string; username: string; role: string } | undefined,
    nonce: string,
  ) {
    this.logger.log(
      `onUserDeleted: userId=${userId} actorId=${actorId} nonce=${nonce}`,
    );

    const displayName = snapshot?.fullName ?? "Unknown user";
    const displayRole = snapshot?.role ?? "—";

    const actorName = await this.resolveActorName(actorId);
    const recipients = await this.collectRecipients(ADMINS_MANAGERS);

    const notifications = recipients
      .filter((u) => u.id !== userId)
      .map((u) => {
        const isActor = u.id === actorId;
        return {
          userId: u.id,
          type: "user.deleted",
          title: "User Account Deleted",
          body: isActor
            ? `You deleted user ${displayName} (${displayRole}).`
            : `${actorName} deleted user ${displayName} (${displayRole}).`,
          data: { userId },
          dedupeKey: `user.deleted:${userId}:${nonce}:${u.id}`,
        };
      });

    await this.createManySafely(notifications);
    await this.publishTargeted(notifications);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async resolveActorName(actorId?: string): Promise<string> {
    if (!actorId) return "System";

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { fullName: true, role: true },
    });

    return actor ? `${actor.fullName} (${actor.role})` : "System";
  }

  private async collectRecipients(
    roles: readonly string[],
    extraUserIds: Array<string | null | undefined> = [],
  ): Promise<Array<{ id: string; fullName: string }>> {
    const byRole = await this.prisma.user.findMany({
      where: { role: { in: [...roles] }, isActive: true },
      select: { id: true, fullName: true },
    });

    const extras = (
      await Promise.all(
        extraUserIds
          .filter((id): id is string => !!id)
          .map((id) =>
            this.prisma.user.findUnique({
              where: { id },
              select: { id: true, fullName: true, isActive: true },
            }),
          ),
      )
    ).filter(
      (u): u is { id: string; fullName: string; isActive: boolean } =>
        !!u && u.isActive,
    );

    const map = new Map<string, { id: string; fullName: string }>();
    byRole.forEach((u) => map.set(u.id, { id: u.id, fullName: u.fullName }));
    extras.forEach((u) => map.set(u.id, { id: u.id, fullName: u.fullName }));

    return Array.from(map.values());
  }

  private async createManySafely(
    notifications: Array<{
      userId: string;
      type: string;
      title: string;
      body: string;
      data?: any;
      dedupeKey: string;
    }>,
  ): Promise<void> {
    if (notifications.length === 0) {
      this.logger.warn("createManySafely: no notifications to create");
      return;
    }

    this.logger.log(
      `createManySafely: creating ${notifications.length} notification(s)`,
    );

    await Promise.all(
      notifications.map(async (n) => {
        try {
          await this.prisma.notification.create({
            data: {
              userId: n.userId,
              type: n.type,
              title: n.title,
              body: n.body,
              data: n.data ?? undefined,
              dedupeKey: n.dedupeKey,
            },
          });
        } catch (err: any) {
          if (err?.code === "P2002") {
            this.logger.debug?.(`duplicate skipped: ${n.dedupeKey}`);
            return;
          }
          this.logger.error(
            `Failed to create notification for ${n.userId}: ${err.message}`,
          );
          throw err;
        }
      }),
    );
  }

  private async publishTargeted(
    notifications: Array<{
      userId: string;
      title: string;
      body: string;
      data?: any;
    }>,
  ): Promise<void> {
    await Promise.all(
      notifications.map((n) =>
        this.eventBus.publish({
          type: "notification.created",
          userId: n.userId,
          payload: {
            title: n.title,
            body: n.body,
            data: n.data ?? null,
          },
        }),
      ),
    );
  }
}
