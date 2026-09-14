import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  InterestMethod,
  LoanType,
  RepaymentFrequency,
} from '../../../shared/types';

const LOAN_TYPES = ['Instant Personal', 'Standard Personal', 'Business Expansion', 'Micro Enterprise', 'Emergency Quick'];
const FREQUENCIES = ['Monthly', 'Bi-Weekly', 'Weekly'];
const METHODS = ['Flat Rate', 'Reducing Balance'];

export class CreateLoanDto {
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

  @ApiProperty({
    enum: LOAN_TYPES,
    description: 'Product type requested by the customer.',
    example: 'Standard Personal',
  })
  @IsIn(LOAN_TYPES)
  loanType!: LoanType;

  @ApiProperty({ description: 'Amount the customer wishes to borrow.', example: 250000, minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  requestedAmount!: number;

  @ApiProperty({ description: 'Nominal annual interest rate in percent.', example: 24, minimum: 1 })
  @IsNumber()
  @Min(1)
  interestRatePerAnnum!: number;

  @ApiProperty({ description: 'Loan term in months.', example: 12, minimum: 1 })
  @IsInt()
  @Min(1)
  termMonths!: number;

  @ApiProperty({
    enum: FREQUENCIES,
    description: 'How often installments fall due.',
    example: 'Monthly',
  })
  @IsIn(FREQUENCIES)
  repaymentFrequency!: RepaymentFrequency;

  @ApiProperty({
    enum: METHODS,
    description: 'Interest calculation method applied to the schedule.',
    example: 'Flat Rate',
  })
  @IsIn(METHODS)
  interestMethod!: InterestMethod;

  @ApiProperty({ description: 'Stated purpose of the loan.', example: 'Home renovation' })
  @IsString()
  @IsNotEmpty()
  purpose!: string;

  @ApiProperty({ description: "Customer's declared monthly income.", example: 85000 })
  @IsNumber()
  monthlyIncome!: number;

  @ApiProperty({ description: "Customer's current occupation.", example: 'Software Engineer' })
  @IsString()
  occupation!: string;

  @ApiProperty({ description: "Customer's employer / business name.", example: 'ABC (Pvt) Ltd' })
  @IsString()
  employerName!: string;

  @ApiProperty({ description: 'Street address line.', example: 'No. 12, Galle Road' })
  @IsString()
  @IsNotEmpty()
  addressLine!: string;

  @ApiProperty({ description: 'City name.', example: 'Colombo' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ description: 'Postal / ZIP code.', example: '00300' })
  @IsString()
  postalCode!: string;

  @ApiProperty({ description: "Guarantor's full name.", example: 'Kamal Silva' })
  @IsString()
  guarantorName!: string;

  @ApiProperty({ description: "Guarantor's contact phone number.", example: '+94 71 987 6543' })
  @IsString()
  guarantorPhone!: string;

  @ApiProperty({ description: "Guarantor's relationship to the customer.", example: 'Brother' })
  @IsString()
  guarantorRelation!: string;

  @ApiProperty({ description: "Customer's bank name for disbursement/collection.", example: 'Commercial Bank' })
  @IsString()
  bankName!: string;

  @ApiProperty({ description: "Customer's bank account number.", example: '8001234567' })
  @IsString()
  accountNumber!: string;
}