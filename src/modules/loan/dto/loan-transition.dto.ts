import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KYCData } from '../../../shared/types';

export class ApproveLoanDto {
  @ApiPropertyOptional({ description: 'Optional approval note stored with the decision.', example: 'Verified against payslip.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectLoanDto {
  @ApiProperty({ description: 'Reason for rejecting the application.', example: 'Insufficient monthly income.' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class DisburseLoanDto {
  @ApiPropertyOptional({ description: 'Optional disbursement note.', example: 'Released via bank transfer.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateKYCDto {
  @ApiProperty({
    description:
      'Partial KYC payload merged into the loan record. Recognised keys follow the KYCData contract ' +
      '(nationalIdNumber, idType, dateOfBirth, gender, occupation, employerName, monthlyIncome, addressLine, city, ' +
      'postalCode, guarantorName, guarantorPhone, guarantorRelation, bankName, accountNumber).',
    example: { occupation: 'Software Engineer', monthlyIncome: 85000 },
    type: Object,
    additionalProperties: true,
  })
  @IsObject()
  kycData!: Partial<KYCData>;

  @ApiPropertyOptional({
    description: 'Set true to mark KYC verified (moves the loan to Approved - Pending Disbursement).',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}