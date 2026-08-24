import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { EarlySettlementQuote, PaymentRecord } from '../../../shared/types';

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Debit/Credit Card', 'Direct Debit', 'Cheque'];

export class RecordPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsIn(PAYMENT_METHODS)
  paymentMethod: PaymentRecord['paymentMethod'];

  @IsString()
  @IsNotEmpty()
  referenceNumber: string;

  @IsString()
  @IsNotEmpty()
  receivedBy: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  paymentDate?: string;
}

export class ExecuteSettlementDto {
  /** Optional — the server always recomputes the authoritative quote. */
  @IsOptional()
  @IsObject()
  quote?: EarlySettlementQuote;

  @IsIn(PAYMENT_METHODS)
  paymentMethod: PaymentRecord['paymentMethod'];

  @IsString()
  @IsNotEmpty()
  referenceNumber: string;

  @IsString()
  @IsNotEmpty()
  receivedBy: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  settlementDate?: string;
}