import { IsJWT, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description:
      'Long-lived refresh token previously returned by `POST /api/auth/login` or `POST /api/auth/refresh`. ' +
      'Access tokens are rejected here.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsJWT()
  @IsNotEmpty()
  refreshToken!: string;
}