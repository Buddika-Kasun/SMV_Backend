-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "customer_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "id_number" TEXT NOT NULL,
    "id_type" TEXT NOT NULL,
    "occupation" TEXT,
    "employer_name" TEXT,
    "monthly_income" DECIMAL(15,2),
    "address" TEXT,
    "city" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guarantors" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "relation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guarantors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "loan_number" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "loan_type" TEXT NOT NULL,
    "requested_amount" DECIMAL(15,2) NOT NULL,
    "disbursed_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "interest_rate_per_annum" DECIMAL(5,2) NOT NULL,
    "term_months" INTEGER NOT NULL,
    "repayment_frequency" TEXT NOT NULL,
    "interest_method" TEXT NOT NULL,
    "processing_fee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "early_settlement_penalty_percent" DECIMAL(5,2) NOT NULL DEFAULT 2.5,
    "purpose" TEXT,
    "status" TEXT NOT NULL,
    "requested_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_date" TIMESTAMP(3),
    "disbursed_date" TIMESTAMP(3),
    "settled_date" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "loan_officer_id" TEXT,
    "approved_by_id" TEXT,
    "disbursed_by_id" TEXT,
    "total_paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "outstanding_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "next_due_date" TIMESTAMP(3),
    "next_due_amount" DECIMAL(15,2),
    "early_settlement_quote" JSONB,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "principal_amount" DECIMAL(15,2) NOT NULL,
    "interest_amount" DECIMAL(15,2) NOT NULL,
    "total_installment" DECIMAL(15,2) NOT NULL,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "remaining_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "late_fee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid_principal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid_interest" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "late_fee_paid" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_documents" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_url" TEXT,
    "status" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "notes" TEXT,

    CONSTRAINT "loan_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_method" TEXT NOT NULL,
    "reference_number" TEXT,
    "received_by_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocated_principal" DECIMAL(15,2),
    "allocated_interest" DECIMAL(15,2),
    "allocated_late_fee" DECIMAL(15,2),
    "installment_numbers_covered" INTEGER[],
    "sms_status" TEXT,
    "sms_recipient" TEXT,
    "sms_message" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_payments" (
    "id" TEXT NOT NULL,
    "installment_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "allocated_amount" DECIMAL(15,2) NOT NULL,
    "allocated_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "loan_id" TEXT,
    "status" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultancy_agreements" (
    "id" TEXT NOT NULL,
    "agreement_number" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "customer_email" TEXT,
    "national_id_number" TEXT NOT NULL,
    "placed_amount" DECIMAL(15,2) NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "maturity_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "passbook_key" TEXT,
    "return_record" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultancy_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "customers_customer_number_key" ON "customers"("customer_number");

-- CreateIndex
CREATE UNIQUE INDEX "loans_loan_number_key" ON "loans"("loan_number");

-- CreateIndex
CREATE UNIQUE INDEX "loans_account_number_key" ON "loans"("account_number");

-- CreateIndex
CREATE INDEX "installments_loan_id_status_idx" ON "installments"("loan_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "installments_loan_id_installment_number_key" ON "installments"("loan_id", "installment_number");

-- CreateIndex
CREATE UNIQUE INDEX "loan_documents_loan_id_document_type_key" ON "loan_documents"("loan_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "installment_payments_installment_id_payment_id_key" ON "installment_payments"("installment_id", "payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "consultancy_agreements_agreement_number_key" ON "consultancy_agreements"("agreement_number");

-- AddForeignKey
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_loan_officer_id_fkey" FOREIGN KEY ("loan_officer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_disbursed_by_id_fkey" FOREIGN KEY ("disbursed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_documents" ADD CONSTRAINT "loan_documents_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
