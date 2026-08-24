import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Initiates a passbook upload: the server builds an object key and returns a
 * presigned PUT URL the client uploads the file bytes to directly.
 */
export class PresignPassbookDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;
}

/**
 * Confirms the upload: the client sends back the object key it uploaded to,
 * the server verifies the object exists and persists the key + presigned GET URL.
 */
export class ConfirmPassbookDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsOptional()
  @IsString()
  fileName?: string;
}