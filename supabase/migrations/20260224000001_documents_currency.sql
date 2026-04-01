-- ============================================================
-- Migration: documents_currency
-- Ajoute le support multi-devises aux documents :
--   currency                  : devise ISO 4217 d'origine (ex: "USD", "EUR")
--   amount_original_currency  : montant TTC d'origine (avant conversion en EUR)
-- ============================================================

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS amount_original_currency NUMERIC;
