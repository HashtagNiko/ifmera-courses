-- Trainertagebuch und Fortschritt je Durchlauf.
--
-- Niko haelt denselben Kurs mehrmals im Jahr. Haken duerfen deshalb nicht am
-- Kurs haengen, sondern am einzelnen Durchlauf: sonst startet der zweite
-- Durchlauf mit den Haken des ersten.

-- ---------------------------------------------------------------------------
-- Kurstage: auch Tage ohne Deck
-- ---------------------------------------------------------------------------
-- Projekttage und die Abschlusspruefung haben kein Deck, gehoeren aber in den
-- Ablauf. "art" trennt sie, "position" haelt die Kursreihenfolge fest
-- (Projekttag 1 liegt zwischen Kurstag 4 und 5).
alter table public.kurstage
  add column if not exists art       text not null default 'kurstag',
  add column if not exists position  int,
  add column if not exists tagebuch_titel   text,
  add column if not exists tagebuch_text    text,
  add column if not exists tagebuch_zeichen int;

alter table public.kurstage
  add constraint kurstage_art_pruefung check (art in ('kurstag', 'projekttag', 'pruefung'));

comment on column public.kurstage.tagebuch_text is
  'Themen des Tages aus "Themenuebersicht Trainertagebuch", zum Herauskopieren.';

-- Die Nummer allein reicht als Schluessel nicht mehr: es gibt Kurstag 1 und
-- Projekttag 1 nebeneinander.
alter table public.kurstage drop constraint if exists kurstage_kurs_id_nummer_key;
alter table public.kurstage add constraint kurstage_kurs_art_nummer_key
  unique (kurs_id, art, nummer);

-- ---------------------------------------------------------------------------
-- Durchlaeufe
-- ---------------------------------------------------------------------------
create table public.durchlaeufe (
  id          uuid primary key default gen_random_uuid(),
  kurs_id     uuid not null references public.kurse(id) on delete cascade,
  name        text not null,
  start_am    date,
  ende_am     date,
  aktiv       boolean not null default true,
  angelegt_am timestamptz not null default now()
);

create index durchlaeufe_kurs_idx on public.durchlaeufe (kurs_id, start_am desc);

alter table public.durchlaeufe enable row level security;

create policy "durchlaeufe lesen" on public.durchlaeufe
  for select to authenticated using (public.hat_kurszugriff());
create policy "durchlaeufe anlegen" on public.durchlaeufe
  for insert to authenticated with check (public.hat_kurszugriff());
create policy "durchlaeufe aendern" on public.durchlaeufe
  for update to authenticated
  using (public.hat_kurszugriff()) with check (public.hat_kurszugriff());
create policy "durchlaeufe loeschen" on public.durchlaeufe
  for delete to authenticated using (public.hat_kurszugriff());

-- ---------------------------------------------------------------------------
-- Fortschritt: was wurde in diesem Durchlauf vermittelt
-- ---------------------------------------------------------------------------
create table public.fortschritt (
  id           uuid primary key default gen_random_uuid(),
  durchlauf_id uuid not null references public.durchlaeufe(id) on delete cascade,
  kurstag_id   uuid not null references public.kurstage(id) on delete cascade,
  vermittelt   boolean not null default false,
  notiz        text,
  -- Der Titel wird mitgeschrieben, damit ein abgeschlossener Durchlauf lesbar
  -- bleibt, auch wenn das Deck sich spaeter aendert.
  titel_damals text,
  geaendert_am timestamptz not null default now(),
  unique (durchlauf_id, kurstag_id)
);

create index fortschritt_durchlauf_idx on public.fortschritt (durchlauf_id);

alter table public.fortschritt enable row level security;

create policy "fortschritt lesen" on public.fortschritt
  for select to authenticated using (public.hat_kurszugriff());
create policy "fortschritt anlegen" on public.fortschritt
  for insert to authenticated with check (public.hat_kurszugriff());
create policy "fortschritt aendern" on public.fortschritt
  for update to authenticated
  using (public.hat_kurszugriff()) with check (public.hat_kurszugriff());
