import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../config/prisma.service";
import {
  PaginationService,
  PaginatedResult,
} from "../../common/services/pagination.service";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { SmsDeliveryError, SmsService } from "../sms/sms.service";
import { createHash, randomInt } from "crypto";
import { smsRecipient } from "../../common/utils/phone";
import { SendPhoneOtpDto, VerifyPhoneOtpDto } from "./dto/verify-phone.dto";

/** How long an OTP is valid for. */
const OTP_TTL_MINUTES = 15;
/** Max failed verification attempts before the OTP is invalidated. */
const OTP_MAX_ATTEMPTS = 5;
/** Minimum interval between two OTP sends to the same phone (seconds). */
const OTP_RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
    private readonly sms: SmsService,
  ) {}

  // ---------------------------------------------------------------------------
  // List customers with pagination + filters
  // ---------------------------------------------------------------------------
  async list(
    query: PaginationDto & { kycStatus?: string },
  ): Promise<PaginatedResult<any>> {
    const where: any = {};

    // Free-text search across name / NIC / phone / city
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: "insensitive" } },
        { idNumber: { contains: query.search } },
        { phone: { contains: query.search } },
        { city: { contains: query.search, mode: "insensitive" } },
      ];
    }

    // KYC status filter
    if (query.kycStatus === "Verified") {
      where.isVerified = true;
    } else if (query.kycStatus === "Pending") {
      where.isVerified = false;
    }

    const options = this.paginationService.getPaginationOptions(
      query,
      "createdAt",
      "desc",
    );

    const [total, rows] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        include: {
          loans: {
            select: {
              id: true,
              loanNumber: true,
              accountNumber: true,
              loanType: true,
              requestedAmount: true,
              disbursedAmount: true,
              totalPaidAmount: true,
              outstandingBalance: true,
              status: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { [options.sortBy]: options.sortOrder },
        skip: options.skip,
        take: options.limit,
      }),
    ]);

    const items = rows.map((row) => this.formatCustomerResponse(row));
    return this.paginationService.createPaginatedResponse(
      items,
      total,
      options.page,
      options.limit,
    );
  }

  // ---------------------------------------------------------------------------
  // Stats — total / verified / pending (for filter tabs)
  // ---------------------------------------------------------------------------
  async getStats(): Promise<{
    total: number;
    verified: number;
    pending: number;
  }> {
    const [total, verified] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { isVerified: true } }),
    ]);
    return { total, verified, pending: total - verified };
  }

  // ---------------------------------------------------------------------------
  // Single customer
  // ---------------------------------------------------------------------------
  async getOne(id: string): Promise<any> {
    const row = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        loans: {
          orderBy: { createdAt: "desc" },
          include: {
            installments: { orderBy: { installmentNumber: "asc" } },
            guarantor: true,
            documents: true,
          },
        },
      },
    });

    if (!row) throw new NotFoundException("Customer not found");
    return this.formatCustomerResponse(row);
  }

  async lookupByIdNumber(
    idNumber: string,
  ): Promise<
    Array<{ id: string; fullName: string; idNumber: string; phone: string }>
  > {
    if (!idNumber || idNumber.trim().length < 3) return [];

    const rows = await this.prisma.customer.findMany({
      where: {
        // idNumber: { contains: idNumber.trim(), mode: "insensitive" },
        idNumber: { startsWith: idNumber.trim(), mode: "insensitive" },
      },
      select: {
        id: true,
        fullName: true,
        idNumber: true,
        phone: true,
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    return rows;
  }

  // ---------------------------------------------------------------------------
  // Phone OTP — send
  // ---------------------------------------------------------------------------
  async sendPhoneOtp(input: SendPhoneOtpDto): Promise<{ requestId: string }> {
    const phone = smsRecipient(input.phone); // normalized: 94712345678

    // Cooldown check — don't allow spam
    const recent = await this.prisma.phoneOtp.findFirst({
      where: {
        phone,
        consumedAt: null,
        createdAt: {
          gte: new Date(Date.now() - OTP_RESEND_COOLDOWN_SECONDS * 1000),
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (recent) {
      const waitSeconds = Math.ceil(
        (recent.createdAt.getTime() +
          OTP_RESEND_COOLDOWN_SECONDS * 1000 -
          Date.now()) /
          1000,
      );
      throw new BadRequestException(
        `Please wait ${waitSeconds}s before requesting another OTP.`,
      );
    }

    // Generate a 6-digit code
    const code = String(randomInt(0, 10_000)).padStart(4, "0");
    const codeHash = createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Invalidate any previous unconsumed OTPs for this phone
    await this.prisma.phoneOtp.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const row = await this.prisma.phoneOtp.create({
      data: {
        phone,
        codeHash,
        expiresAt,
      },
    });

    // Send SMS (best-effort — log if it fails but don't roll back the OTP row)
    try {
      await this.sms.send({
        recipient: phone,
        message: `Your SMV Holdings verification code is ${code}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share this code.`,
      });
    } catch (err) {
      // Roll back the OTP row — the user can't use it if SMS never went out
      await this.prisma.phoneOtp
        .delete({ where: { id: row.id } })
        .catch(() => {});

      if (err instanceof SmsDeliveryError) {
        // Give the operator a useful message
        throw new BadRequestException(err.message);
      }
      throw new BadRequestException(
        "Failed to send verification code. Please try again later.",
      );
    }

    // this.logger.log(`OTP sent to ${phone} (requestId=${row.id})`);

    return { requestId: row.id };
  }

  // ---------------------------------------------------------------------------
  // Phone OTP — verify
  // ---------------------------------------------------------------------------
  async verifyPhoneOtp(
    input: VerifyPhoneOtpDto,
  ): Promise<{ verified: boolean }> {
    const phone = smsRecipient(input.phone);

    const row = await this.prisma.phoneOtp.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!row) {
      throw new BadRequestException("No active OTP found for this phone.");
    }

    if (row.expiresAt.getTime() < Date.now()) {
      await this.prisma.phoneOtp.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      });
      throw new BadRequestException("OTP has expired. Request a new one.");
    }

    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      await this.prisma.phoneOtp.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      });
      throw new BadRequestException(
        "Too many failed attempts. Request a new OTP.",
      );
    }

    const submittedHash = createHash("sha256").update(input.code).digest("hex");

    if (submittedHash !== row.codeHash) {
      await this.prisma.phoneOtp.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("Invalid OTP code.");
    }

    // Success — mark consumed
    await this.prisma.phoneOtp.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });

    // this.logger.log(`OTP verified for ${phone}`);

    return { verified: true };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private formatCustomerResponse(customer: any): any {
    return {
      id: customer.id,
      customerNumber: customer.customerNumber,
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email || undefined,
      idNumber: customer.idNumber,
      idType: customer.idType,
      dateOfBirth: customer.dateOfBirth
        ? customer.dateOfBirth.toISOString().slice(0, 10)
        : undefined,
      gender: customer.gender || undefined,
      occupation: customer.occupation || undefined,
      employerName: customer.employerName || undefined,
      monthlyIncome: customer.monthlyIncome
        ? Number(customer.monthlyIncome)
        : undefined,
      addressLine: customer.addressLine || undefined,
      city: customer.city || undefined,
      isVerified: customer.isVerified,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),

      // Loans aggregate (if included)
      loans:
        customer.loans?.map((l: any) => ({
          id: l.id,
          loanNumber: l.loanNumber,
          accountNumber: l.accountNumber,
          loanType: l.loanType,
          status: l.status,
          requestedAmount: Number(l.requestedAmount),
          disbursedAmount: Number(l.disbursedAmount),
          totalPaidAmount: Number(l.totalPaidAmount),
          outstandingBalance: Number(l.outstandingBalance),
          createdAt: l.createdAt.toISOString(),
        })) || [],
    };
  }
}
