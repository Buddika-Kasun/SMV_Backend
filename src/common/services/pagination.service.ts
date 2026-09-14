import { Injectable } from "@nestjs/common";
import { PaginationDto } from "../dto/pagination.dto";
import { PaginationMetaDto } from "../dto/pagination-response.dto";

export interface PaginationOptions {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  search?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMetaDto;
}

@Injectable()
export class PaginationService {
  /**
   * Get pagination options from query parameters
   */
  getPaginationOptions(
    paginationDto: PaginationDto,
    defaultSortBy: string = "createdAt",
    defaultSortOrder: "asc" | "desc" = "desc",
  ): PaginationOptions {
    const page = Math.max(1, paginationDto.page || 1);
    const limit = Math.min(100, Math.max(1, paginationDto.limit || 10));
    const skip = (page - 1) * limit;

    return {
      page,
      limit,
      skip,
      sortBy: paginationDto.sortBy || defaultSortBy,
      sortOrder: paginationDto.sortOrder || defaultSortOrder,
      search: paginationDto.search,
    };
  }

  /**
   * Create paginated response
   */
  createPaginatedResponse<T>(
    items: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResult<T> {
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Build Prisma query options from pagination parameters
   */
  buildPrismaQueryOptions(
    paginationDto: PaginationDto,
    defaultSortBy: string = "createdAt",
    defaultSortOrder: "asc" | "desc" = "desc",
  ): {
    skip: number;
    take: number;
    orderBy: Record<string, "asc" | "desc">;
  } {
    const options = this.getPaginationOptions(
      paginationDto,
      defaultSortBy,
      defaultSortOrder,
    );

    return {
      skip: options.skip,
      take: options.limit,
      orderBy: {
        [options.sortBy]: options.sortOrder,
      },
    };
  }

  /**
   * Build search condition for Prisma
   */
  buildSearchCondition(searchFields: string[], searchTerm?: string): any {
    if (!searchTerm) return {};

    return {
      OR: searchFields.map((field) => ({
        [field]: {
          contains: searchTerm,
          mode: "insensitive" as const,
        },
      })),
    };
  }

  /**
   * Get pagination metadata
   */
  getPaginationMeta(
    total: number,
    page: number,
    limit: number,
  ): PaginationMetaDto {
    const totalPages = Math.ceil(total / limit);
    return {
      page,
      limit,
      totalItems: total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  /**
   * Create success response with pagination
   */
  createSuccessResponse<T>(
    items: T[],
    total: number,
    page: number,
    limit: number,
    message: string = "Data retrieved successfully",
  ) {
    return {
      success: true,
      message,
      data: this.createPaginatedResponse(items, total, page, limit),
      timestamp: new Date().toISOString(),
    };
  }
}
