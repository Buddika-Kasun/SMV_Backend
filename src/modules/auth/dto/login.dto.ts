import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'Username of the account to authenticate.', example: 'admin' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({
    description: 'Account password in plain text; never returned by the API.',
    example: 'Admin@123',
    format: 'password',
    writeOnly: true,
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}