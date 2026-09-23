import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { PaginatedResponseDto } from "../../common/dto/pagination-response.dto";
import { PaginationService } from "../../common/services/pagination.service";

@ApiTags("Users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly paginationService: PaginationService,
  ) {}

  @Get()
  @Roles("admin", "manager")
  @ApiOperation({
    summary: "List all users with pagination",
    description:
      "Requires role: `admin` or `manager`. Supports pagination, search, and filtering.",
  })
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "limit", required: false, type: Number, example: 10 })
  @ApiQuery({ name: "search", required: false, type: String, example: "admin" })
  @ApiQuery({
    name: "sortBy",
    required: false,
    type: String,
    example: "createdAt",
  })
  @ApiQuery({ name: "sortOrder", required: false, enum: ["asc", "desc"] })
  @ApiOkResponse({
    description: "Returns paginated list of users",
    type: PaginatedResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  @ApiForbiddenResponse({
    description: "Authenticated role is not permitted to list users.",
  })
  async list(@Query() query: PaginationDto) {
    const result = await this.usersService.findAll(query);
    return this.paginationService.createSuccessResponse(
      result.items,
      result.meta.totalItems,
      result.meta.page,
      result.meta.limit,
      "Users retrieved successfully",
    );
  }

  @Post()
  @Roles("admin", "manager")
  @ApiOperation({
    summary: "Create a new user account",
    description:
      "Requires role: `admin` or `manager`. Usernames are unique across the platform.",
  })
  @ApiCreatedResponse({
    description:
      "User created successfully; returns the created user without its password hash.",
  })
  @ApiBadRequestResponse({ description: "Request body failed validation." })
  @ApiConflictResponse({ description: "The chosen username is already taken." })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  @ApiForbiddenResponse({
    description: "Authenticated role is not permitted to create users.",
  })
  async create(@Body() body: CreateUserDto) {
    const user = await this.usersService.create(body);
    return {
      success: true,
      message: "User created successfully",
      data: user,
      timestamp: new Date().toISOString(),
    };
  }

  @Put(":id")
  @Roles("admin", "manager")
  @ApiParam({
    name: "id",
    description: "ID of the user to update",
    example: "usr_1234567890",
  })
  @ApiOperation({
    summary: "Update an existing user",
    description:
      "Partially updates the user identified by `id`. Requires role: `admin` or `manager`. " +
      "Only supplied fields are changed; promoting a second active admin is rejected by business rule.",
  })
  @ApiOkResponse({
    description: "User updated successfully.",
  })
  @ApiBadRequestResponse({
    description:
      "Request body failed validation or violates the single-active-admin rule.",
  })
  @ApiNotFoundResponse({ description: "No user exists with the given `id`." })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  @ApiForbiddenResponse({
    description: "Authenticated role is not permitted to update users.",
  })
  async update(@Param("id") id: string, @Body() body: UpdateUserDto) {
    const user = await this.usersService.update(id, body);
    return {
      success: true,
      message: "User updated successfully",
      data: user,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete(":id")
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: "id",
    description: "ID of the user to delete",
    example: "usr_1234567890",
  })
  @ApiOperation({
    summary: "Delete a user account",
    description:
      "Requires role: `admin`. Deleting the last active admin account is rejected.",
  })
  @ApiOkResponse({ description: "User deleted successfully (`data` is null)." })
  @ApiBadRequestResponse({
    description: "Attempted to delete the last active admin account.",
  })
  @ApiNotFoundResponse({ description: "No user exists with the given `id`." })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  @ApiForbiddenResponse({ description: "Only `admin` may delete users." })
  async remove(@Param("id") id: string) {
    await this.usersService.remove(id);
    return {
      success: true,
      message: "User deleted successfully",
      data: null,
      timestamp: new Date().toISOString(),
    };
  }

  @Post("reset-defaults")
  @Roles("admin")
  @ApiOperation({
    summary: "Reset the user store to the default baseline",
    description:
      "Requires role: `admin`. Wipes current accounts and re-seeds the shipped default users.",
  })
  @ApiCreatedResponse({
    description:
      "User store reset successfully; `data` lists the restored baseline users.",
  })
  @ApiBadRequestResponse({
    description: "A default admin conflicts with the single-active-admin rule.",
  })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  @ApiForbiddenResponse({
    description: "Only `admin` may reset the user store.",
  })
  async resetDefaults() {
    const users = await this.usersService.resetDefaults();
    return {
      success: true,
      message: "User store reset to default baseline successfully",
      data: users,
      timestamp: new Date().toISOString(),
    };
  }
}
