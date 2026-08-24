import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { KYCData } from '../../../shared/types';

export class ApproveLoanDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectLoanDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class DisburseLoanDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateKYCDto {
  @IsObject()
  kycData: Partial<KYCData>;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}