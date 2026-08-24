import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ok } from '../../common/response';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SmsService } from './sms.service';
import { SendSmsDto } from './dto/send-sms.dto';

@Controller('sms')
@UseGuards(JwtAuthGuard)
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Post('send')
  async send(@Body() body: SendSmsDto) {
    const log = await this.smsService.send(body);
    return { success: true, message: 'SMS dispatched', data: log, timestamp: new Date().toISOString() };
  }

  @Get('logs')
  async logs(@Query('limit') limit?: string) {
    return ok(await this.smsService.logs(limit ? Number(limit) : 100), 'SMS logs retrieved');
  }
}