import { IsOptional, IsInt, Min, Max, IsString, IsIn } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class PaginationDto {
  @ApiPropertyOptional({
    description: "Page number (1-indexed)",
    minimum: 1,
    default: 1,
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "Number of items per page",
    minimum: 1,
    maximum: 100,
    default: 10,
    example: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: "Search term to filter results",
    example: "search term",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: "Request role",
    example: "admin",
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({
    description: "Status",
    example: "pending",
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: "Sort field",
    example: "createdAt",
  })
  @IsOptional()
  @IsString()
  sortBy?: string = "createdAt";

  @ApiPropertyOptional({
    description: "Sort order",
    enum: ["asc", "desc"],
    default: "desc",
    example: "desc",
  })
  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc" = "desc";
}
