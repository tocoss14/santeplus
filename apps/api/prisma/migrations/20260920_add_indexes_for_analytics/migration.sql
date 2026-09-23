-- Add indexes for analytics query optimization
-- Migration: 20260920_add_indexes_for_analytics
-- Created: 2026-09-20

-- Indexes for Payment table
CREATE INDEX IF NOT EXISTS "Payment_status_initiatedAt_idx" ON "Payment"("status", "initiatedAt");

-- Indexes for Claim table
CREATE INDEX IF NOT EXISTS "Claim_status_paidAt_idx" ON "Claim"("status", "paidAt");
CREATE INDEX IF NOT EXISTS "Claim_status_careDate_idx" ON "Claim"("status", "careDate");
CREATE INDEX IF NOT EXISTS "Claim_providerId_status_idx" ON "Claim"("providerId", "status");
CREATE INDEX IF NOT EXISTS "Claim_status_submittedAt_decidedAt_idx" ON "Claim"("status", "submittedAt", "decidedAt");

-- Indexes for Contract table
CREATE INDEX IF NOT EXISTS "Contract_status_productId_idx" ON "Contract"("status", "productId");
CREATE INDEX IF NOT EXISTS "Contract_status_startDate_endDate_idx" ON "Contract"("status", "startDate", "endDate");

-- Indexes for User table
CREATE INDEX IF NOT EXISTS "User_role_status_createdAt_idx" ON "User"("role", "status", "createdAt");

-- Indexes for CtsJournal table
CREATE INDEX IF NOT EXISTS "CtsJournal_contractId_type_idx" ON "CtsJournal"("contractId", "type");