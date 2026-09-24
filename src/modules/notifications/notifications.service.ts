import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../config/prisma.service";
import {
  PaginatedResult,
  PaginationService,
} from "../../common/services/pagination.service";
import { EventBusService } from "../event/event-bus.service";

export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: any;
  read: boolean;
  readAt?: string;
  createdAt: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
    private readonly eventBus: EventBusService,
  ) {}

  // ---------------------------------------------------------------------------
  // Read APIs — scoped to the current user
  // ---------------------------------------------------------------------------
  async listForUser(
    userId: string,
    opts: {
      page?: number;
      limit?: number;
      search?: string;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
      read?: boolean;
      type?: string;
    } = {},
  ): Promise<PaginatedResult<NotificationRecord>> {
    const where: any = { userId };

    if (opts.read !== undefined) {
      where.read = opts.read;
    }

    if (opts.type) {
      where.type = opts.type;
    }

    if (opts.search) {
      where.OR = [
        { title: { contains: opts.search, mode: "insensitive" } },
        { body: { contains: opts.search, mode: "insensitive" } },
      ];
    }

    const options = this.paginationService.getPaginationOptions(
      {
        page: opts.page,
        limit: opts.limit,
        sortBy: opts.sortBy,
        sortOrder: opts.sortOrder,
      } as any,
      "createdAt",
      "desc",
    );

    const total = await this.prisma.notification.count({ where });

    // Unread first, then the requested sort (default: createdAt desc)
    const orderBy: any[] = [{ read: "asc" }];
    if (options.sortBy !== "read") {
      orderBy.push({ [options.sortBy]: options.sortOrder });
    }

    const rows = await this.prisma.notification.findMany({
      where,
      orderBy,
      skip: options.skip,
      take: options.limit,
    });

    const items = rows.map((n) => this.toRecord(n));

    return this.paginationService.createPaginatedResponse(
      items,
      total,
      options.page,
      options.limit,
    );
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  // ---------------------------------------------------------------------------
  // Mutations — each one publishes `notifications.changed` so every
  // connected client updates its badge without polling.
  // ---------------------------------------------------------------------------
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, read: false },
      data: { read: true, readAt: new Date() },
    });

    if (result.count === 0) {
      // Either it doesn't exist or it was already read.
      // Only throw for the former — the latter is a no-op.
      const exists = await this.prisma.notification.findFirst({
        where: { id: notificationId, userId },
        select: { id: true },
      });

      if (!exists) {
        throw new NotFoundException("Notification not found");
      }
      return;
    }

    await this.emitChanged(userId);
  }

  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });

    if (result.count > 0) {
      await this.emitChanged(userId);
    }

    return { count: result.count };
  }

  async deleteOne(userId: string, notificationId: string): Promise<void> {
    const result = await this.prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });

    if (result.count === 0) {
      throw new NotFoundException("Notification not found");
    }

    await this.emitChanged(userId);
  }

  async clearAll(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.deleteMany({
      where: { userId },
    });

    if (result.count > 0) {
      await this.emitChanged(userId);
    }

    return { count: result.count };
  }

  // ---------------------------------------------------------------------------
  // Used by the listener — no user scoping (system-level writes)
  // ---------------------------------------------------------------------------
  /**
   * Insert one notification. Silently no-ops on dedupeKey collision
   * (another instance already created it).
   *
   * Returns the created row, or null if it was a duplicate.
   */
  async createIdempotent(input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    data?: any;
    dedupeKey: string;
  }): Promise<NotificationRecord | null> {
    try {
      const created = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          data: input.data ?? undefined,
          dedupeKey: input.dedupeKey,
        },
      });
      return this.toRecord(created);
    } catch (err: any) {
      // P2002 = unique constraint violation on dedupeKey
      if (err?.code === "P2002") return null;
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Publish a changed event with the fresh unread count so the frontend
   * can update its badge without an extra fetch.
   *
   * Never throws — a Redis hiccup shouldn't fail the HTTP response.
   */
  private async emitChanged(userId: string): Promise<void> {
    try {
      const unreadCount = await this.prisma.notification.count({
        where: { userId, read: false },
      });

      await this.eventBus.publish({
        type: "notifications.changed",
        userId,
        payload: { unreadCount },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to publish notifications.changed for ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private toRecord(n: any): NotificationRecord {
    return {
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data ?? null,
      read: n.read,
      readAt: n.readAt ? n.readAt.toISOString() : undefined,
      createdAt: n.createdAt.toISOString(),
    };
  }
}
