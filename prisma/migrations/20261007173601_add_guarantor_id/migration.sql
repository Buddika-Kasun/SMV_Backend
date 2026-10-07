-- AlterTable
ALTER TABLE "guarantors" ADD COLUMN     "idNumber" TEXT;

-- AlterTable
ALTER TABLE "loan_accounts" ALTER COLUMN "id" DROP DEFAULT;
