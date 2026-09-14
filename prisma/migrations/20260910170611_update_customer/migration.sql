/*
  Warnings:

  - You are about to drop the column `address` on the `customers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "customers" DROP COLUMN "address",
ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "date_of_birth" TIMESTAMP(3),
ADD COLUMN     "gender" TEXT;
