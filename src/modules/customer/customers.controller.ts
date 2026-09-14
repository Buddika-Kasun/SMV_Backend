import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ok } from "../../common/response";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { PaginationService } from "../../common/services/pagination.service";
import { CustomersService } from "./customers.service";

@ApiTags("Customers")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("customers")
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly paginationService: PaginationService,
  ) {}

  @Get()
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "limit", required: false, type: Number, example: 10 })
  @ApiQuery({
    name: "search",
    required: false,
    type: String,
    example: "Silva",
  })
  @ApiQuery({
    name: "kycStatus",
    required: false,
    enum: ["All", "Verified", "Pending"],
  })
  @ApiQuery({
    name: "sortBy",
    required: false,
    type: String,
    example: "createdAt",
  })
  @ApiQuery({ name: "sortOrder", required: false, enum: ["asc", "desc"] })
  @ApiOperation({
    summary: "List customers with pagination",
    description:
      "Optionally filtered by KYC status and/or free-text search term.",
  })
  @ApiOkResponse({ description: "Returns paginated list of customers" })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async list(@Query() query: PaginationDto & { kycStatus?: string }) {
    const result = await this.customersService.list(query);
    return this.paginationService.createSuccessResponse(
      result.items,
      result.meta.totalItems,
      result.meta.page,
      result.meta.limit,
      "Customers retrieved successfully",
    );
  }

  @Get("stats")
  @ApiOperation({
    summary: "Get KYC verification counts",
    description: "Returns total, verified, and pending customer counts.",
  })
  @ApiOkResponse({
    description: "Returns `{ total, verified, pending }`.",
  })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async getStats() {
    return ok(
      await this.customersService.getStats(),
      "Customer stats retrieved",
    );
  }
  
  @Get("lookup")
  @ApiQuery({
    name: "idNumber",
    required: true,
    type: String,
    description: "Full or partial NIC / ID number to search for",
  })
  @ApiOperation({
    summary: "Lookup customers by ID number (for autofill suggestions)",
  })
  @ApiOkResponse({
    description:
      "Returns up to 10 matching customers: `{ id, fullName, idNumber, phone }`.",
  })
  async lookup(@Query("idNumber") idNumber: string) {
    return ok(
      await this.customersService.lookupByIdNumber(idNumber),
      "Customers found",
    );
  }

  @Get(":id")
  @ApiParam({ name: "id", description: "ID of the customer" })
  @ApiOperation({ summary: "Fetch a single customer by ID" })
  @ApiOkResponse({
    description: "Customer retrieved successfully (includes loans).",
  })
  @ApiNotFoundResponse({
    description: "No customer exists with the given `id`.",
  })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async getOne(@Param("id") id: string) {
    return ok(await this.customersService.getOne(id), "Customer retrieved");
  }
}
