-- =============================================================================
-- One-time cleanup: paid orders with no buyer identity, no shipment, and
-- amounts matching the old demo product prices ($12,400 / $8,900 / $15,200).
--
-- Run in Supabase → SQL Editor. Inspect the SELECT first; then uncomment DELETE.
-- =============================================================================

SELECT
  id,
  amount,
  payment_status,
  email,
  customer_name,
  created_at,
  tracking_number
FROM public.orders
WHERE payment_status = 'paid'
  AND shipped_at IS NULL
  AND COALESCE(TRIM(tracking_number), '') = ''
  AND COALESCE(TRIM(email), '') = ''
  AND COALESCE(TRIM(customer_name), '') = ''
  AND amount IN (12400, 8900, 15200);

-- Uncomment after the preview rows match what you want to remove:
-- DELETE FROM public.orders
-- WHERE payment_status = 'paid'
--   AND shipped_at IS NULL
--   AND COALESCE(TRIM(tracking_number), '') = ''
--   AND COALESCE(TRIM(email), '') = ''
--   AND COALESCE(TRIM(customer_name), '') = ''
--   AND amount IN (12400, 8900, 15200);
