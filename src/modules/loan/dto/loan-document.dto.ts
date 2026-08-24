import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { KYCDocumentType } from '../../../shared/types';

const KYC_DOCUMENT_TYPES: KYCDocumentType[] = [
  'National ID / Passport',
  'Proof of Address',
  'Pay Slip / Bank Statement',
  'Guarantor ID',
  'Business Registration',
];

/** Step 1 - ask the server for a presigned PUT URL. */
export class PresignDocumentDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;

  @IsIn(KYC_DOCUMENT_TYPES)
  documentType: KYCDocumentType;
}

/** Step 2 - confirm the object exists and attach it to the loan KYC. */
export class AttachDocumentDto {
  @IsString()
  @IsNotEmpty()
  documentId: string;

  @IsString()
  @IsNotEmpty()
  key: string;

  @IsIn(KYC_DOCUMENT_TYPES)
  documentType: KYCDocumentType;

  @IsString()
  @IsNotEmpty()
  fileName: string;
}