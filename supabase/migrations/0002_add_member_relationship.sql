-- Adds a "relationship to applicant" field to household_members (e.g. "Parent", "Spouse").
-- Display/organization only — no eligibility criterion in src/engine.ts reads this column.
-- Run this once in the Supabase SQL Editor, after 0001_init.sql.

alter table public.household_members
  add column relationship text not null default 'unspecified'
  check (relationship in ('self', 'spouse', 'parent', 'child', 'sibling', 'other_relative', 'domestic_helper', 'unspecified'));

update public.household_members set relationship = 'self' where is_applicant = true;
