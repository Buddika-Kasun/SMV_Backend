/*
  Warnings:

  - A unique constraint covering the columns `[account_id]` on the table `loans` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "loans" ADD COLUMN     "account_id" TEXT;

-- CreateTable
CREATE TABLE "loan_accounts" (
    "id" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "disbursed_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_collected" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "remaining_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loan_accounts_account_number_key" ON "loan_accounts"("account_number");

-- CreateIndex
CREATE UNIQUE INDEX "loans_account_id_key" ON "loans"("account_id");

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "loan_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
