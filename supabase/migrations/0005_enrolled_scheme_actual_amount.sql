-- Lets a household record what they actually receive from an enrolled scheme, when it differs
-- from our formula estimate (e.g. a discretionary ComCare payout, or a means-tested scheme paying
-- less than its theoretical max for reasons the formula doesn't model). Nullable — unset means
-- "use our estimate", not "receiving $0". Run this once in the Supabase SQL Editor, after 0001-0004.

alter table public.enrolled_schemes
  add column actual_amount numeric;
