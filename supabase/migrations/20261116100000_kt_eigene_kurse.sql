-- Baustein 10 (hinzufuegend): eigene Kurse im Tool anlegen, Startpaket fuer Claude.
--
-- Anlegen, aendern und loeschen eigener Kurse und Kurstage erlauben die Regeln seit 20261113160000
-- schon jedem aktiven Trainer (Besitz). Neu sind nur Sicherungen und das Startpaket. Keine bestehende
-- Regel (Policy) wird geaendert.
--
--   * kurse.angelegt_im_tool   Kennzeichen fuer Kurse, die im Tool angelegt und gepflegt werden; nach dem
--                              Anlegen unveraenderlich. Kurse aus dem Deck-Sync bleiben false.
--   * CHECK kurse_kuerzel_format   Kuerzel nur [a-z0-9-], 2 bis 40 Zeichen (Bestand passt).
--   * kt_kurse_pruefen (BEFORE INSERT/UPDATE auf kurse)
--       - mit Anmeldung: nur aktive Trainer und nur fuer sich selbst, VOR allen anderen Pruefungen. So
--         erfahren Nicht-Trainer (Pruefungstool-Konten) nichts ueber Kuerzel oder Dateien.
--       - Kuerzel von Nicht-Admins enden auf "-" plus 5 Zeichen [a-z2-9] (so erzeugt es die App); damit
--         kann niemand ein Kuerzel besetzen, das der Admin spaeter fuer einen Kurs aus dem Deck-Sync will.
--       - Kuerzel und Kennzeichen unveraenderlich; Name 2 bis 80 Zeichen, ohne Steuer-, unsichtbare und
--         richtungsdrehende Zeichen und ohne spitze Klammern.
--   * kt_kurse_kuerzel_frei (AFTER INSERT auf kurse)
--       Kein neuer Kurs mit einem Kuerzel, unter dem im Bucket "decks" noch Dateien liegen: Der Besitz
--       eines Bucket-Ordners ergibt sich aus dem Kurs mit diesem Kuerzel, ein neuer Kurs uebernaehme sonst
--       fremde Dateien. AFTER statt BEFORE: Beim Upsert des Deck-Syncs (ON CONFLICT DO UPDATE) feuert er
--       nur, wenn wirklich eingefuegt wird; und er sieht auch den Fall, dass ein gleichnamiger Kurs gerade
--       geloescht wurde, waehrend der Insert auf den eindeutigen Index wartete.
--   * kt_kurse_loeschen_pruefen (BEFORE DELETE auf kurse)
--       Einen Kurs erst loeschen, wenn seine Dateien weg sind (die App loescht sie vorher). So entstehen
--       keine verwaisten Dateien; die duerfte sonst der Admin lesen, auch die eines anderen Trainers.
--   * kt_kurstage_pfade_pruefen (BEFORE INSERT/UPDATE auf kurstage)
--       mit Anmeldung nur der Kursbesitzer (wie die Regeln, vor allem anderen); jeder Dateipfad liegt im
--       Ordner des eigenen Kurses und im Unterordner seiner Spalte (<kuerzel>/trainer/<datei> fuer
--       deck_pfad usw.). Bestand 16.11.2026: alle 184 Pfade folgen schon diesem Schema.
--   * Bucket "kt-vorlagen"     privat, nur Zip, hoechstens 40 MB je Datei. Lesen: jeder aktive Trainer
--                              (Startpaket). Schreiben, ersetzen, loeschen: nur der Admin (Deck-Sync).
--
-- Ohne Anmeldung (auth.uid() leer: Migrationen, Dashboard) gelten die Rechte-Pruefungen der Trigger nicht,
-- Format-, Datei- und Pfadpruefungen schon.
--
-- Zweiter Blick (Sub-Agent, 16.11.2026) eingearbeitet: alte Rechte-Tests liefen sonst auf Formatfehler statt
-- auf fehlende Rechte; Rueckbau braucht storage.allow_delete_query; Wettlauf im Insert; keine neuen
-- verwaisten Dateien; Info fuer Nicht-Trainer; Selbstpruefung nur lesend; Bucketname mit kt-.

begin;

set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. Kennzeichen "im Tool angelegt" und Kuerzelformat
-- ---------------------------------------------------------------------------
alter table public.kurse add column angelegt_im_tool boolean not null default false;

alter table public.kurse add constraint kurse_kuerzel_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$');

-- ---------------------------------------------------------------------------
-- 2. Kurse: Rechte zuerst, dann Unveraenderliches, Kuerzel fuer Nicht-Admins, Name
-- ---------------------------------------------------------------------------
create function public.kt_kurse_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if not public.kt_ist_trainer() then
      raise exception 'Keine Berechtigung.' using errcode = 'insufficient_privilege';
    end if;
    if tg_op = 'INSERT' and new.besitzer_id is distinct from auth.uid() then
      raise exception 'Keine Berechtigung.' using errcode = 'insufficient_privilege';
    end if;
    if tg_op = 'INSERT' and not public.kt_ist_admin() and coalesce(new.slug, '') !~ '-[a-z2-9]{5}$' then
      raise exception 'Ungültiges Kürzel.' using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.slug is distinct from old.slug then
      raise exception 'Das Kürzel eines Kurses lässt sich nicht ändern.' using errcode = 'check_violation';
    end if;
    if new.angelegt_im_tool is distinct from old.angelegt_im_tool then
      raise exception 'Das lässt sich nicht ändern.' using errcode = 'check_violation';
    end if;
  end if;

  new.name := btrim(regexp_replace(coalesce(new.name, ''), '[[:space:]]+', ' ', 'g'));
  if char_length(new.name) < 2 or char_length(new.name) > 80 then
    raise exception 'Der Kursname braucht 2 bis 80 Zeichen.' using errcode = 'check_violation';
  end if;
  if new.name ~ '[[:cntrl:]<>]' or new.name ~ '[\u0080-\u009F\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]' then
    raise exception 'Der Kursname enthält unerlaubte Zeichen.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function public.kt_kurse_kuerzel_frei()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from storage.objects o where o.bucket_id = 'decks' and o.name like new.slug || '/%') then
    raise exception 'Dieses Kürzel ist noch belegt (alte Dateien).' using errcode = 'unique_violation';
  end if;
  return null;
end;
$$;

create function public.kt_kurse_loeschen_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from storage.objects o where o.bucket_id = 'decks' and o.name like old.slug || '/%') then
    raise exception 'Erst die Dateien des Kurses löschen, dann den Kurs.' using errcode = 'dependent_objects_still_exist';
  end if;
  return old;
end;
$$;

revoke all on function public.kt_kurse_pruefen() from public, anon, authenticated;
revoke all on function public.kt_kurse_kuerzel_frei() from public, anon, authenticated;
revoke all on function public.kt_kurse_loeschen_pruefen() from public, anon, authenticated;

create trigger kt_kurse_pruefen
  before insert or update on public.kurse
  for each row execute function public.kt_kurse_pruefen();

create trigger kt_kurse_kuerzel_frei
  after insert on public.kurse
  for each row execute function public.kt_kurse_kuerzel_frei();

create trigger kt_kurse_loeschen_pruefen
  before delete on public.kurse
  for each row execute function public.kt_kurse_loeschen_pruefen();

-- ---------------------------------------------------------------------------
-- 3. Dateipfade eines Kurstags: nur im eigenen Kursordner, im Unterordner der Spalte
-- ---------------------------------------------------------------------------
create function public.kt_kurstage_pfade_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  r record;
  teile text[];
begin
  if auth.uid() is not null and not public.kt_ist_kursbesitzer(new.kurs_id) then
    raise exception 'Keine Berechtigung.' using errcode = 'insufficient_privilege';
  end if;
  select k.slug into v_slug from public.kurse k where k.id = new.kurs_id;
  for r in
    select * from (values
      ('trainer', new.deck_pfad), ('teilnehmer', new.teilnehmer_pfad), ('pdf', new.pdf_pfad),
      ('quellen', new.quellen_pfad), ('trainer-kurz', new.trainer_kurz_pfad), ('quellen-kurz', new.quellen_kurz_pfad)
    ) as x(ordner, pfad)
    where x.pfad is not null
  loop
    teile := string_to_array(r.pfad, '/');
    if v_slug is null
       or array_length(teile, 1) <> 3
       or teile[1] <> v_slug
       or teile[2] <> r.ordner
       or teile[3] = ''
       or teile[3] in ('.', '..')
       or r.pfad ~ '[[:cntrl:]\\]' then
      raise exception 'Datei gehört nicht in diesen Kurs oder Ordner: %', r.pfad using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.kt_kurstage_pfade_pruefen() from public, anon, authenticated;

create trigger kt_kurstage_pfade_pruefen
  before insert or update on public.kurstage
  for each row execute function public.kt_kurstage_pfade_pruefen();

-- ---------------------------------------------------------------------------
-- 4. Bucket "kt-vorlagen": Startpaket fuer eigene Kurse
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kt-vorlagen', 'kt-vorlagen', false, 41943040, array['application/zip']);

create policy "kt vorlagen lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'kt-vorlagen' and public.kt_ist_trainer());

create policy "kt vorlagen hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kt-vorlagen' and public.kt_ist_admin());

create policy "kt vorlagen ersetzen" on storage.objects
  for update to authenticated
  using (bucket_id = 'kt-vorlagen' and public.kt_ist_admin())
  with check (bucket_id = 'kt-vorlagen' and public.kt_ist_admin());

create policy "kt vorlagen loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'kt-vorlagen' and public.kt_ist_admin());

-- ---------------------------------------------------------------------------
-- Protokoll und Selbstpruefung (nur lesend)
-- ---------------------------------------------------------------------------
insert into public.kt_migrationen (version, name)
values ('20261116100000', 'kt_eigene_kurse');

do $$
declare n int; f regprocedure;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'kurse' and column_name = 'angelegt_im_tool'
                   and is_nullable = 'NO' and column_default = 'false') then
    raise exception 'KT-E01: Spalte angelegt_im_tool fehlt oder falsch';
  end if;
  if exists (select 1 from public.kurse where angelegt_im_tool) then
    raise exception 'KT-E02: bestehende Kurse als im Tool angelegt markiert';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.kurse'::regclass and conname = 'kurse_kuerzel_format' and convalidated)
     or not exists (select 1 from pg_index i where i.indrelid = 'public.kurse'::regclass and i.indisunique
                    and i.indnatts = 1 and i.indkey[0] = (select attnum from pg_attribute where attrelid = 'public.kurse'::regclass and attname = 'slug')) then
    raise exception 'KT-E03: Kuerzelformat oder eindeutiger Index auf slug fehlt';
  end if;
  -- bestehende Namen bestehen die Namenspruefung unveraendert
  if exists (select 1 from public.kurse k
             where k.name <> btrim(regexp_replace(k.name, '[[:space:]]+', ' ', 'g'))
                or char_length(k.name) not between 2 and 80
                or k.name ~ '[[:cntrl:]<>]'
                or k.name ~ '[\u0080-\u009F\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]') then
    raise exception 'KT-E04: ein bestehender Kursname besteht die neue Pruefung nicht';
  end if;
  -- bestehende Pfade folgen dem Schema
  if exists (
    select 1
    from public.kurstage t join public.kurse k on k.id = t.kurs_id
    cross join lateral (values
      ('trainer', t.deck_pfad), ('teilnehmer', t.teilnehmer_pfad), ('pdf', t.pdf_pfad), ('quellen', t.quellen_pfad),
      ('trainer-kurz', t.trainer_kurz_pfad), ('quellen-kurz', t.quellen_kurz_pfad)) as x(ordner, pfad)
    where x.pfad is not null
      and (array_length(string_to_array(x.pfad, '/'), 1) <> 3
           or split_part(x.pfad, '/', 1) <> k.slug
           or split_part(x.pfad, '/', 2) <> x.ordner
           or split_part(x.pfad, '/', 3) in ('', '.', '..')
           or x.pfad ~ '[[:cntrl:]\\]')) then
    raise exception 'KT-E05: ein bestehender Dateipfad passt nicht zum Schema';
  end if;
  select count(*) into n from pg_trigger
  where not tgisinternal and tgenabled = 'O' and (
        (tgrelid = 'public.kurse'::regclass and tgname in ('kt_kurse_pruefen', 'kt_kurse_kuerzel_frei', 'kt_kurse_loeschen_pruefen'))
     or (tgrelid = 'public.kurstage'::regclass and tgname = 'kt_kurstage_pfade_pruefen'));
  if n <> 4 then raise exception 'KT-E06: erwartet 4 aktive Trigger, gefunden %', n; end if;
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public'
             and p.proname in ('kt_kurse_pruefen', 'kt_kurse_kuerzel_frei', 'kt_kurse_loeschen_pruefen', 'kt_kurstage_pfade_pruefen')
  loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'KT-E07: % ist aufrufbar', f;
    end if;
    if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = f), false) then
      raise exception 'KT-E08: % nicht security definer mit leerem search_path', f;
    end if;
  end loop;
  if not exists (select 1 from storage.buckets where id = 'kt-vorlagen' and not public
                 and file_size_limit = 41943040 and allowed_mime_types = array['application/zip']) then
    raise exception 'KT-E09: Bucket kt-vorlagen fehlt, ist oeffentlich oder ohne Grenzen';
  end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'kt vorlagen %';
  if n <> 4 then raise exception 'KT-E10: erwartet 4 Regeln fuer kt-vorlagen, gefunden %', n; end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'kt decks %';
  if n <> 6 then raise exception 'KT-E11: Regeln des Buckets decks veraendert (%)', n; end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'kt fassungen %';
  if n <> 4 then raise exception 'KT-E12: Regeln des Buckets fassungen veraendert (%)', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename in ('kurse', 'kurstage');
  if n <> 8 then raise exception 'KT-E13: Regeln auf kurse/kurstage veraendert (%)', n; end if;
  if has_table_privilege('anon', 'public.kurse', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon', 'public.kurstage', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'KT-E14: anon hat Rechte';
  end if;
end
$$;

commit;
