import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../shared/types';

export class CreateUserDto {
  @ApiProperty({ description: "User's display name.", example: 'Nimal Perera' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({
    description: 'Unique login name (minimum 4 characters).',
    example: 'nperera',
    minLength: 4,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  username!: string;

  @ApiProperty({
    description: 'Initial password (minimum 6 characters).',
    example: 'Secret@123',
    minLength: 6,
    writeOnly: true,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @ApiProperty({
    enum: ['admin', 'manager', 'staff'],
    description: 'Role assigned to the user.',
    example: 'staff',
  })
  @IsIn(['admin', 'manager', 'staff'])
  role!: UserRole;

  @ApiProperty({ description: 'Job title / designation.', example: 'Loan Officer' })
  @IsString()
  @IsNotEmpty()
  designation!: string;

  @ApiPropertyOptional({
    description: 'Contact e-mail address.',
    format: 'email',
    example: 'nimal@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Contact phone number.', example: '+94 77 123 4567' })
  @IsOptional()
  @IsString()
  phone?: string;
}