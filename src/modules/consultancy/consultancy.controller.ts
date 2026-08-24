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
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ConsultancyService } from './consultancy.service';
import { CreateConsultancyDto, ReturnFundsDto } from './dto/consultancy.dto';
import { PresignPassbookDto, ConfirmPassbookDto } from './dto/passbook.dto';

/**
 * Fixed-deposit consultancy agreements. All endpoints require a valid JWT;
 * mutating endpoints additionally require the `admin` or `manager` role.
 */
@ApiTags('Consultancy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('consultancy')
export class ConsultancyController {
  constructor(private readonly consultancyService: ConsultancyService) {}

  @Get('agreements')
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['Active Placed', 'Maturing Soon', 'Maturity Reached', 'Returned & Closed'],
    description: 'Filter agreements by lifecycle status.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description:
      'Case-insensitive match on customer name or agreement number; partial match on phone.',
    example: 'Silva',
  })
  @ApiOperation({
    summary: 'List consultancy agreements',
    description: 'Optionally filtered by status and/or free-text search term.',
  })
  @ApiOkResponse({
    description: 'Standard envelope whose `data` holds the array of agreements.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async list(@Query('status') status?: string, @Query('search') search?: string) {
    return ok(await this.consultancyService.list(status, search), 'Agreements retrieved');
  }

  @Get('agreements/:id')
  @ApiParam({ name: 'id', description: 'ID of the consultancy agreement' })
  @ApiOperation({ summary: 'Fetch a single consultancy agreement by ID' })
  @ApiOkResponse({ description: 'Agreement retrieved successfully.' })
  @ApiNotFoundResponse({ description: 'No consultancy agreement exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async getOne(@Param('id') id: string) {
    return ok(await this.consultancyService.getOne(id), 'Agreement retrieved');
  }

  @Post('agreements')
  @Roles('admin', 'manager')
  @ApiOperation({
    summary: 'Create a new consultancy agreement',
    description:
      'Requires role: `admin` or `manager`. Places a fixed deposit and computes the maturity date from `startDate`.',
  })
  @ApiCreatedResponse({
    description: 'Agreement created; returns the persisted agreement including its generated number.',
  })
  @ApiBadRequestResponse({ description: 'Request body failed validation.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  @ApiForbiddenResponse({ description: 'Authenticated role is not permitted to create agreements.' })
  async create(@Body() body: CreateConsultancyDto) {
    const agreement = await this.consultancyService.create(body);
    return { success: true, message: 'Consultancy agreement created', data: agreement, timestamp: new Date().toISOString() };
  }

  @Post('agreements/:id/return-funds')
  @Roles('admin', 'manager')
  @ApiParam({ name: 'id', description: 'ID of the consultancy agreement to close' })
  @ApiOperation({
    summary: 'Return funds and close an agreement',
    description:
      'Requires role: `admin` or `manager`. Records the return payment details and marks the agreement as `Returned & Closed`.',
  })
  @ApiCreatedResponse({
    description: 'Funds returned; `data` holds the closed agreement with its return record.',
  })
  @ApiBadRequestResponse({
    description: 'Request body failed validation or funds were already returned for this agreement.',
  })
  @ApiNotFoundResponse({ description: 'No consultancy agreement exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  @ApiForbiddenResponse({ description: 'Authenticated role is not permitted to close agreements.' })
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
  @ApiParam({ name: 'id', description: 'ID of the consultancy agreement' })
  @ApiOperation({
    summary: 'Generate a presigned upload URL for the passbook scan',
    description:
      'Requires role: `admin` or `manager`. Returns the object `key` plus a short-lived presigned PUT URL; upload the ' +
      'file bytes directly to that URL, then confirm via `PUT /consultancy/agreements/:id/passbook`.',
  })
  @ApiCreatedResponse({
    description: '`data` contains `{ key, uploadUrl }` for the direct bucket upload.',
  })
  @ApiBadRequestResponse({ description: 'Request body failed validation.' })
  @ApiNotFoundResponse({ description: 'No consultancy agreement exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  @ApiForbiddenResponse({ description: 'Authenticated role is not permitted to manage passbooks.' })
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
  @ApiParam({ name: 'id', description: 'ID of the consultancy agreement' })
  @ApiOperation({
    summary: 'Confirm the passbook upload and attach it to the agreement',
    description:
      'Requires role: `admin` or `manager`. Verifies the object exists in the bucket and persists its key ' +
      '(plus a presigned GET URL) on the agreement.',
  })
  @ApiOkResponse({
    description: 'Passbook stored; `data` holds the updated agreement with `passbookUrl` populated.',
  })
  @ApiBadRequestResponse({
    description:
      'Request body failed validation or the referenced object was not found in the bucket (upload it first).',
  })
  @ApiNotFoundResponse({ description: 'No consultancy agreement exists with the given `id`.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  @ApiForbiddenResponse({ description: 'Authenticated role is not permitted to manage passbooks.' })
  async confirmPassbook(@Param('id') id: string, @Body() body: ConfirmPassbookDto) {
    return ok(
      await this.consultancyService.confirmPassbook(id, body.key, body.fileName),
      'Passbook document stored',
    );
  }
}