import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
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
import { SendPhoneOtpDto, VerifyPhoneOtpDto } from "./dto/verify-phone.dto";

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

  @Post("verify-phone/send")
  @HttpCode(200)
  @ApiOperation({
    summary: "Send a phone verification OTP",
    description:
      "Sends a 4-digit OTP via SMS. Enforces a 60-second cooldown between requests.",
  })
  @ApiOkResponse({
    description: "Returns `{ requestId }` — the id of the created OTP record.",
  })
  @ApiBadRequestResponse({
    description: "Invalid phone number or resend cooldown active.",
  })
  async sendPhoneOtp(@Body() body: SendPhoneOtpDto) {
    return ok(
      await this.customersService.sendPhoneOtp(body),
      "Verification code sent",
    );
  }

  @Post("verify-phone/confirm")
  @HttpCode(200)
  @ApiOperation({
    summary: "Confirm a phone verification OTP",
    description:
      "Verifies the 4-digit code sent to the phone. Consumes the OTP on success.",
  })
  @ApiOkResponse({
    description: "Returns `{ verified: true }` on success.",
  })
  @ApiBadRequestResponse({
    description: "Invalid, expired, or too many failed attempts.",
  })
  async verifyPhoneOtp(@Body() body: VerifyPhoneOtpDto) {
    return ok(
      await this.customersService.verifyPhoneOtp(body),
      "Phone verified",
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
