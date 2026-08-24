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

@Controller('loans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Get()
  async list(@Query('status') status?: string, @Query('search') search?: string) {
    return ok(await this.loansService.list(status, search), 'Loans retrieved');
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return ok(await this.loansService.getOne(id), 'Loan retrieved');
  }

  @Post()
  @HttpCode(201)
  async create(@Body() body: CreateLoanDto) {
    const loan = await this.loansService.create(body);
    return { success: true, message: 'Loan application created', data: loan, timestamp: new Date().toISOString() };
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @Body() body: ApproveLoanDto) {
    return ok(await this.loansService.approve(id, body.notes), 'Loan approved - KYC required');
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body() body: RejectLoanDto) {
    return ok(await this.loansService.reject(id, body.reason), 'Loan application rejected');
  }

  @Put(':id/kyc')
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
  async disburse(@Param('id') id: string, @Body() _body: DisburseLoanDto) {
    return ok(await this.loansService.disburse(id), 'Loan disbursed - now Active');
  }
@Post(':id/documents/presign')
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
  async attachDocument(@Param('id') id: string, @Body() body: AttachDocumentDto) {
    return ok(await this.loansService.attachDocument(id, body), 'KYC document attached');
  }

  @Post(':id/payment')
  async payment(@Param('id') id: string, @Body() body: RecordPaymentDto) {
    return ok(await this.loansService.receivePayment(id, body), 'Payment recorded');
  }

  @Post(':id/early-settle')
  @Roles('admin', 'manager')
  async earlySettle(@Param('id') id: string, @Body() body: ExecuteSettlementDto) {
    return ok(await this.loansService.earlySettle(id, body), 'Loan early settled');
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  @HttpCode(200)
  async remove(@Param('id') id: string) {
    await this.loansService.remove(id);
    return ok(null, 'Loan deleted');
  }
}