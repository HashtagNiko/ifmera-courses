-- Baustein 4, Teil 2 (hinzufuegend): eigene Fassungen hochladen und freigeben, in beide Richtungen.
--
-- Eine Fassung ist die bearbeitete Kopie eines Kurstags: das gebaute Deck plus das Quellpaket, aus dem
-- es gebaut wurde. Grundlage ist das Original des Kurses oder eine andere Fassung DESSELBEN Kurstags.
--
-- Neu:
--   * kt_deck_fassungen     eine Zeile je Fassung, mit Besitzer, Kurstag, Grundlage und deren Stand
--   * kt_fassung_freigaben  Besitzer gibt eine Fassung frei: "nutzen" (ansehen, herunterladen) oder
--                           "fassung" (zusaetzlich Quellpaket laden, eigene Kopie anlegen)
--   * Bucket "fassungen"    privat, Ablage <besitzer-id>/<fassung-id>/deck.html und .../quellen.zip
--   * Hilfsfunktionen
--
-- Eigener Bucket mit eigenen Regeln: Die Regeln des Buckets "decks" bleiben unberuehrt; insbesondere gilt
-- die Admin-Regel fuer verwaiste Dateien dort nicht fuer Fassungen. Die Dateien eines Trainers sieht nur,
-- wem er sie freigibt.
--
-- Regeln und Annahmen (SPEC.md, Baustein 4):
--   * Fassungen gibt es nur, solange man den Kurs selbst sehen darf (gilt auch fuer den Besitzer der
--     Fassung: sie beruht auf den Inhalten des Kursbesitzers).
--   * Eine Fassung anlegen: Stufe "fassung" am Kurs; ist die Grundlage eine Fassung, auch an dieser.
--   * Freigeben nur an Trainer, die den Kurs selbst sehen duerfen. Wirksam ist hoechstens die Stufe, die
--     der Empfaenger am Kurs hat: Wer am Kurs keine Quellen laden darf, bekommt auch das Quellpaket einer
--     Fassung nicht.
--   * Unveraenderlich nach dem Anlegen: id, Besitzer, Kurstag, Grundlage (Spaltenrechte).
--   * Ein Kurstag mit Fassungen laesst sich nicht loeschen (kein Kaskadieren auf fremde Inhalte).
--
-- Gepruefte Verschaerfungen nach dem zweiten Blick (Sub-Agent, 13.11.2026): Dateizugriff an den
-- Besitzer-Ordner gebunden; id nicht waehlbar; Grundlage nur vom selben Tag; Stufe gedeckelt durch die
-- Kursstufe; Laengen- und Formatgrenzen; Bucket-Groessengrenze.
--
-- Rueckbau: supabase/rueckbau/20261113210000_kt_deck_fassungen.sql

begin;

set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table public.kt_deck_fassungen (
  id                   uuid primary key default gen_random_uuid(),
  besitzer_id          uuid not null default auth.uid() references public.kt_trainer (id),
  -- ohne Kaskade: wer einen Kurstag loescht, soll keine fremden Fassungen mitloeschen
  kurstag_id           uuid not null references public.kurstage (id),
  grundlage_art        text not null default 'original' check (grundlage_art in ('original', 'fassung')),
  -- bei grundlage_art 'fassung': die Fassung desselben Kurstags (leer, falls sie geloescht wurde)
  grundlage_fassung_id uuid,
  -- Stand der Grundlage beim Anlegen (Pruefsumme des Quellpakets)
  grundlage_hash       text check (grundlage_hash ~ '^[0-9a-f]{64}$'),
  titel                text not null check (char_length(titel) <= 120 and btrim(titel) <> '' and titel !~ '[<>]'),
  bemerkung            text not null default '' check (char_length(bemerkung) <= 2000),
  deck_pfad            text,
  deck_hash            text check (deck_hash ~ '^[0-9a-f]{64}$'),
  deck_groesse         bigint check (deck_groesse >= 0),
  quellen_pfad         text,
  quellen_hash         text check (quellen_hash ~ '^[0-9a-f]{64}$'),
  quellen_groesse      bigint check (quellen_groesse >= 0),
  angelegt_am          timestamptz not null default now(),
  geaendert_am         timestamptz not null default now(),
  unique (id, kurstag_id),
  foreign key (grundlage_fassung_id, kurstag_id)
    references public.kt_deck_fassungen (id, kurstag_id) on delete set null (grundlage_fassung_id),
  check (grundlage_art = 'fassung' or grundlage_fassung_id is null),
  -- Pfade zeigen nur in den eigenen Ordner dieser Fassung
  check (deck_pfad is null or deck_pfad = besitzer_id::text || '/' || id::text || '/deck.html'),
  check (quellen_pfad is null or quellen_pfad = besitzer_id::text || '/' || id::text || '/quellen.zip')
);
create index kt_deck_fassungen_tag_idx on public.kt_deck_fassungen (kurstag_id);
create index kt_deck_fassungen_besitzer_idx on public.kt_deck_fassungen (besitzer_id);

create table public.kt_fassung_freigaben (
  fassung_id  uuid not null references public.kt_deck_fassungen (id) on delete cascade,
  trainer_id  uuid not null references public.kt_trainer (id) on delete cascade,
  stufe       text not null check (stufe in ('nutzen', 'fassung')),
  angelegt_am timestamptz not null default now(),
  primary key (fassung_id, trainer_id)
);
create index kt_fassung_freigaben_trainer_idx on public.kt_fassung_freigaben (trainer_id);

alter table public.kt_deck_fassungen enable row level security;
alter table public.kt_fassung_freigaben enable row level security;
revoke all on public.kt_deck_fassungen, public.kt_fassung_freigaben from anon, authenticated;
grant select, delete on public.kt_deck_fassungen to authenticated;
-- Spaltenrechte: id, Besitzer, Kurstag und Grundlage sind nach dem Anlegen unveraenderlich
grant insert (kurstag_id, grundlage_art, grundlage_fassung_id, grundlage_hash, titel, bemerkung)
  on public.kt_deck_fassungen to authenticated;
grant update (titel, bemerkung, grundlage_hash, deck_pfad, deck_hash, deck_groesse, quellen_pfad, quellen_hash, quellen_groesse)
  on public.kt_deck_fassungen to authenticated;
grant select, insert, update, delete on public.kt_fassung_freigaben to authenticated;

comment on table public.kt_deck_fassungen is
  'Eigene Fassungen eines Kurstags (Deck + Quellpaket). Gehoeren ihrem Besitzer; andere sehen sie nur per Freigabe.';
comment on table public.kt_fassung_freigaben is
  'Freigabe einer Fassung an einen Trainer: nutzen < fassung; wirksam hoechstens bis zur Kursstufe des Empfaengers.';

-- geaendert_am nur bei inhaltlichen Aenderungen (nicht, wenn die Grundlage geloescht wird)
create function public.kt_fassung_geaendert()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.titel, new.bemerkung, new.deck_hash, new.quellen_hash, new.grundlage_hash)
     is distinct from (old.titel, old.bemerkung, old.deck_hash, old.quellen_hash, old.grundlage_hash) then
    new.geaendert_am := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.kt_fassung_geaendert() from public, anon, authenticated;
create trigger kt_fassung_geaendert
  before update on public.kt_deck_fassungen
  for each row execute function public.kt_fassung_geaendert();

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen (security definer, leerer search_path, nur fuer aktive Trainer aussagekraeftig)
-- ---------------------------------------------------------------------------
-- Rang einer Stufe, fuer Vergleiche
create function public.kt_stufe_rang(p_stufe text)
returns int
language sql immutable set search_path = ''
as $$
  select array_position(array['nutzen', 'notizen', 'fassung', 'besitzer'], p_stufe);
$$;

-- Was darf der Angemeldete an einer Fassung? 'besitzer', 'fassung', 'nutzen' oder null.
-- Immer Voraussetzung: Er darf den Kurs selbst sehen. Eine Freigabe wirkt hoechstens bis zu seiner
-- Kursstufe ('fassung' an der Fassung, aber nur 'nutzen' am Kurs ergibt 'nutzen').
create function public.kt_fassung_stufe(p_fassung_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when not public.kt_ist_trainer() then null
    when f.id is null then null
    when public.kt_kurs_stufe(t.kurs_id) is null then null
    when f.besitzer_id = auth.uid() then 'besitzer'
    else (
      select case
        when fr.stufe = 'fassung' and not public.kt_kurs_stufe_mindestens(t.kurs_id, 'fassung') then 'nutzen'
        else fr.stufe
      end
      from public.kt_fassung_freigaben fr where fr.fassung_id = f.id and fr.trainer_id = auth.uid()
    )
  end
  from (select 1) eins
  left join public.kt_deck_fassungen f on f.id = p_fassung_id
  left join public.kurstage t on t.id = f.kurstag_id;
$$;

-- Dieselbe Stufe fuer eine Datei im Bucket: Ordner 1 muss der Besitzer der Fassung sein, Ordner 2 ihre id.
-- Texteingaben, damit beliebige Ordnernamen keinen Umwandlungsfehler ausloesen.
create function public.kt_fassung_datei_stufe(p_besitzer text, p_fassung text)
returns text
language sql stable security definer set search_path = ''
as $$
  select public.kt_fassung_stufe(f.id)
  from public.kt_deck_fassungen f
  where f.id::text = p_fassung and f.besitzer_id::text = p_besitzer;
$$;

-- Darf der Angemeldete diese Datei lesen? Deck ab "nutzen", Quellpaket ab "fassung", sonst nichts.
create function public.kt_fassung_datei_darf(p_besitzer text, p_fassung text, p_datei text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    case p_datei
      when 'deck.html'   then public.kt_stufe_rang(public.kt_fassung_datei_stufe(p_besitzer, p_fassung)) >= 1
      when 'quellen.zip' then public.kt_stufe_rang(public.kt_fassung_datei_stufe(p_besitzer, p_fassung)) >= 3
      else false
    end,
    false);
$$;

-- Darf ein anderer Trainer den Kurs sehen? Nur ja/nein, und nur fuer jemanden, der den Kurs selbst sieht.
create function public.kt_kurs_zugang_von(p_trainer_id uuid, p_kurs_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.kt_kurs_stufe(p_kurs_id) is not null
     and exists (select 1 from public.kt_trainer t where t.id = p_trainer_id and t.aktiv)
     and (exists (select 1 from public.kurse k where k.id = p_kurs_id and k.besitzer_id = p_trainer_id)
          or exists (select 1 from public.kt_kurs_freigaben f where f.kurs_id = p_kurs_id and f.trainer_id = p_trainer_id));
$$;

-- Kurs einer Fassung; nur fuer ihren Besitzer
create function public.kt_fassung_kurs(p_fassung_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select t.kurs_id from public.kt_deck_fassungen f join public.kurstage t on t.id = f.kurstag_id
  where f.id = p_fassung_id and f.besitzer_id = auth.uid() and public.kt_ist_trainer();
$$;

revoke execute on function public.kt_stufe_rang(text)                              from public, anon;
revoke execute on function public.kt_fassung_stufe(uuid)                           from public, anon;
revoke execute on function public.kt_fassung_datei_stufe(text, text)               from public, anon;
revoke execute on function public.kt_fassung_datei_darf(text, text, text)          from public, anon;
revoke execute on function public.kt_kurs_zugang_von(uuid, uuid)                   from public, anon;
revoke execute on function public.kt_fassung_kurs(uuid)                            from public, anon;
grant  execute on function public.kt_stufe_rang(text)                              to authenticated;
grant  execute on function public.kt_fassung_stufe(uuid)                           to authenticated;
grant  execute on function public.kt_fassung_datei_stufe(text, text)               to authenticated;
grant  execute on function public.kt_fassung_datei_darf(text, text, text)          to authenticated;
grant  execute on function public.kt_kurs_zugang_von(uuid, uuid)                   to authenticated;
grant  execute on function public.kt_fassung_kurs(uuid)                            to authenticated;

-- ---------------------------------------------------------------------------
-- Regeln: Fassungen
-- ---------------------------------------------------------------------------
-- Lesen: Besitzer oder per Freigabe, nur solange man den Kurs selbst sehen darf. Der Besitzer wird direkt
-- an der Zeile erkannt, damit eine gerade angelegte Fassung zurueckgelesen werden kann.
create policy "fassungen lesen" on public.kt_deck_fassungen
  for select to authenticated
  using (
    public.kt_ist_trainer()
    and public.kt_kurs_stufe((select t.kurs_id from public.kurstage t where t.id = kt_deck_fassungen.kurstag_id)) is not null
    and (kt_deck_fassungen.besitzer_id = auth.uid()
         or exists (select 1 from public.kt_fassung_freigaben fr
                    where fr.fassung_id = kt_deck_fassungen.id and fr.trainer_id = auth.uid()))
  );

create policy "fassungen anlegen" on public.kt_deck_fassungen
  for insert to authenticated
  with check (
    besitzer_id = auth.uid() and public.kt_ist_trainer()
    and public.kt_kurs_stufe_mindestens((select t.kurs_id from public.kurstage t where t.id = kurstag_id), 'fassung')
    and (grundlage_fassung_id is null
         or public.kt_stufe_rang(public.kt_fassung_stufe(grundlage_fassung_id)) >= 3)
  );

-- Aendern: nur die eigenen, solange man am Kurs die Stufe "fassung" hat. Die Grundlage wird hier nicht
-- erneut geprueft (sie ist unveraenderlich); sonst sperrte ein Entzug der Grundlage die eigene Kopie.
create policy "fassungen aendern" on public.kt_deck_fassungen
  for update to authenticated
  using (besitzer_id = auth.uid() and public.kt_ist_trainer())
  with check (
    besitzer_id = auth.uid() and public.kt_ist_trainer()
    and public.kt_kurs_stufe_mindestens((select t.kurs_id from public.kurstage t where t.id = kurstag_id), 'fassung')
  );

create policy "fassungen loeschen" on public.kt_deck_fassungen
  for delete to authenticated
  using (besitzer_id = auth.uid() and public.kt_ist_trainer());

-- ---------------------------------------------------------------------------
-- Regeln: Freigaben von Fassungen
-- ---------------------------------------------------------------------------
create policy "fassungsfreigaben lesen" on public.kt_fassung_freigaben
  for select to authenticated
  using (public.kt_fassung_stufe(fassung_id) = 'besitzer' or (trainer_id = auth.uid() and public.kt_ist_trainer()));

create policy "fassungsfreigaben anlegen" on public.kt_fassung_freigaben
  for insert to authenticated
  with check (
    public.kt_fassung_stufe(fassung_id) = 'besitzer' and trainer_id <> auth.uid()
    and public.kt_kurs_zugang_von(trainer_id, public.kt_fassung_kurs(fassung_id))
  );

create policy "fassungsfreigaben aendern" on public.kt_fassung_freigaben
  for update to authenticated
  using (public.kt_fassung_stufe(fassung_id) = 'besitzer')
  with check (
    public.kt_fassung_stufe(fassung_id) = 'besitzer' and trainer_id <> auth.uid()
    and public.kt_kurs_zugang_von(trainer_id, public.kt_fassung_kurs(fassung_id))
  );

-- Zurueckziehen geht auch ohne Kurszugang
create policy "fassungsfreigaben loeschen" on public.kt_fassung_freigaben
  for delete to authenticated
  using (public.kt_ist_trainer() and exists (
    select 1 from public.kt_deck_fassungen f where f.id = fassung_id and f.besitzer_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Bucket "fassungen": <besitzer-id>/<fassung-id>/deck.html | quellen.zip, hoechstens 40 MB je Datei
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('fassungen', 'fassungen', false, 41943040);

create policy "kt fassungen lesen" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fassungen'
    and array_length(storage.foldername(name), 1) = 2
    and public.kt_fassung_datei_darf((storage.foldername(name))[1], (storage.foldername(name))[2], storage.filename(name))
  );

-- Schreiben: nur in den eigenen Ordner, nur zu einer eigenen Fassung, nur die zwei erlaubten Dateien
create policy "kt fassungen hochladen" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fassungen'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.kt_fassung_datei_stufe((storage.foldername(name))[1], (storage.foldername(name))[2]) = 'besitzer'
    and storage.filename(name) in ('deck.html', 'quellen.zip')
  );

create policy "kt fassungen ersetzen" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'fassungen'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.kt_fassung_datei_stufe((storage.foldername(name))[1], (storage.foldername(name))[2]) = 'besitzer'
  )
  with check (
    bucket_id = 'fassungen'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.kt_fassung_datei_stufe((storage.foldername(name))[1], (storage.foldername(name))[2]) = 'besitzer'
    and storage.filename(name) in ('deck.html', 'quellen.zip')
  );

-- Loeschen: nur im eigenen Ordner. Die Storage-API braucht dazu auch Leserecht; die App loescht deshalb
-- zuerst die Dateien und dann die Zeile. (Ohne Zeile gibt es kein Leserecht mehr; da Kurstage mit
-- Fassungen nicht loeschbar sind, entstehen so keine verwaisten Dateien.)
create policy "kt fassungen loeschen" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fassungen' and (storage.foldername(name))[1] = auth.uid()::text and public.kt_ist_trainer()
  );

-- ---------------------------------------------------------------------------
-- Protokoll und Selbstpruefung
-- ---------------------------------------------------------------------------
insert into public.kt_migrationen (version, name)
values ('20261113210000', 'kt_deck_fassungen');

do $$
declare n int; f regprocedure;
begin
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'kt_deck_fassungen';
  if n <> 4 then raise exception 'KT-F01: erwartet 4 Regeln auf kt_deck_fassungen, gefunden %', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'kt_fassung_freigaben';
  if n <> 4 then raise exception 'KT-F02: erwartet 4 Regeln auf kt_fassung_freigaben, gefunden %', n; end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'kt fassungen %';
  if n <> 4 then raise exception 'KT-F03: erwartet 4 Bucket-Regeln fuer fassungen, gefunden %', n; end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'kt decks %';
  if n <> 6 then raise exception 'KT-F04: Regeln des Buckets decks veraendert (%)', n; end if;
  if coalesce((select public from storage.buckets where id = 'fassungen'), true) then
    raise exception 'KT-F05: Bucket fassungen fehlt oder ist oeffentlich';
  end if;
  if (select c.relrowsecurity from pg_class c where c.oid = 'public.kt_deck_fassungen'::regclass) is not true
     or (select c.relrowsecurity from pg_class c where c.oid = 'public.kt_fassung_freigaben'::regclass) is not true then
    raise exception 'KT-F06: RLS fehlt';
  end if;
  if has_table_privilege('anon', 'public.kt_deck_fassungen', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon', 'public.kt_fassung_freigaben', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'KT-F07: anon hat Rechte';
  end if;
  if has_table_privilege('authenticated', 'public.kt_deck_fassungen', 'TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated', 'public.kt_fassung_freigaben', 'TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'KT-F08: authenticated hat unnoetige Rechte';
  end if;
  if has_column_privilege('authenticated', 'public.kt_deck_fassungen', 'id', 'INSERT')
     or has_column_privilege('authenticated', 'public.kt_deck_fassungen', 'besitzer_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.kt_deck_fassungen', 'kurstag_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.kt_deck_fassungen', 'grundlage_fassung_id', 'UPDATE') then
    raise exception 'KT-F09: unveraenderliche Spalten sind beschreibbar';
  end if;
  if has_function_privilege('authenticated', 'public.kt_fassung_geaendert()', 'execute') then
    raise exception 'KT-F10: Triggerfunktion ist aufrufbar';
  end if;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname in
    ('kt_stufe_rang', 'kt_fassung_stufe', 'kt_fassung_datei_stufe', 'kt_fassung_datei_darf', 'kt_kurs_zugang_von', 'kt_fassung_kurs');
  if n <> 6 then raise exception 'KT-F11: erwartet 6 neue Hilfsfunktionen, gefunden %', n; end if;
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.proname in
             ('kt_fassung_stufe', 'kt_fassung_datei_stufe', 'kt_fassung_datei_darf', 'kt_kurs_zugang_von', 'kt_fassung_kurs')
  loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'KT-F12: anon darf % ausfuehren', f; end if;
    if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = f), false) then
      raise exception 'KT-F13: % nicht security definer mit leerem search_path', f;
    end if;
  end loop;
end
$$;

commit;
