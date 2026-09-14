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

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
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
