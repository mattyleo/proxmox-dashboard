-- Schema Iniziale per Dashboard Proxmox

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Tabella Aziende (Companies)
create table public.companies (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  contact_email text,
  address text,
  api_key text unique not null default uuid_generate_v4()::text, -- Chiave da usare per l'agente
  status text default 'active'
);

-- 2. Tabella Server Proxmox
create table public.servers (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  company_id uuid references public.companies(id) on delete cascade not null,
  hostname text not null,
  ip_address text,
  total_ram bigint,    -- In byte
  total_cpu int,       -- Numero cores
  total_disk bigint,   -- In byte
  last_seen timestamp with time zone,
  status text default 'unknown' -- online, offline, warning
);

-- 3. Tabella Macchine Virtuali (VMs)
create table public.vms (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  server_id uuid references public.servers(id) on delete cascade not null,
  vmid int not null,
  name text not null,
  status text not null, -- running, stopped
  maxmem bigint,
  cpus int,
  maxdisk bigint,
  last_seen timestamp with time zone
);

-- 4. Tabella Metriche (Storico)
create table public.metrics (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  server_id uuid references public.servers(id) on delete cascade,
  vm_id uuid references public.vms(id) on delete cascade, -- Null se la metrica è del nodo intero
  type text not null, -- 'cpu', 'ram', 'disk', etc.
  value numeric not null
);

-- 5. Tabella Allarmi / Ticket (Alerts)
create table public.alerts (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  company_id uuid references public.companies(id) on delete cascade not null,
  server_id uuid references public.servers(id) on delete cascade,
  vm_id uuid references public.vms(id) on delete cascade,
  title text not null,
  description text not null,
  severity text not null, -- critical, warning, info
  status text default 'open', -- open, resolved, ignored
  ai_suggested_solution text, -- Il campo dove salveremo la soluzione proposta dall'IA
  resolved_at timestamp with time zone
);

-- 6. Knowledge Base (Problemi e Soluzioni custom)
create table public.knowledge_base (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  title text not null,
  description text not null,
  solution text not null,
  tags text[]
);
