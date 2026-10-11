-- ALETIS CRM Financeiro Agro - Supabase baseline
-- Primeira base para espelhar a plataforma em Lovable/Supabase.
-- Regra de integridade: este arquivo define estrutura e seguranca; nao insere dados reais.

create extension if not exists "pgcrypto";

do $$ begin
  create type app_role as enum (
    'admin_master',
    'gestor_financeiro',
    'analista',
    'comercial',
    'cliente_produtor',
    'consultor_externo'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type client_status as enum (
    'novo_diagnostico',
    'coleta_documentos',
    'dados_preenchimento',
    'diagnostico_analise',
    'cenario_proposto',
    'em_negociacao',
    'formalizacao',
    'concluido',
    'suspenso'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type demand_status as enum (
    'novo_diagnostico',
    'coleta_documentos',
    'dados_preenchimento',
    'diagnostico_analise',
    'memoria_calculo',
    'cenario_proposto',
    'proposta_revisao',
    'proposta_enviada',
    'aguardando_credor',
    'em_negociacao',
    'aprovado',
    'recusado',
    'formalizacao',
    'concluido',
    'suspenso'
  );
exception when duplicate_object then null; end $$;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  full_name text not null,
  role app_role not null default 'analista',
  client_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  cpf_cnpj text,
  economic_group text,
  responsible_user_id uuid references profiles(id),
  city text,
  uf char(2),
  main_activity text,
  cultures text[],
  total_area_ha numeric(16,4),
  own_area_ha numeric(16,4),
  leased_area_ha numeric(16,4),
  banks text[],
  suppliers text[],
  status client_status not null default 'novo_diagnostico',
  risk_grade text not null default 'necessario_validar',
  work_phase text,
  entry_date date default current_date,
  next_action text,
  strategic_notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles
  add constraint profiles_client_fk foreign key (client_id) references clients(id) on delete set null;

create table if not exists client_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  cpf_cnpj text,
  relationship text,
  acts_in_operation boolean not null default false,
  role_in_operation text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  farm_name text not null,
  owner_name text,
  registry_number text,
  city text,
  uf char(2),
  total_area_ha numeric(16,4),
  consolidated_area_ha numeric(16,4),
  planting_area_ha numeric(16,4),
  irrigated_area_ha numeric(16,4),
  pasture_area_ha numeric(16,4),
  legal_reserve_area_ha numeric(16,4),
  leased_to_third_parties_ha numeric(16,4),
  ccir text,
  itr_cib text,
  state_registration text,
  car text,
  has_geo boolean,
  market_value_per_ha numeric(16,2),
  market_value_total numeric(16,2),
  forced_sale_value_per_ha numeric(16,2),
  forced_sale_value_total numeric(16,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crop_seasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  season text not null,
  crop text not null,
  planted_area_ha numeric(16,4),
  own_area_ha numeric(16,4),
  leased_area_ha numeric(16,4),
  expected_yield numeric(16,4),
  realized_yield numeric(16,4),
  production numeric(16,4),
  average_price numeric(16,2),
  total_revenue numeric(16,2),
  gross_result numeric(16,2),
  gross_margin numeric(12,6),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists production_costs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  crop_season_id uuid references crop_seasons(id) on delete set null,
  category text not null,
  description text not null,
  annual_total numeric(16,2),
  monthly_equivalent numeric(16,2),
  cost_per_ha numeric(16,2),
  cost_per_bag numeric(16,2),
  source text default 'cadastro_manual',
  created_at timestamptz not null default now()
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  asset_type text not null,
  description text not null,
  market_value numeric(16,2),
  forced_sale_value numeric(16,2),
  source text,
  validation_status text not null default 'necessario_validar',
  created_at timestamptz not null default now()
);

create table if not exists creditors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  creditor_type text not null,
  contact_notes text,
  created_at timestamptz not null default now()
);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  document text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  creditor_id uuid references creditors(id) on delete set null,
  debtor_name text,
  creditor_type text,
  contract_number text,
  modality text,
  purpose text,
  released_value numeric(16,2),
  financed_value numeric(16,2),
  accessory_expenses numeric(16,2),
  present_value numeric(16,2),
  updated_present_value numeric(16,2),
  contracted_at date,
  first_installment_at date,
  last_installment_at date,
  final_due_at date,
  paid_installments integer default 0,
  overdue_installments integer default 0,
  periodicity text,
  calculation_method text,
  nominal_rate numeric(12,6),
  rate_periodicity text,
  periods_per_year integer,
  rate_type text,
  indexer text,
  indexer_percentage numeric(12,6),
  annual_cet numeric(12,6),
  fx_variation text,
  information_origin text,
  last_updated_at date,
  total_paid numeric(16,2),
  total_to_pay numeric(16,2),
  total_interest numeric(16,2),
  notes text,
  validation_status text not null default 'necessario_validar',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists debt_installments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  debt_id uuid not null references debts(id) on delete cascade,
  installment_number integer,
  due_date date,
  principal numeric(16,2),
  interest numeric(16,2),
  amount numeric(16,2),
  status text not null default 'a_vencer',
  created_at timestamptz not null default now()
);

create table if not exists debt_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  debt_id uuid not null references debts(id) on delete cascade,
  paid_at date not null,
  amount numeric(16,2) not null,
  source_document_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists liabilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  liability_type text not null,
  creditor_name text,
  description text not null,
  amount numeric(16,2),
  due_date date,
  status text not null default 'necessario_validar',
  created_at timestamptz not null default now()
);

create table if not exists guarantees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  registry_number text,
  farm_name text,
  owner_name text,
  area_ha numeric(16,4),
  city text,
  market_value numeric(16,2),
  forced_sale_value numeric(16,2),
  liens text,
  current_rank text,
  notes text,
  validation_status text not null default 'necessario_validar',
  created_at timestamptz not null default now()
);

create table if not exists guarantee_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  guarantee_id uuid not null references guarantees(id) on delete cascade,
  debt_id uuid references debts(id) on delete cascade,
  linked_debt_balance numeric(16,2),
  market_coverage_index numeric(12,6),
  forced_sale_coverage_index numeric(12,6),
  created_at timestamptz not null default now()
);

create table if not exists demands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  demand_number text,
  demand_date date default current_date,
  creditor_id uuid references creditors(id) on delete set null,
  purpose text,
  modality text,
  amount numeric(16,2),
  guarantees_summary text,
  term text,
  technical_opinion text,
  strategy text,
  sent_at date,
  creditor_response text,
  pending_actions text,
  status demand_status not null default 'novo_diagnostico',
  obtained_revenue numeric(16,2),
  responsible_user_id uuid references profiles(id),
  next_action text,
  priority text default 'media',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists negotiation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  demand_id uuid references demands(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  event_type text not null,
  description text not null,
  event_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create table if not exists scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  current_balance numeric(16,2),
  proposed_balance numeric(16,2),
  proposed_rate numeric(12,6),
  proposed_term_months integer,
  grace_months integer,
  periodicity text,
  entry_amount numeric(16,2),
  cash_relief numeric(16,2),
  viability_index numeric(12,6),
  calculation_memory jsonb not null default '{}'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists scenario_debts (
  scenario_id uuid references scenarios(id) on delete cascade,
  debt_id uuid references debts(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  primary key (scenario_id, debt_id)
);

create table if not exists scenario_installments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  scenario_id uuid not null references scenarios(id) on delete cascade,
  due_date date,
  amount numeric(16,2),
  principal numeric(16,2),
  interest numeric(16,2)
);

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  scenario_id uuid references scenarios(id) on delete set null,
  template_type text not null,
  title text not null,
  status text not null default 'rascunho',
  version integer not null default 1,
  sent_at timestamptz,
  creditor_return text,
  generated_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists proposal_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  proposal_id uuid not null references proposals(id) on delete cascade,
  section_order integer not null,
  title text not null,
  body text not null default 'Pendente de preenchimento',
  source_status text not null default 'necessario_validar'
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  related_debt_id uuid references debts(id) on delete set null,
  related_guarantee_id uuid references guarantees(id) on delete set null,
  related_proposal_id uuid references proposals(id) on delete set null,
  storage_path text not null,
  category text not null,
  version integer not null default 1,
  uploaded_by uuid references profiles(id),
  validation_status text not null default 'necessario_validar',
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  assigned_to uuid references profiles(id),
  description text not null,
  due_date date,
  priority text default 'media',
  status text not null default 'pendente',
  task_type text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references profiles(id),
  client_id uuid references clients(id) on delete set null,
  module text not null,
  field_name text,
  previous_value text,
  new_value text,
  observation text,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists ai_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  note_type text not null,
  content text not null,
  fact_premise_suggestion jsonb not null default '{}'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function current_profile()
returns profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from profiles where id = auth.uid() and active is true limit 1
$$;

create or replace function can_access_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    join clients c on c.organization_id = p.organization_id
    where p.id = auth.uid()
      and p.active is true
      and c.id = target_client_id
      and (
        p.role in ('admin_master', 'gestor_financeiro', 'analista')
        or (p.role = 'comercial' and c.responsible_user_id = p.id)
        or (p.role in ('cliente_produtor', 'consultor_externo') and p.client_id = c.id)
      )
  )
$$;

create or replace function same_org(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.active is true
      and p.organization_id = target_org
  )
$$;

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table clients enable row level security;
alter table client_members enable row level security;
alter table properties enable row level security;
alter table crop_seasons enable row level security;
alter table production_costs enable row level security;
alter table assets enable row level security;
alter table creditors enable row level security;
alter table suppliers enable row level security;
alter table debts enable row level security;
alter table debt_installments enable row level security;
alter table debt_payments enable row level security;
alter table liabilities enable row level security;
alter table guarantees enable row level security;
alter table guarantee_links enable row level security;
alter table demands enable row level security;
alter table negotiation_events enable row level security;
alter table scenarios enable row level security;
alter table scenario_debts enable row level security;
alter table scenario_installments enable row level security;
alter table proposals enable row level security;
alter table proposal_sections enable row level security;
alter table documents enable row level security;
alter table tasks enable row level security;
alter table audit_logs enable row level security;
alter table ai_notes enable row level security;
alter table notifications enable row level security;

create policy "profiles self or org admin" on profiles
for select using (
  id = auth.uid()
  or exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.organization_id = profiles.organization_id
      and p.role = 'admin_master'
  )
);

create policy "clients access by role" on clients
for select using (can_access_client(id));

create policy "clients write by internal team" on clients
for all using (
  same_org(organization_id)
  and (current_profile()).role in ('admin_master', 'gestor_financeiro', 'analista')
)
with check (
  same_org(organization_id)
  and (current_profile()).role in ('admin_master', 'gestor_financeiro', 'analista')
);

create policy "org scoped read" on creditors for select using (same_org(organization_id));
create policy "org scoped read suppliers" on suppliers for select using (same_org(organization_id));

create policy "client child read members" on client_members for select using (can_access_client(client_id));
create policy "client child read properties" on properties for select using (can_access_client(client_id));
create policy "client child read crops" on crop_seasons for select using (can_access_client(client_id));
create policy "client child read costs" on production_costs for select using (can_access_client(client_id));
create policy "client child read assets" on assets for select using (can_access_client(client_id));
create policy "client child read debts" on debts for select using (can_access_client(client_id));
create policy "client child read liabilities" on liabilities for select using (can_access_client(client_id));
create policy "client child read guarantees" on guarantees for select using (can_access_client(client_id));
create policy "client child read demands" on demands for select using (can_access_client(client_id));
create policy "client child read events" on negotiation_events for select using (can_access_client(client_id));
create policy "client child read scenarios" on scenarios for select using (can_access_client(client_id));
create policy "client child read proposals" on proposals for select using (can_access_client(client_id));
create policy "client child read documents" on documents for select using (can_access_client(client_id));
create policy "client child read tasks" on tasks for select using (client_id is null or can_access_client(client_id));
create policy "client child read ai notes" on ai_notes for select using (client_id is null or can_access_client(client_id));
create policy "client child read notifications" on notifications for select using (user_id = auth.uid());

create policy "internal write members" on client_members for all using (same_org(organization_id) and (current_profile()).role in ('admin_master','gestor_financeiro','analista')) with check (same_org(organization_id));
create policy "internal write properties" on properties for all using (same_org(organization_id) and (current_profile()).role in ('admin_master','gestor_financeiro','analista')) with check (same_org(organization_id));
create policy "internal write crops" on crop_seasons for all using (same_org(organization_id) and (current_profile()).role in ('admin_master','gestor_financeiro','analista')) with check (same_org(organization_id));
create policy "internal write costs" on production_costs for all using (same_org(organization_id) and (current_profile()).role in ('admin_master','gestor_financeiro','analista')) with check (same_org(organization_id));
create policy "internal write assets" on assets for all using (same_org(organization_id) and (current_profile()).role in ('admin_master','gestor_financeiro','analista')) with check (same_org(organization_id));
create policy "internal write debts" on debts for all using (same_org(organization_id) and (current_profile()).role in ('admin_master','gestor_financeiro','analista')) with check (same_org(organization_id));
create policy "internal write liabilities" on liabilities for all using (same_org(organization_id) and (current_profile()).role in ('admin_master','gestor_financeiro','analista')) with check (same_org(organization_id));
create policy "internal write guarantees" on guarantees for all using (same_org(organization_id) and (current_profile()).role in ('admin_master','gestor_financeiro','analista')) with check (same_org(organization_id));
create policy "internal write demands" on demands for all using (same_org(organization_id) and (current_profile()).role in ('admin_master','gestor_financeiro','analista','comercial')) with check (same_org(organization_id));
create policy "internal write scenarios" on scenarios for all using (same_org(organization_id) and (current_profile()).role in ('admin_master','gestor_financeiro')) with check (same_org(organization_id));
create policy "internal write proposals" on proposals for all using (same_org(organization_id) and (current_profile()).role in ('admin_master','gestor_financeiro')) with check (same_org(organization_id));
create policy "document upload controlled" on documents for insert with check (
  same_org(organization_id)
  and (
    (current_profile()).role in ('admin_master','gestor_financeiro','analista')
    or can_access_client(client_id)
  )
);

create policy "audit internal read" on audit_logs
for select using (
  same_org(organization_id)
  and (current_profile()).role in ('admin_master','gestor_financeiro')
);

create policy "audit append only" on audit_logs
for insert with check (same_org(organization_id));

create index if not exists clients_org_status_idx on clients(organization_id, status);
create index if not exists debts_client_due_idx on debts(client_id, final_due_at);
create index if not exists installments_due_idx on debt_installments(organization_id, due_date, status);
create index if not exists demands_client_status_idx on demands(client_id, status);
create index if not exists documents_client_category_idx on documents(client_id, category);
create index if not exists tasks_assigned_due_idx on tasks(assigned_to, due_date, status);
create index if not exists audit_logs_client_created_idx on audit_logs(client_id, created_at desc);

