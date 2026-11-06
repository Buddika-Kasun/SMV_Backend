-- AlterTable
ALTER TABLE "loans" ADD COLUMN     "penaltyAmount" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "penaltyLastAccrued" TIMESTAMP(3);
