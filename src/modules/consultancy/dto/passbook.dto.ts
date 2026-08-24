import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Initiates a passbook upload: the server builds an object key and returns a
 * presigned PUT URL the client uploads the file bytes to directly.
 */
export class PresignPassbookDto {
  @ApiProperty({
    description: 'Original file name of the passbook scan (used to build the storage key).',
    example: 'passbook-john-doe.pdf',
  })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({
    description: 'MIME type of the uploaded file; must match the Content-Type used for the PUT.',
    example: 'application/pdf',
  })
  @IsString()
  @IsNotEmpty()
  contentType!: string;
}

/**
 * Confirms the upload: the client sends back the object key it uploaded to,
 * the server verifies the object exists and persists the key + presigned GET URL.
 */
export class ConfirmPassbookDto {
  @ApiProperty({
    description: 'Object key previously returned by the presign endpoint, after a successful upload.',
    example: 'consultancy/clx123/passbook/passbook-john-doe.pdf',
  })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiPropertyOptional({
    description: 'Display name to store alongside the passbook document.',
    example: 'passbook-john-doe.pdf',
  })
  @IsOptional()
  @IsString()
  fileName?: string;
}