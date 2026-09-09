-- CTS : boost de budget (renouvellement mode BUDGET_BOOST).
-- Idempotent, sans perte.

ALTER TABLE "TechnicalAccount" ADD COLUMN IF NOT EXISTS "budgetBoost" INTEGER NOT NULL DEFAULT 0;
