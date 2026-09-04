-- ============================================================================
-- Lets admin recognize, at a glance, which enquiries have a "Child Fare"
-- add-on applied (see AdminGenerateInvoiceModal.tsx's Child Fare chip on
-- the Extra Charge invoice type) — without having to open each enquiry and
-- read through its payment history notes.
--
--   enquiries.has_child_addon - true once an Extra Charge with the "Child
--     fare" note has been added to this enquiry via Generate Invoice / Add
--     Invoice. Purely a display flag (drives a small badge in the
--     Enquiries list and on the enquiry detail header) — it doesn't affect
--     capacity, pricing, or anything else on its own. Defaults to false;
--     never automatically cleared (matches closed_reason/cancellation_
--     reason's own "sticky until explicitly changed" precedent elsewhere
--     in this schema), since a child fare that was added and later refunded
--     is still worth remembering was there.
-- ============================================================================

alter table public.enquiries
  add column has_child_addon boolean not null default false;
