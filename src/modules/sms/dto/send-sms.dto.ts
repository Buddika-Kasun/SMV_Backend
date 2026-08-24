import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class SendSmsDto {
  @IsString()
  @IsNotEmpty()
  recipient!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsString()
  loanId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;
}