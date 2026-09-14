import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EarlySettlementQuote, PaymentRecord } from "../../../shared/types";

const PAYMENT_METHODS = [
  "Cash",
  "Bank_Transfer",
  "Debit_Credit_Card",
  "Direct_Debit",
  "Cheque",
];

export class RecordPaymentDto {
  @ApiProperty({
    description: "Amount received in the payment currency.",
    example: 25000,
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty({
    enum: PAYMENT_METHODS,
    description: "Channel through which the payment was received.",
    example: "Cash",
  })
  @IsIn(PAYMENT_METHODS)
  paymentMethod!: string;

  @ApiProperty({
    description: "Receipt / transaction reference number.",
    example: "RCP-20250114-001",
  })
  @IsString()
  @IsNotEmpty()
  referenceNumber!: string;

  @ApiProperty({
    description: "Name of the staff member who received the payment.",
    example: "Nimal Perera",
  })
  @IsString()
  @IsNotEmpty()
  receivedBy!: string;

  @ApiPropertyOptional({
    description: "Optional remarks recorded with the payment.",
    example: "Installment 3.",
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: "Payment date (defaults to now when omitted).",
    example: "2025-01-14",
  })
  @IsOptional()
  @IsString()
  paymentDate?: string;
}

export class ExecuteSettlementDto {
  @ApiPropertyOptional({
    description:
      "Advisory only - the server always recomputes the authoritative settlement quote before closing the loan.",
    type: Object,
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  quote?: EarlySettlementQuote;

  @ApiProperty({
    enum: PAYMENT_METHODS,
    description: "Channel through which the settlement amount was received.",
    example: "Bank Transfer",
  })
  @IsIn(PAYMENT_METHODS)
  paymentMethod!: string;

  @ApiProperty({
    description: "Receipt / transaction reference number.",
    example: "SET-20250201-001",
  })
  @IsString()
  @IsNotEmpty()
  referenceNumber!: string;

  @ApiProperty({
    description: "Name of the staff member who received the settlement.",
    example: "Kamal Silva",
  })
  @IsString()
  @IsNotEmpty()
  receivedBy!: string;

  @ApiPropertyOptional({
    description: "Optional remarks recorded with the settlement.",
    example: "Full early settlement.",
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: "Settlement date (defaults to now when omitted).",
    example: "2025-02-01",
  })
  @IsOptional()
  @IsString()
  settlementDate?: string;
}
