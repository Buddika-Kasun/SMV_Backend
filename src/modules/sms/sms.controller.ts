import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ok } from '../../common/response';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SmsService } from './sms.service';
import { SendSmsDto } from './dto/send-sms.dto';

@ApiTags('SMS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sms')
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Post('send')
  @ApiOperation({
    summary: 'Dispatch an SMS message',
    description:
      'Sends an SMS (e.g. payment confirmation) to a customer and records the dispatch in the log. Any authenticated role may send.',
  })
  @ApiCreatedResponse({
    description: 'SMS dispatched; `data` holds the persisted SMS log entry including delivery status.',
  })
  @ApiBadRequestResponse({ description: 'Request body failed validation.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async send(@Body() body: SendSmsDto) {
    const log = await this.smsService.send(body);
    return { success: true, message: 'SMS dispatched', data: log, timestamp: new Date().toISOString() };
  }

  @Get('logs')
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of log entries to return (defaults to 100).',
    example: 50,
  })
  @ApiOperation({
    summary: 'List recent SMS log entries',
    description: 'Returns the most recent SMS dispatch log entries, newest first.',
  })
  @ApiOkResponse({
    description: 'Standard envelope whose `data` holds the array of SMS log entries.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async logs(@Query('limit') limit?: string) {
    return ok(await this.smsService.logs(limit ? Number(limit) : 100), 'SMS logs retrieved');
  }
}