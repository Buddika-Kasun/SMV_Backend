import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConsultancyDto {
  @ApiProperty({ description: "Customer's full name.", example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @ApiProperty({ description: "Customer's contact phone number.", example: '+94 77 123 4567' })
  @IsString()
  @IsNotEmpty()
  customerPhone!: string;

  @ApiPropertyOptional({
    description: "Customer's e-mail address.",
    format: 'email',
    example: 'john.doe@example.com',
  })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiProperty({ description: 'National identity card or passport number.', example: '199012345678' })
  @IsString()
  @IsNotEmpty()
  nationalIdNumber!: string;

  @ApiProperty({ description: 'Bank where the funds are placed.', example: 'Commercial Bank' })
  @IsString()
  @IsNotEmpty()
  bankName!: string;

  @ApiProperty({ description: 'Bank account number holding the placement.', example: '8001234567' })
  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @ApiProperty({
    description: 'Balance shown on the latest bank statement for the account.',
    example: 1250000,
  })
  @IsNumber()
  lastStatementBalance!: number;

  @ApiPropertyOptional({
    description: 'Date of the latest statement.',
    example: '2025-01-31',
  })
  @IsOptional()
  @IsString()
  lastStatementDate?: string;

  @ApiProperty({ description: 'Amount placed under the consultancy agreement.', example: 1000000, minimum: 1 })
  @IsNumber()
  @Min(1)
  placedAmount!: number;

  @ApiProperty({ description: 'Agreement start date.', example: '2025-02-01' })
  @IsString()
  @IsNotEmpty()
  startDate!: string;

  @ApiPropertyOptional({
    description: 'Monthly consultancy fee charged on the placement. Omit to use the platform default.',
    example: 5000,
  })
  @IsOptional()
  @IsNumber()
  monthlyConsultancyFee?: number;

  @ApiPropertyOptional({ description: 'Free-form notes about the agreement.', example: '12-month fixed deposit.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

const RETURN_METHODS = ['Bank Transfer', 'Cheque', 'Cash', 'Direct Deposit'];

export class ReturnFundsDto {
  @ApiProperty({ description: 'Date the funds were returned to the customer.', example: '2026-02-01' })
  @IsString()
  @IsNotEmpty()
  returnDate!: string;

  @ApiProperty({ description: 'Total amount returned (principal plus accrued returns).', example: 1080000 })
  @IsNumber()
  returnedAmount!: number;

  @ApiProperty({
    enum: RETURN_METHODS,
    description: 'Channel used to return the funds.',
    example: 'Bank Transfer',
  })
  @IsIn(RETURN_METHODS)
  paymentMethod!: 'Bank Transfer' | 'Cheque' | 'Cash' | 'Direct Deposit';

  @ApiProperty({ description: 'Bank reference / cheque number for the return transaction.', example: 'TRX-99182736' })
  @IsString()
  @IsNotEmpty()
  referenceNumber!: string;

  @ApiProperty({ description: 'Name of the staff member who processed the return.', example: 'Kamal Silva' })
  @IsString()
  @IsNotEmpty()
  processedBy!: string;

  @ApiPropertyOptional({ description: 'Optional remarks about the closure.', example: 'Matured - closed at request.' })
  @IsOptional()
  @IsString()
  notes?: string;
}