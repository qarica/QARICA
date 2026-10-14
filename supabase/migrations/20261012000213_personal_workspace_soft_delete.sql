-- RECONCILIATION: đã áp trực tiếp lên Supabase sống ngày 2026-10-12, không qua repo.
-- Phase 0: recoverable deletion of personal workspace records.
-- Additive migration only; existing records remain active.
ALTER TABLE public.personal_workspace_items
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS personal_workspace_items_owner_active_idx
  ON public.personal_workspace_items (owner_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.personal_workspace_items.deleted_at IS
  'NULL means active; non-NULL means in the owner recycle bin. Retain records for explicit recovery.';

-- Enforce owner-only operations with existing RLS policies.
-- No hard-delete privilege is revoked here because other legacy flows may rely on it.
