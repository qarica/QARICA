-- QARICA shared quality/safety domains V1
-- Standalone-first taxonomy shared by Incident, CAPA, Risk, FMEA, Indicator and Improvement.

create table if not exists public.quality_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(code) <> ''),
  check (btrim(name) <> '')
);

create unique index if not exists ux_quality_domains_scope_code
  on public.quality_domains (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(code));
create index if not exists idx_quality_domains_org_active_sort
  on public.quality_domains (organization_id, is_active, sort_order, name);

create table if not exists public.record_quality_domain_links (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records(id) on delete cascade,
  domain_id uuid not null references public.quality_domains(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(record_id, domain_id)
);

create index if not exists idx_record_quality_domain_links_record
  on public.record_quality_domain_links(record_id);
create index if not exists idx_record_quality_domain_links_domain
  on public.record_quality_domain_links(domain_id);

alter table public.quality_domains enable row level security;
alter table public.record_quality_domain_links enable row level security;
revoke all on table public.quality_domains from public, anon, authenticated;
revoke all on table public.record_quality_domain_links from public, anon, authenticated;
grant select, insert, update, delete on table public.quality_domains to service_role;
grant select, insert, update, delete on table public.record_quality_domain_links to service_role;

insert into public.quality_domains(code,name,description,sort_order)
select v.code,v.name,v.description,v.sort_order
from (values
  ('PATIENT_FAMILY','Người bệnh & gia đình','Yếu tố liên quan người bệnh, gia đình, hành vi, nhu cầu hoặc phối hợp chăm sóc.',10),
  ('CLINICAL_CARE','Chăm sóc lâm sàng','Đánh giá, chẩn đoán, theo dõi, điều trị và các hoạt động chăm sóc lâm sàng.',20),
  ('MEDICATION','Thuốc & dược','Kê đơn, cấp phát, bảo quản, sử dụng, theo dõi và an toàn thuốc.',30),
  ('PROCEDURE_SURGERY','Thủ thuật & phẫu thuật','Quy trình thủ thuật, can thiệp, phẫu thuật và kiểm soát liên quan.',40),
  ('INFECTION_CONTROL','Kiểm soát nhiễm khuẩn','Phòng ngừa, giám sát và kiểm soát nhiễm khuẩn.',50),
  ('EQUIPMENT_INFRA','Thiết bị & cơ sở hạ tầng','Trang thiết bị, vật tư, cơ sở hạ tầng và điều kiện kỹ thuật.',60),
  ('COMMUNICATION_HANDOFF','Giao tiếp & bàn giao','Trao đổi thông tin, hội chẩn, bàn giao, phối hợp liên chuyên khoa/liên khoa.',70),
  ('WORKFORCE_ENVIRONMENT','Nhân lực & môi trường làm việc','Nhân lực, phân công, năng lực, tải công việc, điều kiện và môi trường làm việc.',80),
  ('INFORMATION_IT','Thông tin, hồ sơ & CNTT','Hồ sơ, biểu mẫu, dữ liệu, hệ thống thông tin và công nghệ.',90),
  ('GOVERNANCE_SYSTEM','Quản trị, quy trình & hệ thống','Chính sách, quy trình, quản trị, thiết kế hệ thống và cơ chế giám sát.',100)
) as v(code,name,description,sort_order)
where not exists (
  select 1 from public.quality_domains q
  where q.organization_id is null and lower(q.code)=lower(v.code)
);

create or replace function public.qlcl_set_record_quality_domains_v1(
  p_record_id uuid,
  p_actor_user_id uuid,
  p_domain_ids jsonb default '[]'::jsonb
) returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_org_id uuid;
  v_domain_text text;
  v_domain_id uuid;
  v_count integer := 0;
begin
  if p_actor_user_id is null then raise exception 'actor_user_id is required'; end if;
  if jsonb_typeof(coalesce(p_domain_ids,'[]'::jsonb)) <> 'array' then
    raise exception 'domain_ids must be a JSON array';
  end if;

  select organization_id into v_org_id from public.records where id=p_record_id;
  if v_org_id is null then raise exception 'Record not found'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id=p_actor_user_id and p.organization_id=v_org_id and p.is_active
  ) then raise exception 'Actor is invalid or outside organization'; end if;

  for v_domain_text in
    select distinct value from jsonb_array_elements_text(coalesce(p_domain_ids,'[]'::jsonb))
  loop
    begin v_domain_id := v_domain_text::uuid;
    exception when others then raise exception 'Invalid domain id: %', v_domain_text;
    end;
    if not exists (
      select 1 from public.quality_domains q
      where q.id=v_domain_id and q.is_active
        and (q.organization_id is null or q.organization_id=v_org_id)
    ) then raise exception 'Quality domain % is inactive or outside organization', v_domain_id;
    end if;
  end loop;

  delete from public.record_quality_domain_links where record_id=p_record_id;

  insert into public.record_quality_domain_links(record_id,domain_id,created_by)
  select p_record_id, value::uuid, p_actor_user_id
  from (
    select distinct value from jsonb_array_elements_text(coalesce(p_domain_ids,'[]'::jsonb))
  ) x;
  get diagnostics v_count = row_count;

  insert into public.audit_logs(
    actor_user_id,record_id,table_name,row_id,action_type,new_value,reason,request_meta
  ) values (
    p_actor_user_id,p_record_id,'record_quality_domain_links',p_record_id,'SET_QUALITY_DOMAINS',
    jsonb_build_object('domain_ids',coalesce(p_domain_ids,'[]'::jsonb),'count',v_count),
    'Cập nhật lĩnh vực chất lượng/an toàn dùng chung.',
    jsonb_build_object('source','qlcl-ui','transaction','qlcl_set_record_quality_domains_v1')
  );

  return v_count;
end;
$function$;

revoke all on function public.qlcl_set_record_quality_domains_v1(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.qlcl_set_record_quality_domains_v1(uuid,uuid,jsonb) to service_role;
