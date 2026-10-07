-- Align loan_accounts.id default with the schema.
-- Safe no-op: the default already exists in all environments.
ALTER TABLE "loan_accounts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();