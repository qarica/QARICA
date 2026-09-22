-- Align checklist response storage with the structured JSON used by Monitoring APIs and RPCs.
-- Current production has no checklist_responses rows, so this is a metadata/type correction before go-live data is created.
alter table public.checklist_responses
  alter column answer_value type jsonb
  using case
    when answer_value is null or btrim(answer_value) = '' then null
    else answer_value::jsonb
  end;

comment on column public.checklist_responses.answer_value is
  'Structured checklist response payload: selected value/context/evidence/follow-up/correction/confirmation as JSON.';
