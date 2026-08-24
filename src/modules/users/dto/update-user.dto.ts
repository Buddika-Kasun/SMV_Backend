import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../shared/types';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: "Updated display name.", example: 'Nimal K. Perera' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ description: 'Updated contact e-mail address.', format: 'email', example: 'nimal@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Updated contact phone number.', example: '+94 77 123 4567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Updated job title / designation.', example: 'Senior Loan Officer' })
  @IsOptional()
  @IsString()
  designation?: string;

  @ApiPropertyOptional({
    enum: ['admin', 'manager', 'staff'],
    description: 'Updated role. Only one active admin account is permitted.',
    example: 'manager',
  })
  @IsOptional()
  @IsIn(['admin', 'manager', 'staff'])
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Activate or deactivate the account.', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Replacement password (minimum 6 characters). Omit to keep the current password.',
    example: 'NewSecret@123',
    minLength: 6,
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}