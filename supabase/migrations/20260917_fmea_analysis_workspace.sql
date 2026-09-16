-- Canonical FMEA/HFMEA analysis workspace fields.
-- Additive only: preserves existing data and legacy columns.

alter table if exists public.fmea_process_steps
  add column if not exists sequence_no integer,
  add column if not exists step_name text,
  add column if not exists step_description text;

alter table if exists public.fmea_failure_modes
  add column if not exists process_step_id uuid,
  add column if not exists sequence_no integer,
  add column if not exists failure_mode text,
  add column if not exists potential_effect text,
  add column if not exists potential_cause text,
  add column if not exists current_controls text,
  add column if not exists severity_score integer,
  add column if not exists occurrence_score integer,
  add column if not exists detection_score integer,
  add column if not exists rpn integer,
  add column if not exists is_high_priority boolean not null default false;

create index if not exists idx_fmea_steps_study_sequence
  on public.fmea_process_steps(fmea_study_id, sequence_no);

create index if not exists idx_fmea_modes_study_step_sequence
  on public.fmea_failure_modes(fmea_study_id, process_step_id, sequence_no);
