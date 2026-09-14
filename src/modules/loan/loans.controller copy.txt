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
} from '@nestjs/common';
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
} from '@nestjs/swagger';
import { ok } from '../../common/response';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthedUser } from '../../common/guards/auth.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { RecordPaymentDto, ExecuteSettlementDto } from './dto/payment-settlement.dto';
import { ApproveLoanDto, RejectLoanDto, DisburseLoanDto, UpdateKYCDto } from './dto/loan-transition.dto';
import { PresignDocumentDto, AttachDocumentDto } from './dto/loan-document.dto';

/**
 * Loan lifecycle endpoints. All routes require a valid JWT; disbursement,
 * early settlement and deletion additionally require the `admin` or
 * `manager` role (enforced by {@link RolesGuard}).
 */
@ApiTags('Loans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Get()
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'Pending Approval',
      'KYC Pending',
      'Approved - Pending Disbursement',
      'Active',
      'Overdue',
      'Settled',
      'Early Settled',
      'Rejected',
    ],
    description: 'Filter loans by lifecycle status.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Case-insensitive match on customer name or account number; partial match on phone.',
    example: 'Silva',
  })
  @ApiOperation({
    summary: 'List loans',
    description: 'Optionally filtered by status and/or free-text search term.',
  })
  @ApiOkResponse({ description: 'Standard envelope whose `data` holds the array of loans.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async list(@Query('status') status?: string, @Query('search') search?: string) {
    return ok(await this.loansService.list(status, search), 'Loans retrieved');
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'ID of the loan' })
  @ApiOperation({ summary: 'Fetch a single loan by ID' })
  @ApiOkResponse({ description: 'Loan retrieved successfully (includes computed schedule/totals and KYC documents).' })
  @ApiNotFoundResponse({ description: 'No loan exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async getOne(@Param('id') id: string) {
    return ok(await this.loansService.getOne(id), 'Loan retrieved');
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Submit a new loan application',
    description:
      'Creates the application in `Pending Approval`, generates the repayment schedule and seeds an empty KYC record.',
  })
  @ApiCreatedResponse({ description: 'Loan application created; `data` holds the full loan aggregate.' })
  @ApiBadRequestResponse({ description: 'Request body failed validation.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async create(@Body() body: CreateLoanDto) {
    const loan = await this.loansService.create(body);
    return { success: true, message: 'Loan application created', data: loan, timestamp: new Date().toISOString() };
  }

  @Post(':id/approve')
  @ApiParam({ name: 'id', description: 'ID of the loan application to approve' })
  @ApiOperation({
    summary: 'Approve a pending loan application',
    description: 'Transitions the loan from `Pending Approval` to `KYC Pending`.',
  })
  @ApiCreatedResponse({ description: 'Loan approved; KYC data must be completed next.' })
  @ApiBadRequestResponse({ description: 'Loan is not in `Pending Approval` status, or validation failed.' })
  @ApiNotFoundResponse({ description: 'No loan exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async approve(@Param('id') id: string, @Body() body: ApproveLoanDto) {
    return ok(await this.loansService.approve(id, body.notes), 'Loan approved - KYC required');
  }

  @Post(':id/reject')
  @ApiParam({ name: 'id', description: 'ID of the loan application to reject' })
  @ApiOperation({
    summary: 'Reject a loan application',
    description: 'Transitions a pre-disbursement loan to `Rejected` with a recorded reason.',
  })
  @ApiCreatedResponse({ description: 'Loan application rejected; `data` holds the updated loan.' })
  @ApiBadRequestResponse({ description: 'Loan cannot be rejected at its current stage, or validation failed.' })
  @ApiNotFoundResponse({ description: 'No loan exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async reject(@Param('id') id: string, @Body() body: RejectLoanDto) {
    return ok(await this.loansService.reject(id, body.reason), 'Loan application rejected');
  }

  @Put(':id/kyc')
  @ApiParam({ name: 'id', description: 'ID of the loan whose KYC is being updated' })
  @ApiOperation({
    summary: 'Update loan KYC data',
    description:
      'Merges the supplied KYC fields into the loan record and records the acting user. Set `verified: true` once all ' +
      'documents are reviewed to move the loan to `Approved - Pending Disbursement`.',
  })
  @ApiOkResponse({
    description:
      '`data` holds the updated loan. Message indicates whether KYC is verified (ready for disbursement) or just updated.',
  })
  @ApiBadRequestResponse({ description: 'Rejected loans cannot be edited, or validation failed.' })
  @ApiNotFoundResponse({ description: 'No loan exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async updateKYC(
    @Param('id') id: string,
    @Body() body: UpdateKYCDto,
    @CurrentUser() auth: AuthedUser,
  ) {
    const loan = await this.loansService.updateKYC(id, body, {
      username: auth.username,
      fullName: auth.fullName,
    });
    return ok(loan, loan.kyc.isVerified ? 'KYC verified - loan ready for disbursement' : 'KYC data updated');
  }

  @Post(':id/disburse')
  @Roles('admin', 'manager')
  @ApiParam({ name: 'id', description: 'ID of the approved loan to disburse' })
  @ApiOperation({
    summary: 'Disburse an approved loan',
    description:
      'Requires role: `admin` or `manager`. Transitions the loan from `Approved - Pending Disbursement` to `Active`, ' +
      'stamping the disbursement date and starting the repayment schedule.',
  })
  @ApiCreatedResponse({ description: 'Loan disbursed; `data` holds the now-active loan.' })
  @ApiBadRequestResponse({ description: 'Loan is not in `Approved - Pending Disbursement` status.' })
  @ApiNotFoundResponse({ description: 'No loan exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  @ApiForbiddenResponse({ description: 'Authenticated role is not permitted to disburse loans.' })
  async disburse(@Param('id') id: string, @Body() _body: DisburseLoanDto) {
    return ok(await this.loansService.disburse(id), 'Loan disbursed - now Active');
  }
  /**
   * Step 1 - ask the server for a presigned PUT URL, then upload the file
   * bytes directly to storage before calling `PUT :id/documents/attach`.
   */
  @Post(':id/documents/presign')
  @ApiParam({ name: 'id', description: 'ID of the loan the document belongs to' })
  @ApiOperation({
    summary: 'Generate a presigned upload URL for a KYC document',
    description:
      'Returns the object `key`, a generated `documentId` and a short-lived presigned PUT URL. Upload the file bytes ' +
      'directly to that URL, then confirm via `PUT /loans/:id/documents/attach`.',
  })
  @ApiCreatedResponse({
    description: '`data` contains `{ documentId, key, uploadUrl }` for the direct bucket upload.',
  })
  @ApiBadRequestResponse({ description: 'Request body failed validation.' })
  @ApiNotFoundResponse({ description: 'No loan exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async presignDocument(@Param('id') id: string, @Body() body: PresignDocumentDto) {
    const presign = await this.loansService.presignDocument(id, body);
    return {
      success: true,
      message: 'KYC document upload URL generated',
      data: presign,
      timestamp: new Date().toISOString(),
    };
  }

  @Put(':id/documents/attach')
  @ApiParam({ name: 'id', description: 'ID of the loan the document belongs to' })
  @ApiOperation({
    summary: 'Confirm a KYC document upload and attach it to the loan',
    description: 'Verifies the object exists in the bucket and records the document on the loan KYC record.',
  })
  @ApiOkResponse({ description: 'Document attached; `data` holds the updated loan with its KYC documents.' })
  @ApiBadRequestResponse({
    description:
      'Request body failed validation, the object is not in the bucket yet, or the `documentId` was already attached.',
  })
  @ApiNotFoundResponse({ description: 'No loan exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async attachDocument(@Param('id') id: string, @Body() body: AttachDocumentDto) {
    return ok(await this.loansService.attachDocument(id, body), 'KYC document attached');
  }

  @Post(':id/payment')
  @ApiParam({ name: 'id', description: 'ID of the loan receiving the payment' })
  @ApiOperation({
    summary: 'Record a repayment against an active loan',
    description:
      'Allocates the amount across installments (late fees, interest, principal) and returns the allocation breakdown.',
  })
  @ApiCreatedResponse({
    description: 'Payment recorded; `data` holds the updated loan including the payment allocation details.',
  })
  @ApiBadRequestResponse({ description: 'Payments are only accepted on `Active`/`Overdue` loans, or validation failed.' })
  @ApiNotFoundResponse({ description: 'No loan exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async payment(@Param('id') id: string, @Body() body: RecordPaymentDto) {
    return ok(await this.loansService.receivePayment(id, body), 'Payment recorded');
  }

  @Post(':id/early-settle')
  @Roles('admin', 'manager')
  @ApiParam({ name: 'id', description: 'ID of the loan to settle early' })
  @ApiOperation({
    summary: 'Settle a loan early',
    description:
      'Requires role: `admin` or `manager`. Recomputes the authoritative settlement quote server-side and closes the ' +
      'loan as `Early Settled`. Any `quote` supplied in the body is advisory only.',
  })
  @ApiCreatedResponse({ description: 'Loan early settled; `data` holds the closed loan and final quote.' })
  @ApiBadRequestResponse({ description: 'Loan already closed or not yet disbursed, or validation failed.' })
  @ApiNotFoundResponse({ description: 'No loan exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  @ApiForbiddenResponse({ description: 'Authenticated role is not permitted to settle loans early.' })
  async earlySettle(@Param('id') id: string, @Body() body: ExecuteSettlementDto) {
    return ok(await this.loansService.earlySettle(id, body), 'Loan early settled');
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  @HttpCode(200)
  @ApiParam({ name: 'id', description: 'ID of the loan to delete' })
  @ApiOperation({
    summary: 'Delete a loan record',
    description: 'Requires role: `admin` or `manager`. Permanently removes the loan.',
  })
  @ApiOkResponse({ description: 'Loan deleted successfully (`data` is null).' })
  @ApiNotFoundResponse({ description: 'No loan exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  @ApiForbiddenResponse({ description: 'Authenticated role is not permitted to delete loans.' })
  async remove(@Param('id') id: string) {
    await this.loansService.remove(id);
    return ok(null, 'Loan deleted');
  }
}