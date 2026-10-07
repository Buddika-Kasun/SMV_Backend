import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ok } from "../../common/response";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AuthedUser } from "../../common/guards/auth.types";
import { NotificationsService } from "./notifications.service";
import { PaginationService } from "../../common/services/pagination.service";
import { PaginationDto } from "../../common/dto/pagination.dto";

@ApiTags("Notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly paginationService: PaginationService,
  ) {}

  @Get()
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "limit", required: false, type: Number, example: 20 })
  @ApiQuery({ name: "search", required: false, type: String, example: "loan" })
  @ApiQuery({
    name: "read",
    required: false,
    enum: ["true", "false"],
    description: "Filter by read state. Omit for all.",
  })
  @ApiQuery({
    name: "type",
    required: false,
    type: String,
    example: "loan.approved",
    description: "Filter by notification type (exact match).",
  })
  @ApiQuery({
    name: "sortBy",
    required: false,
    type: String,
    example: "createdAt",
  })
  @ApiQuery({ name: "sortOrder", required: false, enum: ["asc", "desc"] })
  @ApiOperation({ summary: "List notifications for the current user" })
  @ApiOkResponse({
    description: "Returns paginated notifications, newest first.",
  })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async list(
    @CurrentUser() user: AuthedUser,
    @Query() query: PaginationDto,
    @Query("read") read?: string,
    @Query("type") type?: string,
  ) {
    const result = await this.notifications.listForUser(user.sub, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      read: read === "true" ? true : read === "false" ? false : undefined,
      type,
    });

    return this.paginationService.createSuccessResponse(
      result.items,
      result.meta.totalItems,
      result.meta.page,
      result.meta.limit,
      "Notifications retrieved",
    );
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Get the unread notification count" })
  @ApiOkResponse({ description: "Returns `{ count }`." })
  async unreadCount(@CurrentUser() user: AuthedUser) {
    const count = await this.notifications.unreadCount(user.sub);
    return ok({ count }, "Unread count retrieved");
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Mark one notification as read" })
  async markRead(@CurrentUser() user: AuthedUser, @Param("id") id: string) {
    await this.notifications.markAsRead(user.sub, id);
    return ok(null, "Notification marked as read");
  }

  @Patch("read-all")
  @ApiOperation({ summary: "Mark all notifications as read" })
  async markAllRead(@CurrentUser() user: AuthedUser) {
    const result = await this.notifications.markAllAsRead(user.sub);
    return ok(result, `${result.count} notification(s) marked as read`);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete one notification" })
  async deleteOne(@CurrentUser() user: AuthedUser, @Param("id") id: string) {
    await this.notifications.deleteOne(user.sub, id);
    return ok(null, "Notification deleted");
  }

  @Delete()
  @ApiOperation({ summary: "Clear all notifications" })
  async clearAll(@CurrentUser() user: AuthedUser) {
    const result = await this.notifications.clearAll(user.sub);
    return ok(result, `${result.count} notification(s) cleared`);
  }
}
