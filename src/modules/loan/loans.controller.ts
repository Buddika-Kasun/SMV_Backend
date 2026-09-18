import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { ok } from "../../common/response";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { AuthedUser } from "../../common/guards/auth.types";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { PaginationService } from "../../common/services/pagination.service";
import { LoansService } from "./loans.service";
import { CreateLoanDto } from "./dto/create-loan.dto";
import {
  RecordPaymentDto,
  ExecuteSettlementDto,
} from "./dto/payment-settlement.dto";
import {
  ApproveLoanDto,
  RejectLoanDto,
  DisburseLoanDto,
  UpdateKYCDto,
} from "./dto/loan-transition.dto";
import { PresignDocumentDto, AttachDocumentDto } from "./dto/loan-document.dto";
import { KYCPayload } from "../../shared/types";
import { OverdueService } from "./overdue.service";

/**
 * Loan lifecycle endpoints. All routes require a valid JWT; disbursement,
 * early settlement and deletion additionally require the `admin` or
 * `manager` role (enforced by {@link RolesGuard}).
 */
@ApiTags("Loans")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("loans")
export class LoansController {
  constructor(
    private readonly loansService: LoansService,
    private readonly overdueService: OverdueService,
    private readonly paginationService: PaginationService,
  ) {}

  // ------------
  @Post("admin/run-overdue-check")
  @Roles("admin", "manager")
  @ApiOperation({
    summary: "Manually trigger overdue detection and SMS dispatch",
  })
  async runOverdueCheck() {
    return ok(await this.overdueService.runNow(), "Overdue check completed");
  }

  // ---------------------------------------------------------------------------
  // List (paginated)
  // ---------------------------------------------------------------------------
  @Get()
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "limit", required: false, type: Number, example: 10 })
  @ApiQuery({ name: "search", required: false, type: String, example: "Silva" })
  @ApiQuery({
    name: "status",
    required: false,
    enum: [
      "Pending_Approval",
      "KYC_Pending",
      "Approved_Pending_Disbursement",
      "Active",
      "Overdue",
      "Settled",
      "Early_Settled",
      "Rejected",
    ],
  })
  @ApiQuery({
    name: "sortBy",
    required: false,
    type: String,
    example: "createdAt",
  })
  @ApiQuery({ name: "sortOrder", required: false, enum: ["asc", "desc"] })
  @ApiOperation({
    summary: "List loans with pagination",
    description: "Optionally filtered by status and/or free-text search term.",
  })
  @ApiOkResponse({ description: "Returns paginated list of loans" })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async list(@Query() query: PaginationDto) {
    const result = await this.loansService.list(query);
    return this.paginationService.createSuccessResponse(
      result.items,
      result.meta.totalItems,
      result.meta.page,
      result.meta.limit,
      "Loans retrieved successfully",
    );
  }

  @Get("payment")
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "limit", required: false, type: Number, example: 10 })
  @ApiQuery({ name: "search", required: false, type: String, example: "Silva" })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["Active", "Overdue", "Settled", "Early_Settled"],
    description:
      "Optional loan-status filter. Pre-disbursement statuses are excluded by default.",
  })
  @ApiQuery({
    name: "sortBy",
    required: false,
    type: String,
    example: "createdAt",
  })
  @ApiQuery({ name: "sortOrder", required: false, enum: ["asc", "desc"] })
  @ApiOperation({
    summary: "List loans that accept payments",
    description:
      "Only returns disbursed loans (Active / Overdue / Settled / Early_Settled). Pre-disbursement and rejected loans are excluded.",
  })
  @ApiOkResponse({ description: "Returns paginated list of payable loans" })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async listPayment(@Query() query: PaginationDto) {
    const result = await this.loansService.listPayment(query);
    return this.paginationService.createSuccessResponse(
      result.items,
      result.meta.totalItems,
      result.meta.page,
      result.meta.limit,
      "Payment-eligible loans retrieved successfully",
    );
  }

  // ---------------------------------------------------------------------------
  // List by status (comma-separated, no pagination)
  // NOTE: must be declared BEFORE @Get(":id") so "list" isn't captured as an id
  // ---------------------------------------------------------------------------
  @Get("list/:status")
  @ApiParam({
    name: "status",
    required: false,
    description:
      "Status of the loan. Comma-separated for multiple, e.g. `KYC_Pending,Active`.",
    enum: [
      "Pending_Approval",
      "KYC_Pending",
      "Approved_Pending_Disbursement",
      "Active",
      "Overdue",
      "Settled",
      "Early_Settled",
      "Rejected",
    ],
  })
  @ApiOperation({ summary: "Fetch loans list by Status" })
  @ApiOkResponse({
    description: "Loan retrieved successfully (includes only list items).",
  })
  @ApiNotFoundResponse({
    description: "No loan exists with the given `status`.",
  })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async getListByStatus(@Param("status") status: string) {
    const statuses = status
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return ok(
      await this.loansService.getListByStatus(statuses),
      "Loan list retrieved",
    );
  }

  // ---------------------------------------------------------------------------
  // State counts
  // ---------------------------------------------------------------------------
  @Get("state-counts")
  @ApiOperation({
    summary: "Get loan counts grouped by status",
    description:
      "Returns a breakdown of loan counts by status plus a total. Useful for nav badges and dashboard widgets.",
  })
  @ApiOkResponse({
    description:
      "`data` contains `{ total, Pending_Approval, KYC_Pending, ... }`.",
  })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async getStateCounts() {
    return ok(
      await this.loansService.getStateCounts(),
      "Loan state counts retrieved",
    );
  }

  // ---------------------------------------------------------------------------
  // Get single loan
  // ---------------------------------------------------------------------------
  @Get(":id")
  @ApiParam({ name: "id", description: "ID of the loan" })
  @ApiOperation({ summary: "Fetch a single loan by ID" })
  @ApiOkResponse({
    description:
      "Loan retrieved successfully (includes computed schedule/totals).",
  })
  @ApiNotFoundResponse({ description: "No loan exists with the given `id`." })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async getOne(@Param("id") id: string) {
    return ok(await this.loansService.getOne(id), "Loan retrieved");
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------
  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: "Submit a new loan application",
    description:
      "Creates customer, loan, and generates repayment schedule in `Pending Approval` status.",
  })
  @ApiCreatedResponse({
    description:
      "Loan application created; `data` holds the full loan aggregate.",
  })
  @ApiBadRequestResponse({ description: "Request body failed validation." })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async create(@Body() body: CreateLoanDto, @CurrentUser() auth: AuthedUser) {
    const loan = await this.loansService.create(body, auth);
    return {
      success: true,
      message: "Loan application created",
      data: loan,
      timestamp: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Approve / Reject
  // ---------------------------------------------------------------------------
  @Post(":id/approve")
  @ApiParam({
    name: "id",
    description: "ID of the loan application to approve",
  })
  @ApiOperation({
    summary: "Approve a pending loan application",
    description:
      "Transitions the loan from `Pending_Approval` to `KYC_Pending`.",
  })
  @ApiCreatedResponse({
    description: "Loan approved; KYC data must be completed next.",
  })
  @ApiBadRequestResponse({
    description:
      "Loan is not in `Pending_Approval` status, or validation failed.",
  })
  @ApiNotFoundResponse({ description: "No loan exists with the given `id`." })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async approve(
    @Param("id") id: string,
    @Body() body: ApproveLoanDto,
    @CurrentUser() auth: AuthedUser,
  ) {
    return ok(
      await this.loansService.approve(id, body.notes, auth),
      "Loan approved - KYC required",
    );
  }

  @Post(":id/reject")
  @ApiParam({ name: "id", description: "ID of the loan application to reject" })
  @ApiOperation({
    summary: "Reject a loan application",
    description:
      "Transitions a pre-disbursement loan to `Rejected` with a recorded reason.",
  })
  @ApiCreatedResponse({
    description: "Loan application rejected; `data` holds the updated loan.",
  })
  @ApiBadRequestResponse({
    description:
      "Loan cannot be rejected at its current stage, or validation failed.",
  })
  @ApiNotFoundResponse({ description: "No loan exists with the given `id`." })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async reject(@Param("id") id: string, @Body() body: RejectLoanDto) {
    return ok(
      await this.loansService.reject(id, body.reason),
      "Loan application rejected",
    );
  }

  // ---------------------------------------------------------------------------
  // KYC
  // ---------------------------------------------------------------------------
  @Put(":id/kyc")
  @ApiParam({
    name: "id",
    description: "ID of the loan whose KYC is being updated",
  })
  @ApiOperation({
    summary: "Update loan KYC data",
    description:
      "Updates customer and loan KYC fields. Set `verified: true` to move loan to `Approved_Pending_Disbursement`.",
  })
  @ApiOkResponse({
    description:
      "`data` holds the updated loan. Message indicates whether KYC is verified or just updated.",
  })
  @ApiBadRequestResponse({
    description: "Rejected loans cannot be edited, or validation failed.",
  })
  @ApiNotFoundResponse({ description: "No loan exists with the given `id`." })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async updateKYC(
    @Param("id") id: string,
    @Body() body: KYCPayload,
    @CurrentUser() auth: AuthedUser,
  ) {
    const loan = await this.loansService.updateKYC(id, body, auth);
    return ok(
      loan,
      loan.status === "Approved_Pending_Disbursement"
        ? "KYC verified - loan ready for disbursement"
        : "KYC data updated",
    );
  }

  // ---------------------------------------------------------------------------
  // Disburse
  // ---------------------------------------------------------------------------
  @Post(":id/disburse")
  @Roles("admin", "manager")
  @ApiParam({ name: "id", description: "ID of the approved loan to disburse" })
  @ApiOperation({
    summary: "Disburse an approved loan",
    description:
      "Transitions loan from `Approved_Pending_Disbursement` to `Active`, starting repayment schedule.",
  })
  @ApiCreatedResponse({
    description: "Loan disbursed; `data` holds the now-active loan.",
  })
  @ApiBadRequestResponse({
    description: "Loan is not in `Approved_Pending_Disbursement` status.",
  })
  @ApiNotFoundResponse({ description: "No loan exists with the given `id`." })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  @ApiForbiddenResponse({
    description: "Authenticated role is not permitted to disburse loans.",
  })
  async disburse(
    @Param("id") id: string,
    @Body() body: DisburseLoanDto,
    @CurrentUser() auth: AuthedUser,
  ) {
    return ok(
      await this.loansService.disburse(id, auth, body),
      "Loan disbursed - now Active",
    );
  }

  // ---------------------------------------------------------------------------
  // Payments
  // ---------------------------------------------------------------------------
  @Post(":id/payment")
  @ApiParam({ name: "id", description: "ID of the loan receiving the payment" })
  @ApiOperation({
    summary: "Record a repayment against an active loan",
    description:
      "Allocates the amount across installments (late fees, interest, principal).",
  })
  @ApiCreatedResponse({
    description:
      "Payment recorded; `data` holds the payment record with allocation details.",
  })
  @ApiBadRequestResponse({
    description:
      "Payments are only accepted on `Active`/`Overdue` loans, or validation failed.",
  })
  @ApiNotFoundResponse({ description: "No loan exists with the given `id`." })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async payment(@Param("id") id: string, @Body() body: RecordPaymentDto) {
    return ok(
      await this.loansService.receivePayment(id, body),
      "Payment recorded",
    );
  }

  // ---------------------------------------------------------------------------
  // Early settlement
  // ---------------------------------------------------------------------------
  @Post(":id/early-settle")
  @Roles("admin", "manager")
  @ApiParam({ name: "id", description: "ID of the loan to settle early" })
  @ApiOperation({
    summary: "Settle a loan early",
    description:
      "Recomputes the authoritative settlement quote and closes the loan as `Early_Settled`.",
  })
  @ApiCreatedResponse({
    description:
      "Loan early settled; `data` holds the closed loan and final quote.",
  })
  @ApiBadRequestResponse({
    description:
      "Loan already closed or not yet disbursed, or validation failed.",
  })
  @ApiNotFoundResponse({ description: "No loan exists with the given `id`." })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  @ApiForbiddenResponse({
    description: "Authenticated role is not permitted to settle loans early.",
  })
  async earlySettle(
    @Param("id") id: string,
    @Body() body: ExecuteSettlementDto,
  ) {
    return ok(
      await this.loansService.earlySettle(id, body),
      "Loan early settled",
    );
  }

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------
  @Post(":id/documents/presign")
  @ApiParam({
    name: "id",
    description: "ID of the loan the document belongs to",
  })
  @ApiOperation({
    summary: "Generate a presigned upload URL for a document",
    description:
      "Returns `documentId`, `key`, and a short-lived presigned PUT URL.",
  })
  @ApiCreatedResponse({
    description:
      "`data` contains `{ documentId, key, uploadUrl }` for the direct bucket upload.",
  })
  @ApiBadRequestResponse({ description: "Request body failed validation." })
  @ApiNotFoundResponse({ description: "No loan exists with the given `id`." })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async presignDocument(
    @Param("id") id: string,
    @Body() body: PresignDocumentDto,
  ) {
    const presign = await this.loansService.presignDocument(id, body);
    return {
      success: true,
      message: "Document upload URL generated",
      data: presign,
      timestamp: new Date().toISOString(),
    };
  }

  @Put(":id/documents/attach")
  @ApiParam({
    name: "id",
    description: "ID of the loan the document belongs to",
  })
  @ApiOperation({
    summary: "Confirm a document upload and attach it to the loan",
    description:
      "Verifies the object exists and records the document on the loan.",
  })
  @ApiOkResponse({
    description: "Document attached; `data` holds the updated loan.",
  })
  @ApiBadRequestResponse({
    description:
      "Request body failed validation, the object is not in the bucket yet, or the `documentId` was already attached.",
  })
  @ApiNotFoundResponse({ description: "No loan exists with the given `id`." })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  async attachDocument(
    @Param("id") id: string,
    @Body() body: AttachDocumentDto,
  ) {
    return ok(
      await this.loansService.attachDocument(id, body),
      "Document attached",
    );
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------
  @Delete(":id")
  @Roles("admin", "manager")
  @HttpCode(200)
  @ApiParam({ name: "id", description: "ID of the loan to delete" })
  @ApiOperation({
    summary: "Delete a loan record",
    description:
      "Requires role: `admin` or `manager`. Permanently removes the loan.",
  })
  @ApiOkResponse({ description: "Loan deleted successfully (`data` is null)." })
  @ApiNotFoundResponse({ description: "No loan exists with the given `id`." })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid or expired bearer token.",
  })
  @ApiForbiddenResponse({
    description: "Authenticated role is not permitted to delete loans.",
  })
  async remove(@Param("id") id: string) {
    await this.loansService.remove(id);
    return ok(null, "Loan deleted");
  }
}
