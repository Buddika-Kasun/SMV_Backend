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
import {
  InterestMethod,
  LoanType,
  RepaymentFrequency,
} from '../../../shared/types';

const LOAN_TYPES = ['Instant Personal', 'Standard Personal', 'Business Expansion', 'Micro Enterprise', 'Emergency Quick'];
const FREQUENCIES = ['Monthly', 'Bi-Weekly', 'Weekly'];
const METHODS = ['Flat Rate', 'Reducing Balance'];

export class CreateLoanDto {
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsString()
  @IsNotEmpty()
  nationalIdNumber: string;

  @IsIn(LOAN_TYPES)
  loanType: LoanType;

  @IsNumber()
  @Min(0.01)
  requestedAmount: number;

  @IsNumber()
  @Min(1)
  interestRatePerAnnum: number;

  @IsInt()
  @Min(1)
  termMonths: number;

  @IsIn(FREQUENCIES)
  repaymentFrequency: RepaymentFrequency;

  @IsIn(METHODS)
  interestMethod: InterestMethod;

  @IsString()
  @IsNotEmpty()
  purpose: string;

  @IsNumber()
  monthlyIncome: number;

  @IsString()
  occupation: string;

  @IsString()
  employerName: string;

  @IsString()
  @IsNotEmpty()
  addressLine: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  postalCode: string;

  @IsString()
  guarantorName: string;

  @IsString()
  guarantorPhone: string;

  @IsString()
  guarantorRelation: string;

  @IsString()
  bankName: string;

  @IsString()
  accountNumber: string;
}