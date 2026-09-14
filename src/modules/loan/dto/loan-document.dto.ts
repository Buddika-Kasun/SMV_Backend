import { IsIn, IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { KYCDocumentType } from "../../../shared/types";

const KYC_DOCUMENT_TYPES: KYCDocumentType[] = [
  "National ID / Passport",
  "Proof of Address",
  "Pay Slip / Bank Statement",
  "Guarantor ID",
  "Business Registration",
];

/** Step 1 - ask the server for a presigned PUT URL. */
export class PresignDocumentDto {
  @ApiProperty({
    description:
      "Original file name of the document (used to build the storage key).",
    example: "national-id-front.jpg",
  })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({
    description:
      "MIME type of the uploaded file; must match the Content-Type used for the PUT.",
    example: "image/jpeg",
  })
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @ApiProperty({
    enum: KYC_DOCUMENT_TYPES,
    description: "KYC category this document belongs to.",
    example: "National ID / Passport",
  })
  @IsIn(KYC_DOCUMENT_TYPES)
  documentType!: KYCDocumentType;
}

/** Step 2 - confirm the object exists and attach it to the loan KYC. */
export class AttachDocumentDto {
  @ApiProperty({
    description: "`documentId` previously returned by the presign endpoint.",
    example: "DOC-8F3A21BC",
  })
  @IsString()
  @IsNotEmpty()
  documentId!: string;

  @ApiProperty({
    description:
      "Object key previously returned by the presign endpoint, after a successful upload.",
    example: "loans/clx123/kyc/national-id-front.jpg",
  })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({
    enum: KYC_DOCUMENT_TYPES,
    description: "KYC category this document belongs to.",
    example: "National ID / Passport",
  })
  @IsIn(KYC_DOCUMENT_TYPES)
  documentType!: KYCDocumentType;

  @ApiProperty({
    description: "Display file name stored with the document record.",
    example: "national-id-front.jpg",
  })
  @IsString()
  @IsNotEmpty()
  fileName!: string;
}
