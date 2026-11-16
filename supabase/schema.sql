-- LeãoHub — estrutura do banco no Supabase.
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Pode rodar mais de uma vez sem problema.

-- ------------------------------------------------------------ tabelas
create table if not exists public.contas (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  logo text not null default '',            -- imagem do logo em data URL (pequena, redimensionada no app)
  cor text not null default '#0f766e',
  plano text not null default 'teste' check (plano in ('teste', 'essencial', 'profissional', 'grupo')),
  plano_escolhido text not null default 'profissional',
  teste_ate date not null default (current_date + 14),
  criado_em timestamptz not null default now()
);

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  cnpj text not null default '',
  regime text not null default 'presumido',
  setor text not null default 'servicos',
  faturamento numeric not null default 0,
  obs text not null default '',
  criado_em timestamptz not null default now()
);
create index if not exists empresas_conta_idx on public.empresas (conta_id);

create table if not exists public.simulacoes (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  empresa_id uuid references public.empresas (id) on delete set null,
  titulo text not null default '',
  dados jsonb not null,
  resultado jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists simulacoes_conta_idx on public.simulacoes (conta_id, criado_em desc);

-- ------------------------------------------------------------ segurança: cada conta só vê o que é dela
alter table public.contas enable row level security;
alter table public.empresas enable row level security;
alter table public.simulacoes enable row level security;

drop policy if exists contas_dono_ler on public.contas;
create policy contas_dono_ler on public.contas for select using (id = auth.uid());
drop policy if exists contas_dono_editar on public.contas;
create policy contas_dono_editar on public.contas for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists empresas_dono on public.empresas;
create policy empresas_dono on public.empresas for all using (conta_id = auth.uid()) with check (conta_id = auth.uid());

drop policy if exists simulacoes_dono on public.simulacoes;
create policy simulacoes_dono on public.simulacoes for all using (conta_id = auth.uid()) with check (conta_id = auth.uid());

-- O usuário só pode mudar nome, logo, cor e o plano desejado.
-- Plano ativo e fim do teste são alterados só por você (no painel do Supabase) ou, no futuro, pela cobrança.
revoke insert, update, delete on public.contas from anon, authenticated;
grant select on public.contas to authenticated;
grant update (nome, logo, cor, plano_escolhido) on public.contas to authenticated;

-- ------------------------------------------------------------ cria a conta quando alguém se cadastra
create or replace function public.criar_conta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.contas (id, nome, plano_escolhido)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'plano_escolhido', ''), 'profissional')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
for each row execute function public.criar_conta();

-- ------------------------------------------------------------ limite de empresas por plano
-- Mantenha estes números iguais aos do config.js (PLANOS → empresas).
create or replace function public.limite_empresas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plano text;
  v_limite int;
  v_qtd int;
begin
  select plano into v_plano from public.contas where id = new.conta_id;
  v_limite := case coalesce(v_plano, 'teste')
    when 'essencial' then 1
    when 'profissional' then 5
    when 'grupo' then 20
    else 5            -- teste grátis = recursos do Profissional
  end;
  select count(*) into v_qtd from public.empresas where conta_id = new.conta_id;
  if v_qtd >= v_limite then
    raise exception 'Limite de empresas do plano atingido (até %). Troque de plano para cadastrar mais.', v_limite;
  end if;
  return new;
end;
$$;

drop trigger if exists checar_limite_empresas on public.empresas;
create trigger checar_limite_empresas before insert on public.empresas
for each row execute function public.limite_empresas();
