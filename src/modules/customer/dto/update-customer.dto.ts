import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class UpdateCustomerDto {
  @ApiPropertyOptional({ example: "200012345678" })
  @IsOptional()
  @IsString()
  idNumber?: string;

  @ApiPropertyOptional({
    enum: ["NIC", "Passport", "Driver_License", "Other"],
    example: "NIC",
  })
  @IsOptional()
  @IsIn(["NIC", "Passport", "Driver_License", "Other"])
  idType?: string;

  @ApiPropertyOptional({ example: "John Doe" })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ example: "0771234567" })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: "john@example.com" })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: "1990-01-15" })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: ["Male", "Female", "Other"], example: "Male" })
  @IsOptional()
  @IsIn(["Male", "Female", "Other"])
  gender?: string;

  @ApiPropertyOptional({ example: "Software Engineer" })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional({ example: "Acme Corp" })
  @IsOptional()
  @IsString()
  employerName?: string;

  @ApiPropertyOptional({ example: 150000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyIncome?: number;

  @ApiPropertyOptional({ example: "123 Main St" })
  @IsOptional()
  @IsString()
  addressLine?: string;

  @ApiPropertyOptional({ example: "Colombo" })
  @IsOptional()
  @IsString()
  city?: string;
}
