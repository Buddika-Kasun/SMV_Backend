-- CreateTable
CREATE TABLE "penalty_payments" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "paymentId" TEXT,
    "paidDate" TIMESTAMP(3) NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL,
    "remainingAmount" DOUBLE PRECISION NOT NULL,
    "penaltySnapshot" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "penalty_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "penalty_payments_loanId_paidDate_idx" ON "penalty_payments"("loanId", "paidDate");

-- AddForeignKey
ALTER TABLE "penalty_payments" ADD CONSTRAINT "penalty_payments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
