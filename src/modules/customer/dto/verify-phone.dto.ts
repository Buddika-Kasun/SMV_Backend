import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Length, Matches } from "class-validator";

export class SendPhoneOtpDto {
  @ApiProperty({
    description: "Sri Lankan phone number (digits only or with +94 prefix).",
    example: "0771234567",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+?94|0)?[0-9]{9,10}$/, {
    message: "phone must be a valid Sri Lankan number",
  })
  phone!: string;
}

export class VerifyPhoneOtpDto {
  @ApiProperty({
    description: "Sri Lankan phone number.",
    example: "0771234567",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+?94|0)?[0-9]{9,10}$/, {
    message: "phone must be a valid Sri Lankan number",
  })
  phone!: string;

  @ApiProperty({
    description: "6-digit OTP code sent to the phone.",
    example: "123456",
  })
  @IsString()
  @Length(4, 4, { message: "code must be exactly 4 digits" })
  @Matches(/^[0-9]{4}$/, { message: "code must contain only digits" })
  code!: string;
}
