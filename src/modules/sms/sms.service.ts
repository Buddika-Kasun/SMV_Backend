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

/** Thrown when the SMS gateway rejects the request or is misconfigured. */
export class SmsDeliveryError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_CONFIGURED" | "GATEWAY_ERROR" | "NETWORK_ERROR",
    public readonly status?: number,
    public readonly gatewayResponse?: any,
  ) {
    super(message);
    this.name = "SmsDeliveryError";
  }
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get baseUrl(): string {
    return (config.sms.url ?? "").replace(/\/+$/, "");
  }

  private get sendUrl(): string {
    return `${this.baseUrl}/sms/send`;
  }

  private get balanceUrl(): string {
    return `${this.baseUrl}/balance`;
  }

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------
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

    // -------------------------------------------------------------------
    // Gateway not configured — always an error
    // -------------------------------------------------------------------
    if (!config.sms.apiKey || !this.sendUrl) {
      const reason =
        "SMS gateway is not configured. Please contact your administrator and verify your SMS balance.";

      entry.status = "FAILED";
      entry.error = reason;
      entry.gatewayResponse = { reason };

      await this.persist(entry);
      this.logger.error(`SMS NOT SENT to ${recipient}: ${reason}`);
      throw new SmsDeliveryError(reason, "NOT_CONFIGURED");
    }

    // -------------------------------------------------------------------
    // Real dispatch
    // -------------------------------------------------------------------
    try {
      const resp = await fetch(this.sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.sms.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          recipient,
          sender_id: config.sms.senderId,
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

      const gatewayOk = resp.ok && (!parsed || parsed.status === "success");

      if (!gatewayOk) {
        entry.status = "FAILED";

        const gatewayMessage =
          parsed?.message ??
          parsed?.error ??
          `HTTP ${resp.status}: ${text.slice(0, 200)}`;

        // Detect low-balance phrases from Text.lk
        const isBalanceIssue = /balance|insufficient|credit/i.test(
          gatewayMessage,
        );

        entry.error = isBalanceIssue
          ? `SMS not sent — check your SMS balance. (${gatewayMessage})`
          : `SMS not sent: ${gatewayMessage}`;

        await this.persist(entry);
        this.logger.error(`SMS FAILED to ${recipient}: ${entry.error}`);

        throw new SmsDeliveryError(
          entry.error,
          "GATEWAY_ERROR",
          resp.status,
          parsed ?? text,
        );
      }

      entry.status = "SENT";
      await this.persist(entry);
      this.logger.log(`SMS SENT to ${recipient}`);
      return entry;
    } catch (err) {
      if (err instanceof SmsDeliveryError) throw err;

      // Network / fetch error
      entry.status = "FAILED";
      entry.error =
        err instanceof Error
          ? `SMS not sent (network): ${err.message}`
          : "SMS not sent (unknown network error)";

      await this.persist(entry);
      this.logger.error(`SMS FAILED to ${recipient}: ${entry.error}`);
      throw new SmsDeliveryError(entry.error, "NETWORK_ERROR");
    }
  }

  // ---------------------------------------------------------------------------
  // Persist — best effort, never blocks the delivery result
  // ---------------------------------------------------------------------------
  private async persist(entry: SMSLogEntry): Promise<void> {
    try {
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
    } catch (err) {
      this.logger.error(
        `Failed to persist SMS log for ${entry.recipient}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Logs
  // ---------------------------------------------------------------------------
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
  async getBalance(): Promise<SmsBalance> {
    if (!config.sms.apiKey) {
      throw new SmsDeliveryError(
        "SMS gateway is not configured. Please contact your administrator.",
        "NOT_CONFIGURED",
      );
    }

    if (!this.baseUrl) {
      throw new SmsDeliveryError(
        "TEXT_LK_URL is not configured.",
        "NOT_CONFIGURED",
      );
    }

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
      throw new SmsDeliveryError(
        `Non-JSON response from balance endpoint: ${text.slice(0, 200)}`,
        "GATEWAY_ERROR",
        resp.status,
        text,
      );
    }

    if (!resp.ok || parsed.status !== "success") {
      throw new SmsDeliveryError(
        parsed?.message ?? `HTTP ${resp.status}: ${text.slice(0, 200)}`,
        "GATEWAY_ERROR",
        resp.status,
        parsed,
      );
    }

    const data = parsed.data ?? {};
    return {
      remainingBalance: Number(data.remaining_balance ?? 0),
      expiredOn: data.expired_on ?? null,
      raw: parsed,
    };
  }
}
