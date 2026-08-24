import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { config } from '../../config/env';
import { SMSLogEntry } from '../../shared/types';
import { smsLogId } from '../../common/utils/id';
import { smsRecipient } from '../../common/utils/phone';
import { nowISO } from '../../common/utils/dates';
import { SendSmsDto } from './dto/send-sms.dto';

/**
 * Text.lk SMS gateway integration. When `TEXT_LK_API_KEY` is unset, the
 * dispatch is simulated but still persisted to `sms_logs` with status SENT.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(input: SendSmsDto): Promise<SMSLogEntry> {
    const recipient = smsRecipient(input.recipient);
    const message = input.message;

    const entry: SMSLogEntry = {
      id: '',
      timestamp: nowISO(),
      recipient,
      originalPhone: input.recipient,
      message,
      loanId: input.loanId,
      customerName: input.customerName,
      amount: input.amount,
      status: 'SENT',
      gatewayResponse: undefined,
    };

    if (config.sms.apiKey) {
      try {
        const resp = await fetch(config.sms.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            api_key: config.sms.apiKey,
            sender_id: config.sms.senderId,
            to: recipient,
            message,
          }).toString(),
        });
        const text = await resp.text();
        entry.status = resp.ok ? 'SENT' : 'FAILED';
        entry.gatewayResponse = text;
        if (!resp.ok) entry.error = text;
      } catch (err) {
        entry.status = 'FAILED';
        entry.error = err instanceof Error ? err.message : String(err);
      }
    } else {
      entry.gatewayResponse = { simulated: true, note: 'SMS_API_KEY not configured; logged only.' };
    }

    const seq = await this.prisma.smsLog.count();
    entry.id = smsLogId(seq + 1);

    await this.prisma.smsLog.create({
      data: {
        id: entry.id,
        recipient: entry.recipient,
        message: entry.message,
        loanId: entry.loanId ?? null,
        status: entry.status,
        data: entry as unknown as object,
      },
    });

    this.logger.log(`SMS ${entry.status} to ${entry.recipient}`);
    return entry;
  }

  async logs(limit = 100): Promise<SMSLogEntry[]> {
    const rows = await this.prisma.smsLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
    return rows.map((r: any) => ({ ...(r.data as unknown as SMSLogEntry) }));
  }
}