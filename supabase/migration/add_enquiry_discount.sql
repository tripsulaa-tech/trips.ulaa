-- ============================================================================
-- Adds a "Discount" concept to enquiries, replacing the admin's ability to
-- freely overwrite total_amount with a fixed-price + discount model.
--
--   enquiries.discount_amount - flat rupee amount knocked off the trip's
--     list price (the early-bird/normal price on upcoming_trips, or
--     whatever total_amount was already quoted at) for this specific
--     booking. Defaults to 0 (no discount). The app computes
--     total_amount := list_price - discount_amount itself and writes both
--     together, so total_amount's existing meaning ("amount the customer
--     owes") and every downstream balance/revenue calculation that already
--     reads it are completely unaffected — this only changes how the admin
--     arrives at that number in the Track Payment / Bulk Edit UI.
--
--   enquiries.discount_reason - optional free-text note on why the
--     discount was given (e.g. "repeat customer", "referral", "price match")
--     so there's a record to refer back to later. Not required — an admin
--     can apply a discount without one.
--
-- Manual-entry/general enquiries with no trip_id (no list price to discount
-- from) are unaffected and keep entering total_amount directly, same as
-- today.
-- ============================================================================

alter table public.enquiries
  add column discount_amount numeric(10, 2) not null default 0,
  add column discount_reason text;

alter table public.enquiries
  add constraint enquiries_discount_amount_check check (discount_amount >= 0);
