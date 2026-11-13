-- Pega todo este archivo en Supabase > SQL Editor > Run

create table if not exists public.movimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  monto numeric(12, 2) not null check (monto > 0),
  fecha date not null default current_date,
  concepto text not null,
  categoria text not null,
  cuenta text not null default 'Efectivo',
  notas text,
  recibo_path text,
  recibo_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists movimientos_user_fecha_idx on public.movimientos (user_id, fecha desc);

alter table public.movimientos enable row level security;

create policy "movimientos propios: ver" on public.movimientos
  for select using (user_id = auth.uid());
create policy "movimientos propios: crear" on public.movimientos
  for insert with check (user_id = auth.uid());
create policy "movimientos propios: editar" on public.movimientos
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "movimientos propios: borrar" on public.movimientos
  for delete using (user_id = auth.uid());

-- Recibos: bucket privado, máximo 5 MB, solo imágenes y PDF
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recibos', 'recibos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "recibos propios: ver" on storage.objects
  for select using (bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "recibos propios: subir" on storage.objects
  for insert with check (bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "recibos propios: borrar" on storage.objects
  for delete using (bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text);
