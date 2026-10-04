-- ============================================================================
-- One-off data fix: a discount (₹299) was applied to an enquiry AFTER its trip
-- was completed. The app saved discount_amount = 299 but left total_amount at
-- the full price (6,999), so:
--
--   saved:     total_amount 6,999 | discount_amount 299 | amount_paid 6,700
--   shown:     Trip Amount 7,298 (= total + discount) | Balance ₹299 | 96% paid
--   should be: total_amount 6,700 | discount_amount 299 | amount_paid 6,700
--              -> Trip Amount 6,999 | Total 6,700 | Balance 0 | 100% paid
--
-- (The app bug is fixed in PaymentFormFields.tsx; this repairs the one row.)
--
-- HOW TO RUN (Supabase -> SQL Editor):
--   1. Run STEP 1 on its own. Confirm it returns exactly ONE row and that it
--      is the right person (Varkala Girls Escape, total 6999, discount 299).
--   2. Copy that row's id into STEP 2 and run it.
--   3. Run STEP 3 to confirm.
-- ============================================================================

-- STEP 1 — find the enquiry (phone +91 77089 56774)
select id, full_name, phone, total_amount, discount_amount, amount_paid,
       is_paid, status, booking_status, journey_stage
from public.enquiries
where regexp_replace(phone, '\D', '', 'g') like '%7708956774'
  and discount_amount = 299
  and total_amount = 6999;

-- STEP 2 — repair it (replace the id below with the one from STEP 1)
update public.enquiries
   set total_amount   = total_amount - discount_amount,        -- 6,999 - 299 = 6,700
       is_paid        = true,
       status         = 'closed',                               -- same as the app does once fully paid
       booking_status = case when booking_status in ('cancelled', 'completed')
                             then booking_status else 'fully_paid' end,
       journey_stage  = case when booking_status = 'completed' then 'completed'
                             when checked_in_at is not null    then 'checked_in'
                             else 'fully_paid' end,
       follow_up_at   = null                                    -- only allowed while status = 'contacted'
 where id = '00000000-0000-0000-0000-000000000000'              -- <-- paste the id from STEP 1
   and total_amount = 6999
   and discount_amount = 299
   and amount_paid = 6700;                                      -- safety: only touches the row that still matches

-- STEP 3 — verify (expect total 6700, discount 299, paid 6700, is_paid true)
select id, full_name, total_amount, discount_amount, amount_paid, is_paid, status, booking_status, journey_stage
from public.enquiries
where id = '00000000-0000-0000-0000-000000000000';           -- <-- same id
