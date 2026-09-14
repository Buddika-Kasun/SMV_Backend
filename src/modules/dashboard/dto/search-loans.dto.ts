import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class SearchLoansDto {
  @ApiPropertyOptional({
    description:
      "Free-text search across customer name, customer NIC, phone, loan number, and account number.",
    example: "Silva",
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: "Max results to return (defaults to 8, max 50).",
    example: 8,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
