-- Kurs-Tool (courses.shnoozy.top) im bestehenden Projekt "shnoozy-App".
-- Das Projekt teilen wir mit dem Prüfungstool, in dem auch andere Trainer
-- Konten haben. Eine Anmeldung allein gibt hier deshalb noch keinen Zugriff:
-- durchgelassen wird nur, wer in public.kurs_zugriff steht.

-- ---------------------------------------------------------------------------
-- Freigabeliste
-- ---------------------------------------------------------------------------
create table public.kurs_zugriff (
  trainer_id  uuid primary key references auth.users(id) on delete cascade,
  angelegt_am timestamptz not null default now()
);
alter table public.kurs_zugriff enable row level security;

comment on table public.kurs_zugriff is
  'Wer hier steht, darf die Trainer-Oberflaeche des Kurs-Tools nutzen. Pflege ueber das Dashboard.';

-- Jeder darf nur den eigenen Eintrag sehen; daran erkennt die App die Freigabe.
create policy "eigenen zugriff lesen" on public.kurs_zugriff
  for select to authenticated
  using (trainer_id = auth.uid());

-- security definer, damit die Prüfung auch dann greift, wenn die Policy der
-- aufrufenden Tabelle selbst noch keine Leserechte auf kurs_zugriff gibt.
create or replace function public.hat_kurszugriff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.kurs_zugriff z where z.trainer_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Kurse und Kurstage
-- ---------------------------------------------------------------------------
create table public.kurse (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  angelegt_am timestamptz not null default now()
);

create table public.kurstage (
  id                   uuid primary key default gen_random_uuid(),
  kurs_id              uuid not null references public.kurse(id) on delete cascade,
  nummer               int  not null,
  segment              int,
  titel                text,
  -- Pfad im privaten Bucket "decks", z. B. weg/trainer/Tag1_Segment1.html
  deck_pfad            text,
  -- sha256 der lokalen Datei; daran erkennt der Sync, was sich geaendert hat
  deck_hash            text,
  deck_groesse         bigint,
  deck_aktualisiert_am timestamptz,
  unique (kurs_id, nummer)
);

create index kurstage_kurs_idx on public.kurstage (kurs_id, nummer);

alter table public.kurse    enable row level security;
alter table public.kurstage enable row level security;

create policy "kurse lesen" on public.kurse
  for select to authenticated using (public.hat_kurszugriff());

create policy "kurstage lesen" on public.kurstage
  for select to authenticated using (public.hat_kurszugriff());

-- Schreiben laeuft ueber den Sync mit service_role (umgeht RLS), deshalb
-- bekommen normale Sitzungen bewusst kein insert/update/delete.

-- ---------------------------------------------------------------------------
-- Privater Bucket fuer die Decks
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('decks', 'decks', false)
on conflict (id) do nothing;

create policy "decks lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'decks' and public.hat_kurszugriff());

-- ---------------------------------------------------------------------------
-- Startdaten
-- ---------------------------------------------------------------------------
insert into public.kurse (slug, name)
values ('weg', 'WEG-Kurs')
on conflict (slug) do nothing;

-- Freigabe fuer Niko. Passt die E-Mail nicht zum Supabase-Konto, hier anpassen.
insert into public.kurs_zugriff (trainer_id)
select id from auth.users where lower(email) = lower('info@hausblick-fn.de')
on conflict (trainer_id) do nothing;
