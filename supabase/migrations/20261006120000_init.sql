-- AuditReady production schema.
-- Apply with the Supabase CLI or the SQL editor. The service role bypasses RLS;
-- application code may use it only in the vendor-portal route after a token-hash match.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  job_title text not null default '',
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key,
  name text not null,
  slug text not null,
  plan text not null default 'starter' check (plan in ('starter', 'pro', 'business')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index organizations_slug_live_idx on public.organizations (slug) where deleted_at is null;

create table public.memberships (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  user_id uuid not null references public.profiles (id),
  role text not null check (role in ('owner', 'admin', 'analyst', 'viewer')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, user_id)
);

create table public.org_invites (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  email text not null,
  role text not null check (role in ('admin', 'analyst', 'viewer')),
  code_hash text not null unique,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  expires_at timestamptz not null
);

create table public.questionnaire_templates (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  name text not null,
  description text not null default '',
  builtin_key text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.questionnaire_sections (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  template_id uuid not null references public.questionnaire_templates (id),
  title text not null,
  sort_order integer not null default 0
);

create table public.questions (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  template_id uuid not null references public.questionnaire_templates (id),
  section_id uuid not null references public.questionnaire_sections (id),
  prompt text not null,
  help_text text not null default '',
  type text not null check (type in ('yes_no', 'yes_no_na', 'text', 'multiple_choice', 'file_request')),
  options jsonb not null default '[]'::jsonb,
  risk_weight integer not null default 1 check (risk_weight between 1 and 5),
  evidence_required boolean not null default false,
  guidance text not null default '',
  control_ref text not null default '',
  mappings jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  archived_at timestamptz
);

create table public.vendors (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  name text not null,
  website text not null default '',
  service text not null default '',
  category text not null check (category in ('saas', 'cloud_infrastructure', 'professional_services', 'financial', 'hr', 'marketing', 'security', 'other')),
  business_owner text not null default '',
  security_owner text not null default '',
  criticality text not null check (criticality in ('low', 'moderate', 'high', 'critical')),
  criticality_justification text not null default '',
  criticality_factors jsonb not null default '{}'::jsonb,
  data_access text not null check (data_access in ('none', 'internal', 'confidential', 'customer_pii', 'payment', 'regulated')),
  system_access text not null check (system_access in ('none', 'read', 'write', 'production', 'privileged')),
  risk_tier text check (risk_tier in ('low', 'moderate', 'high', 'critical')),
  inherent jsonb,
  assessment_status text not null default 'not_started',
  last_assessment_at date,
  next_review_at date,
  review_frequency text not null default 'annual' check (review_frequency in ('quarterly', 'semiannual', 'annual', 'biennial')),
  overall_risk text check (overall_risk in ('low', 'moderate', 'high', 'critical')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.vendor_contacts (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  vendor_id uuid not null references public.vendors (id),
  name text not null,
  title text not null default '',
  email text not null default '',
  contact_role text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.assessments (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  vendor_id uuid not null references public.vendors (id),
  name text not null,
  type text not null check (type in ('initial', 'reassessment', 'incident', 'ad_hoc')),
  owner_id uuid not null references public.profiles (id),
  template_id uuid not null references public.questionnaire_templates (id),
  previous_assessment_id uuid references public.assessments (id),
  status text not null check (status in ('draft', 'questionnaire_sent', 'vendor_responded', 'in_review', 'remediation', 'approved', 'approved_with_conditions', 'rejected', 'closed')),
  due_date date not null,
  inherent_risk text not null check (inherent_risk in ('low', 'moderate', 'high', 'critical')),
  inherent_score integer not null default 0,
  inherent_override text check (inherent_override in ('low', 'moderate', 'high', 'critical')),
  inherent_justification text not null default '',
  control_risk text not null check (control_risk in ('low', 'moderate', 'high', 'critical')),
  control_score numeric not null default 0,
  control_preliminary boolean not null default true,
  residual_risk text not null check (residual_risk in ('low', 'moderate', 'high', 'critical')),
  residual_override text check (residual_override in ('low', 'moderate', 'high', 'critical')),
  residual_justification text not null default '',
  executive_summary text not null default '',
  analyst_notes text not null default '',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.assessment_questions (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  assessment_id uuid not null references public.assessments (id),
  source_question_id uuid,
  section_title text not null default '',
  prompt text not null,
  help_text text not null default '',
  type text not null,
  options jsonb not null default '[]'::jsonb,
  risk_weight integer not null default 1,
  evidence_required boolean not null default false,
  guidance text not null default '',
  control_ref text not null default '',
  mappings jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0
);

create table public.responses (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  assessment_id uuid not null references public.assessments (id),
  assessment_question_id uuid not null references public.assessment_questions (id),
  answer_boolean boolean,
  answer_na boolean not null default false,
  answer_text text not null default '',
  answer_choice text not null default '',
  document_ids jsonb not null default '[]'::jsonb,
  analyst_result text not null default 'not_reviewed' check (analyst_result in ('pass', 'partial', 'fail', 'na', 'not_reviewed')),
  analyst_notes text not null default '',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  vendor_id uuid not null references public.vendors (id),
  assessment_id uuid references public.assessments (id),
  assessment_question_id uuid,
  finding_id uuid,
  file_name text not null,
  storage_path text not null,
  content_type text not null,
  size_bytes integer not null check (size_bytes >= 0 and size_bytes <= 10485760),
  document_type text not null,
  description text not null default '',
  review_status text not null default 'pending' check (review_status in ('pending', 'accepted', 'rejected', 'needs_update')),
  uploaded_by_id uuid references public.profiles (id),
  uploaded_by_label text not null default '',
  uploaded_at timestamptz not null default now(),
  soc2 jsonb,
  deleted_at timestamptz
);

create table public.findings (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  vendor_id uuid not null references public.vendors (id),
  assessment_id uuid references public.assessments (id),
  assessment_question_id uuid,
  reference text not null,
  title text not null,
  description text not null default '',
  risk text not null check (risk in ('low', 'moderate', 'high', 'critical')),
  recommendation text not null default '',
  vendor_response text not null default '',
  owner_id uuid references public.profiles (id),
  status text not null check (status in ('open', 'vendor_response', 'remediation', 'risk_accepted', 'closed')),
  target_date date,
  closure_date date,
  closure_notes text not null default '',
  closure_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.remediations (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  finding_id uuid not null references public.findings (id),
  required_action text not null,
  vendor_response text not null default '',
  target_date date,
  status text not null check (status in ('open', 'in_progress', 'ready_for_verification', 'verified')),
  closure_document_id uuid,
  analyst_verification text not null default '',
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.risk_acceptances (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  finding_id uuid not null references public.findings (id),
  risk text not null check (risk in ('low', 'moderate', 'high', 'critical')),
  business_justification text not null,
  compensating_controls text not null default '',
  approved_by uuid not null references public.profiles (id),
  approval_date date not null,
  expires_on date not null,
  created_at timestamptz not null default now()
);

create table public.assessment_decisions (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  assessment_id uuid not null references public.assessments (id),
  decision text not null check (decision in ('approved', 'approved_with_conditions', 'rejected', 'requires_remediation')),
  notes text not null default '',
  reviewer_id uuid not null references public.profiles (id),
  decided_at timestamptz not null default now(),
  requires_secondary_approval boolean not null default false,
  secondary_approver_id uuid references public.profiles (id),
  secondary_approved_at timestamptz,
  pending boolean not null default false
);

create table public.invitations (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  assessment_id uuid not null references public.assessments (id),
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  last_access_at timestamptz
);

create table public.notifications (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  user_id uuid not null references public.profiles (id),
  kind text not null,
  dedupe_key text not null,
  title text not null,
  body text not null default '',
  href text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, dedupe_key)
);

create table public.audit_events (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  actor_id uuid references public.profiles (id),
  actor_label text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  summary text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

alter table public.vendors add constraint vendors_assessment_status_check
check (assessment_status in ('not_started', 'draft', 'questionnaire_sent', 'vendor_responded', 'in_review', 'remediation', 'approved', 'approved_with_conditions', 'rejected', 'closed'));

alter table public.documents add constraint documents_type_check
check (document_type in (
  'soc2_type_ii', 'soc2_type_i', 'iso_27001', 'penetration_test', 'pci_aoc', 'bcp_dr',
  'privacy_policy', 'information_security_policy', 'cyber_insurance', 'sig', 'other'
));

create index memberships_user_idx on public.memberships (user_id);
create index vendors_org_idx on public.vendors (organization_id);
create index assessments_org_idx on public.assessments (organization_id, status);
create index findings_org_idx on public.findings (organization_id, status);
create index documents_org_idx on public.documents (organization_id, vendor_id);
create index responses_assessment_idx on public.responses (assessment_id);
create index audit_org_idx on public.audit_events (organization_id, created_at desc);
create index notifications_user_idx on public.notifications (user_id, read_at);

create or replace function public.member_role(org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.memberships m
  join public.organizations o on o.id = m.organization_id
  where m.organization_id = org
    and m.user_id = auth.uid()
    and m.deleted_at is null
    and o.deleted_at is null
  limit 1
$$;

create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.member_role(org) is not null
$$;

create or replace function public.can_write(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.member_role(org) in ('owner', 'admin', 'analyst')
$$;

create or replace function public.can_admin(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.member_role(org) in ('owner', 'admin')
$$;

create or replace function public.protect_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.plan is distinct from old.plan and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Plan changes are managed outside the app.';
  end if;
  if tg_op = 'UPDATE' and new.deleted_at is distinct from old.deleted_at
     and public.member_role(old.id) is distinct from 'owner'
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only an owner can delete a workspace.';
  end if;
  return new;
end
$$;

create trigger organizations_protect
before update on public.organizations
for each row execute function public.protect_organization();

create or replace function public.reject_org_move()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable';
  end if;
  return new;
end
$$;

create or replace function public.reject_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit events are append-only';
end
$$;

create trigger audit_events_immutable
before update or delete on public.audit_events
for each row execute function public.reject_audit_mutation();

create or replace function public.enforce_risk_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
begin
  if new.risk in ('high', 'critical') then
    actor := public.member_role(new.organization_id);
    if actor is null or actor not in ('owner', 'admin') then
      raise exception 'High and critical risk acceptance requires an admin or owner.';
    end if;
  end if;
  return new;
end
$$;

create trigger risk_acceptances_role
before insert on public.risk_acceptances
for each row execute function public.enforce_risk_acceptance();

create or replace function public.enforce_secondary_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.pending = true and new.pending = false then
    if public.member_role(new.organization_id) not in ('owner', 'admin') then
      raise exception 'Additional approval requires an admin or owner.';
    end if;
  end if;
  return new;
end
$$;

create trigger assessment_decisions_approval
before update on public.assessment_decisions
for each row execute function public.enforce_secondary_approval();

create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'owner' and (new.role is distinct from 'owner' or new.deleted_at is not null) then
    if (
      select count(*) from public.memberships
      where organization_id = old.organization_id and role = 'owner' and deleted_at is null and id <> old.id
    ) = 0 then
      raise exception 'A workspace needs at least one owner.';
    end if;
  end if;
  return new;
end
$$;

create trigger memberships_last_owner
before update on public.memberships
for each row execute function public.protect_last_owner();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'memberships', 'org_invites', 'questionnaire_templates', 'questionnaire_sections', 'questions',
    'vendors', 'vendor_contacts', 'assessments', 'assessment_questions', 'responses', 'documents',
    'findings', 'remediations', 'risk_acceptances', 'assessment_decisions', 'invitations',
    'notifications', 'audit_events'
  ]
  loop
    execute format('create trigger %I_org_immutable before update on public.%I for each row execute function public.reject_org_move()', table_name, table_name);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_workspace(p_name text, p_job_title text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := gen_random_uuid();
  v_slug text;
  v_base text;
  v_suffix integer := 2;
  v_name text := trim(p_name);
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Company name is required.';
  end if;
  v_base := left(trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), 48);
  if v_base = '' then
    v_base := 'workspace';
  end if;
  v_slug := v_base;
  while exists (select 1 from public.organizations where slug = v_slug and deleted_at is null) loop
    v_slug := v_base || '-' || v_suffix;
    v_suffix := v_suffix + 1;
  end loop;
  insert into public.organizations (id, name, slug, plan)
  values (v_org, v_name, v_slug, 'starter');
  insert into public.memberships (id, organization_id, user_id, role)
  values (gen_random_uuid(), v_org, auth.uid(), 'owner');
  update public.profiles set job_title = left(coalesce(p_job_title, ''), 120) where id = auth.uid();
  insert into public.audit_events (id, organization_id, actor_id, actor_label, action, entity_type, entity_id, summary, after)
  values (
    gen_random_uuid(), v_org, auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), ''),
    'organization.created', 'organization', v_org::text,
    'Workspace ' || v_name || ' created.',
    jsonb_build_object('name', v_name)
  );
  return v_org;
end
$$;

create or replace function public.accept_workspace_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_invite public.org_invites%rowtype;
  v_email text;
  v_membership uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.';
  end if;
  v_hash := encode(digest(convert_to('auditready.token.v1:' || trim(p_code), 'UTF8'), 'sha256'), 'hex');
  select * into v_invite from public.org_invites where code_hash = v_hash and accepted_at is null;
  if not found or v_invite.expires_at < now() then
    raise exception 'Invite not found.';
  end if;
  select email into v_email from public.profiles where id = auth.uid();
  if lower(coalesce(v_email, '')) <> lower(v_invite.email) then
    raise exception 'This invite was sent to a different email address.';
  end if;
  if exists (
    select 1 from public.organizations where id = v_invite.organization_id and deleted_at is not null
  ) then
    raise exception 'Invite not found.';
  end if;
  select id into v_membership
  from public.memberships
  where organization_id = v_invite.organization_id and user_id = auth.uid() and deleted_at is null;
  if v_membership is null then
    v_membership := gen_random_uuid();
    insert into public.memberships (id, organization_id, user_id, role)
    values (v_membership, v_invite.organization_id, auth.uid(), v_invite.role);
  end if;
  update public.org_invites set accepted_at = now() where id = v_invite.id;
  insert into public.audit_events (id, organization_id, actor_id, actor_label, action, entity_type, entity_id, summary)
  values (
    gen_random_uuid(), v_invite.organization_id, auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), v_email),
    'member.joined', 'membership', v_membership::text,
    'Member joined as ' || v_invite.role || '.'
  );
  return v_membership;
end
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.org_invites enable row level security;
alter table public.questionnaire_templates enable row level security;
alter table public.questionnaire_sections enable row level security;
alter table public.questions enable row level security;
alter table public.vendors enable row level security;
alter table public.vendor_contacts enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.responses enable row level security;
alter table public.documents enable row level security;
alter table public.findings enable row level security;
alter table public.remediations enable row level security;
alter table public.risk_acceptances enable row level security;
alter table public.assessment_decisions enable row level security;
alter table public.invitations enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_events enable row level security;

alter table public.profiles force row level security;
alter table public.organizations force row level security;
alter table public.memberships force row level security;
alter table public.org_invites force row level security;
alter table public.questionnaire_templates force row level security;
alter table public.questionnaire_sections force row level security;
alter table public.questions force row level security;
alter table public.vendors force row level security;
alter table public.vendor_contacts force row level security;
alter table public.assessments force row level security;
alter table public.assessment_questions force row level security;
alter table public.responses force row level security;
alter table public.documents force row level security;
alter table public.findings force row level security;
alter table public.remediations force row level security;
alter table public.risk_acceptances force row level security;
alter table public.assessment_decisions force row level security;
alter table public.invitations force row level security;
alter table public.notifications force row level security;
alter table public.audit_events force row level security;

create policy profiles_select on public.profiles for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1 from public.memberships mine
    join public.memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and theirs.user_id = profiles.id
      and mine.deleted_at is null
      and theirs.deleted_at is null
  )
);

create policy profiles_update on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy organizations_select on public.organizations for select to authenticated
using (public.is_org_member(id));

create policy organizations_update on public.organizations for update to authenticated
using (public.can_admin(id))
with check (public.can_admin(id) or deleted_at is not null);

create policy memberships_select on public.memberships for select to authenticated
using (user_id = auth.uid() or public.is_org_member(organization_id));

create policy memberships_update on public.memberships for update to authenticated
using (public.can_admin(organization_id))
with check (
  public.member_role(organization_id) = 'owner'
  or (public.member_role(organization_id) = 'admin' and role <> 'owner')
);

create policy invites_select on public.org_invites for select to authenticated
using (public.can_admin(organization_id));

create policy invites_insert on public.org_invites for insert to authenticated
with check (public.can_admin(organization_id) and created_by = auth.uid());

create policy invites_update on public.org_invites for update to authenticated
using (public.can_admin(organization_id))
with check (public.can_admin(organization_id));

create policy templates_select on public.questionnaire_templates for select to authenticated
using (public.is_org_member(organization_id));
create policy templates_write on public.questionnaire_templates for insert to authenticated
with check (public.can_admin(organization_id));
create policy templates_update on public.questionnaire_templates for update to authenticated
using (public.can_admin(organization_id))
with check (public.can_admin(organization_id));

create policy sections_select on public.questionnaire_sections for select to authenticated
using (public.is_org_member(organization_id));
create policy sections_write on public.questionnaire_sections for insert to authenticated
with check (public.can_admin(organization_id));
create policy sections_update on public.questionnaire_sections for update to authenticated
using (public.can_admin(organization_id))
with check (public.can_admin(organization_id));

create policy questions_select on public.questions for select to authenticated
using (public.is_org_member(organization_id));
create policy questions_write on public.questions for insert to authenticated
with check (public.can_admin(organization_id));
create policy questions_update on public.questions for update to authenticated
using (public.can_admin(organization_id))
with check (public.can_admin(organization_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'vendors', 'vendor_contacts', 'assessments', 'assessment_questions', 'responses', 'documents',
    'findings', 'remediations', 'assessment_decisions', 'invitations'
  ]
  loop
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_org_member(organization_id))', table_name, table_name);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.can_write(organization_id))', table_name, table_name);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.can_write(organization_id)) with check (public.can_write(organization_id))', table_name, table_name);
  end loop;
end $$;

create policy acceptances_select on public.risk_acceptances for select to authenticated
using (public.is_org_member(organization_id));
create policy acceptances_insert on public.risk_acceptances for insert to authenticated
with check (public.can_write(organization_id) and approved_by = auth.uid());

create policy notifications_select on public.notifications for select to authenticated
using (public.is_org_member(organization_id) and user_id = auth.uid());
create policy notifications_insert on public.notifications for insert to authenticated
with check (public.can_write(organization_id));
create policy notifications_update on public.notifications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy audit_select on public.audit_events for select to authenticated
using (public.is_org_member(organization_id));
create policy audit_insert on public.audit_events for insert to authenticated
with check (public.can_write(organization_id));

revoke all on all tables in schema public from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.organizations to authenticated;
grant select, update on public.memberships to authenticated;
grant select, insert, update on public.org_invites to authenticated;
grant select, insert, update on public.questionnaire_templates to authenticated;
grant select, insert, update on public.questionnaire_sections to authenticated;
grant select, insert, update on public.questions to authenticated;
grant select, insert, update on public.vendors to authenticated;
grant select, insert, update on public.vendor_contacts to authenticated;
grant select, insert, update on public.assessments to authenticated;
grant select, insert, update on public.assessment_questions to authenticated;
grant select, insert, update on public.responses to authenticated;
grant select, insert, update on public.documents to authenticated;
grant select, insert, update on public.findings to authenticated;
grant select, insert, update on public.remediations to authenticated;
grant select, insert on public.risk_acceptances to authenticated;
grant select, insert, update on public.assessment_decisions to authenticated;
grant select, insert, update on public.invitations to authenticated;
grant select, insert, update on public.notifications to authenticated;
grant select, insert on public.audit_events to authenticated;

grant execute on function public.create_workspace(text, text) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.member_role(uuid) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.can_write(uuid) to authenticated;
grant execute on function public.can_admin(uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do update set public = false;

create policy evidence_select on storage.objects for select to authenticated
using (
  bucket_id = 'evidence'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

create policy evidence_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'evidence'
  and public.can_write(((storage.foldername(name))[1])::uuid)
);

create policy evidence_update on storage.objects for update to authenticated
using (
  bucket_id = 'evidence'
  and public.can_write(((storage.foldername(name))[1])::uuid)
);
