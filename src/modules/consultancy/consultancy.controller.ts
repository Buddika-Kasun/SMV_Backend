import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ok } from '../../common/response';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ConsultancyService } from './consultancy.service';
import { CreateConsultancyDto, ReturnFundsDto } from './dto/consultancy.dto';
import { PresignPassbookDto, ConfirmPassbookDto } from './dto/passbook.dto';

@Controller('consultancy')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConsultancyController {
  constructor(private readonly consultancyService: ConsultancyService) {}

  @Get('agreements')
  async list(@Query('status') status?: string, @Query('search') search?: string) {
    return ok(await this.consultancyService.list(status, search), 'Agreements retrieved');
  }

  @Get('agreements/:id')
  async getOne(@Param('id') id: string) {
    return ok(await this.consultancyService.getOne(id), 'Agreement retrieved');
  }

  @Post('agreements')
  @Roles('admin', 'manager')
  async create(@Body() body: CreateConsultancyDto) {
    const agreement = await this.consultancyService.create(body);
    return { success: true, message: 'Consultancy agreement created', data: agreement, timestamp: new Date().toISOString() };
  }

  @Post('agreements/:id/return-funds')
  @Roles('admin', 'manager')
  async returnFunds(@Param('id') id: string, @Body() body: ReturnFundsDto) {
    return ok(await this.consultancyService.returnFunds(id, body), 'Funds returned - agreement closed');
  }

  /**
   * Step 1 - Issue a presigned PUT URL so the passbook file is uploaded directly
   * to the storage bucket. The returned `key` must be sent back via
   * `PUT /agreements/:id/passbook` after the upload completes.
   */
  @Post('agreements/:id/passbook')
  @Roles('admin', 'manager')
  async presignPassbook(@Param('id') id: string, @Body() body: PresignPassbookDto) {
    const presign = await this.consultancyService.presignPassbook(id, body.fileName, body.contentType);
    return {
      success: true,
      message: 'Passbook upload URL generated',
      data: presign,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Step 2: Confirm the passbook object was uploaded; the object key is
   * persisted into the consultancy_agreements.passbook_key column.
   */
  @Put('agreements/:id/passbook')
  @Roles('admin', 'manager')
  async confirmPassbook(@Param('id') id: string, @Body() body: ConfirmPassbookDto) {
    return ok(
      await this.consultancyService.confirmPassbook(id, body.key, body.fileName),
      'Passbook document stored',
    );
  }
}