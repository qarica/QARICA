-- Action evidence policy + private personal reminders
alter table public.actions
  add column if not exists evidence_required boolean not null default true;

comment on column public.actions.evidence_required is
  'Whether execution evidence is mandatory before submission/verification. Defaults true for backward compatibility.';
