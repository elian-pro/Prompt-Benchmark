-- ============================================================
-- Drop the unused `location` column from clients.
-- The field is no longer collected or shown anywhere in the app;
-- segment is now a fixed set of chips and location added no value.
-- Run once in the Supabase SQL Editor.
--
-- NOTE: this is irreversible — any data stored in `location` is lost.
-- ============================================================

alter table clients
  drop column if exists location;
