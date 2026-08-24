import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateConsultancyDto {
  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @IsString()
  @IsNotEmpty()
  customerPhone!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsString()
  @IsNotEmpty()
  nationalIdNumber!: string;

  @IsString()
  @IsNotEmpty()
  bankName!: string;

  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @IsNumber()
  lastStatementBalance!: number;

  @IsOptional()
  @IsString()
  lastStatementDate?: string;

  @IsNumber()
  @Min(1)
  placedAmount!: number;

  @IsString()
  @IsNotEmpty()
  startDate!: string;

  @IsOptional()
  @IsNumber()
  monthlyConsultancyFee?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

const RETURN_METHODS = ['Bank Transfer', 'Cheque', 'Cash', 'Direct Deposit'];

export class ReturnFundsDto {
  @IsString()
  @IsNotEmpty()
  returnDate!: string;

  @IsNumber()
  returnedAmount!: number;

  @IsIn(RETURN_METHODS)
  paymentMethod!: 'Bank Transfer' | 'Cheque' | 'Cash' | 'Direct Deposit';

  @IsString()
  @IsNotEmpty()
  referenceNumber!: string;

  @IsString()
  @IsNotEmpty()
  processedBy!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}