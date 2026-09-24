import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../config/prisma.service";
import { config } from "../../config/env";
import { SMSLogEntry } from "../../shared/types";
import { smsLogId } from "../../common/utils/id";
import { smsRecipient } from "../../common/utils/phone";
import { nowISO } from "../../common/utils/dates";
import { SendSmsDto } from "./dto/send-sms.dto";

interface SmsBalance {
  remainingBalance: number;
  expiredOn: string | null;
  raw: unknown;
}

/**
 * Text.lk SMS gateway integration.
 *
 * Uses the v3 API documented at https://app.text.lk/api/v3/sms/send:
 *   POST <config.sms.url>
 *   Authorization: Bearer <API_TOKEN>
 *   Content-Type: application/json
 *   Accept: application/json
 *   {
 *     "recipient": "94710000000",          // comma-separated for multiple
 *     "sender_id": "SMVHoldings",          // max 11 alphanumeric chars
 *     "type": "plain",
 *     "message": "This is a test message"
 *   }
 *
 * When `TEXT_LK_API_KEY` is empty, dispatch is simulated but still logged
 * to `sms_logs` with status SENT.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get baseUrl(): string {
    // Trim any trailing slash so we don't double up when concatenating
    return (config.sms.url ?? "").replace(/\/+$/, "");
  }

  private get sendUrl(): string {
    return `${this.baseUrl}/sms/send`;
  }

  private get balanceUrl(): string {
    return `${this.baseUrl}/balance`;
  }

  async send(input: SendSmsDto): Promise<SMSLogEntry> {
    const recipient = smsRecipient(input.recipient);
    const message = input.message;

    const entry: SMSLogEntry = {
      id: "",
      timestamp: nowISO(),
      recipient,
      originalPhone: input.recipient,
      message,
      loanId: input.loanId,
      customerName: input.customerName,
      amount: input.amount,
      status: "SENT",
      gatewayResponse: undefined,
    };

    if (config.sms.apiKey && this.sendUrl) {
      try {
        const resp = await fetch(this.sendUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.sms.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            recipient, // "94710000000"
            sender_id: config.sms.senderId, // "SMVHoldings"
            type: "plain",
            message,
          }),
        });

        const text = await resp.text();
        entry.gatewayResponse = text;

        let parsed: any = undefined;
        try {
          parsed = JSON.parse(text);
        } catch {
          // Non-JSON response — keep raw text
        }

        const ok = resp.ok && (!parsed || parsed.status === "success");

        entry.status = ok ? "SENT" : "FAILED";
        if (!ok) {
          entry.error =
            parsed?.message ?? `HTTP ${resp.status}: ${text.slice(0, 200)}`;
        }
      } catch (err) {
        entry.status = "FAILED";
        entry.error = err instanceof Error ? err.message : String(err);
      }
    } else {
      entry.gatewayResponse = {
        simulated: true,
        note: "TEXT_LK_API_KEY or TEXT_LK_URL not configured; logged only.",
      };
    }

    const seq = await this.prisma.sMSLog.count();
    entry.id = smsLogId(seq + 1);

    await this.prisma.sMSLog.create({
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
    if (entry.status === "FAILED" && entry.error) {
      this.logger.warn(`SMS error: ${entry.error}`);
    }

    return entry;
  }

  async logs(limit = 100): Promise<SMSLogEntry[]> {
    const rows = await this.prisma.sMSLog.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 500),
    });
    return rows.map((r: any) => ({ ...(r.data as unknown as SMSLogEntry) }));
  }

  // ---------------------------------------------------------------------------
  // Balance
  // ---------------------------------------------------------------------------
  /**
   * GET {baseUrl}/balance
   *
   * Response:
   * {
   *   "status": "success",
   *   "message": null,
   *   "data": {
   *     "remaining_balance": "100",
   *     "expired_on": "15th Sep 26, 2:50 PM"
   *   }
   * }
   */
  async getBalance(): Promise<SmsBalance> {
    if (!config.sms.apiKey) {
      this.logger.warn(
        "SMS balance requested but TEXT_LK_API_KEY is not configured.",
      );
      return { remainingBalance: 0, expiredOn: null, raw: null };
    }

    if (!this.baseUrl) {
      throw new Error("TEXT_LK_URL is not configured.");
    }

    try {
      const resp = await fetch(this.balanceUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.sms.apiKey}`,
          Accept: "application/json",
        },
      });

      const text = await resp.text();

      let parsed: any = undefined;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(
          `Non-JSON response from balance endpoint: ${text.slice(0, 200)}`,
        );
      }

      if (!resp.ok || parsed.status !== "success") {
        throw new Error(
          parsed?.message ?? `HTTP ${resp.status}: ${text.slice(0, 200)}`,
        );
      }

      const data = parsed.data ?? {};
      return {
        remainingBalance: Number(data.remaining_balance ?? 0),
        expiredOn: data.expired_on ?? null,
        raw: parsed,
      };
    } catch (err) {
      this.logger.error(
        `Failed to fetch SMS balance: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }
}
