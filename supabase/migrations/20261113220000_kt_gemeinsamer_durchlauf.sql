-- Baustein 5 (ERSETZEND, GELB: nur nach Nikos "ja"): gemeinsamer Durchlauf.
--
-- Ein Durchlauf gehoert weiter seinem Besitzer. Neu kann er andere Trainer aufnehmen ("Mitwirkende")
-- und je Kurstag festlegen, wer ihn haelt; wer einen Tag haelt, waehlt dafuer SELBST eine eigene Fassung
-- (leer = Original). Alle im Durchlauf sehen Plan, Tagebuch und Haken und duerfen abhaken; wer zuletzt
-- abgehakt hat, haelt die Datenbank fest.
--
-- Neu:
--   * kt_durchlauf_trainer   Mitwirkende eines Durchlaufs
--   * kt_durchlauf_tage      Plan: Kurstag -> Trainer (+ eigene Fassung)
--   * fortschritt.geaendert_von, per Trigger gesetzt (nicht faelschbar, nur beim Abhaken)
--   * Hilfsfunktionen und Trigger
-- Ersetzt (deshalb gelb):
--   * Regeln auf durchlaeufe (lesen) und fortschritt (alle vier); durchlaeufe.kurs_id wird unveraenderlich
--   * Leseregel auf kt_deck_fassungen und Funktion kt_fassung_stufe: Fassungen, die ihr Besitzer in den Plan
--     eines Durchlaufs gesetzt hat, sehen alle Beteiligten zum Ansehen und Herunterladen (nicht das Quellpaket)
--
-- Regeln und Annahmen (SPEC.md, Baustein 5):
--   * Mitwirkende muessen den Kurs selbst sehen duerfen; verlieren sie den Zugang, sehen sie den Durchlauf
--     nicht mehr. Wer austritt oder ausgetragen wird, verliert seine Plantage (seine Fassung ist dann fuer
--     die anderen nicht mehr sichtbar).
--   * Plan und Mitwirkende aendert nur der Besitzer. Eine Fassung setzt nur, wer den Tag haelt, und nur eine
--     eigene Fassung dieses Tages. Wechselt der Trainer eines Tages, faellt die Fassung weg.
--   * Haken loeschen darf nur der Besitzer; Haken verschieben (anderer Durchlauf, anderer Tag) niemand.
--   * Die Tagesnotiz (fortschritt.notiz) gehoert zum Durchlauf: alle Beteiligten sehen und bearbeiten sie.
--     Privat bleiben die eigenen Folien-Notizen (kt_folien_notizen). (OFFENE-FRAGEN Nr. 23)
--
-- Nach dem zweiten Blick (Sub-Agent, 13.11.2026) verschaerft: Fassung im Plan nur durch ihren Besitzer;
-- Austreten raeumt den Plan; Haken nicht verschiebbar; geaendert_von nur beim Abhaken; Fremdschluessel mit
-- ON DELETE; Hilfsfunktionen nur fuer Beteiligte; kurs_id unveraenderlich; Spaltenrechte; Datenpruefung vorab.
-- Zweiter Blick auf die neue Fassung (15.11.2026): kt_fassung_passt nur ueber eigene Fassungen (die Planregel
-- haelt damit auch ohne Trigger); "wer"-Trigger laesst Folgeaenderungen stehen; Indizes; genauere Selbstpruefung.
-- Bekannt und gewollt (OFFENE-FRAGEN Nr. 24): Wer seine Fassung in den Plan setzt, zeigt sie allen im Durchlauf,
-- auch spaeter Aufgenommenen.
--
-- Rueckbau: supabase/rueckbau/20261113220000_kt_gemeinsamer_durchlauf.sql

begin;

set local lock_timeout = '3s';

-- Vorab: Jeder Haken gehoert zu einem Tag des Kurses seines Durchlaufs (die neuen Regeln setzen das voraus)
do $$
begin
  if exists (select 1 from public.fortschritt f join public.durchlaeufe d on d.id = f.durchlauf_id
             join public.kurstage t on t.id = f.kurstag_id where t.kurs_id <> d.kurs_id) then
    raise exception 'KT-G00: Haken zu Tagen eines anderen Kurses gefunden; erst bereinigen';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Tabellen und Spalte
-- ---------------------------------------------------------------------------
create table public.kt_durchlauf_trainer (
  durchlauf_id uuid not null references public.durchlaeufe (id) on delete cascade,
  trainer_id   uuid not null references public.kt_trainer (id) on delete cascade,
  angelegt_am  timestamptz not null default now(),
  primary key (durchlauf_id, trainer_id)
);
create index kt_durchlauf_trainer_trainer_idx on public.kt_durchlauf_trainer (trainer_id);

create table public.kt_durchlauf_tage (
  durchlauf_id uuid not null references public.durchlaeufe (id) on delete cascade,
  kurstag_id   uuid not null references public.kurstage (id) on delete cascade,
  trainer_id   uuid not null references public.kt_trainer (id) on delete cascade,
  -- leer = Original; die Fassung muss vom selben Kurstag sein; geloescht -> zurueck zum Original
  fassung_id   uuid,
  geaendert_am timestamptz not null default now(),
  primary key (durchlauf_id, kurstag_id),
  foreign key (fassung_id, kurstag_id)
    references public.kt_deck_fassungen (id, kurstag_id) on delete set null (fassung_id)
);

create index kt_durchlauf_tage_trainer_idx on public.kt_durchlauf_tage (trainer_id);
create index kt_durchlauf_tage_fassung_idx on public.kt_durchlauf_tage (fassung_id) where fassung_id is not null;

alter table public.kt_durchlauf_trainer enable row level security;
alter table public.kt_durchlauf_tage enable row level security;
revoke all on public.kt_durchlauf_trainer, public.kt_durchlauf_tage from anon, authenticated;
grant select, delete on public.kt_durchlauf_trainer, public.kt_durchlauf_tage to authenticated;
grant insert (durchlauf_id, trainer_id) on public.kt_durchlauf_trainer to authenticated;
grant insert (durchlauf_id, kurstag_id, trainer_id, fassung_id) on public.kt_durchlauf_tage to authenticated;
grant update (trainer_id, fassung_id) on public.kt_durchlauf_tage to authenticated;

comment on table public.kt_durchlauf_trainer is 'Mitwirkende eines Durchlaufs; muessen den Kurs selbst sehen duerfen.';
comment on table public.kt_durchlauf_tage is 'Plan eines Durchlaufs: wer haelt welchen Kurstag, mit welcher eigenen Fassung (leer = Original).';

alter table public.fortschritt add column geaendert_von uuid references public.kt_trainer (id) on delete set null;
comment on column public.fortschritt.geaendert_von is 'Wer zuletzt abgehakt oder den Haken zurueckgenommen hat (setzt die Datenbank).';
create index fortschritt_geaendert_von_idx on public.fortschritt (geaendert_von) where geaendert_von is not null;

-- Der Kurs eines Durchlaufs ist unveraenderlich (sonst zeigten Plan und Haken auf Tage eines anderen Kurses)
revoke update on public.durchlaeufe from authenticated;
grant update (name, start_am, ende_am, aktiv) on public.durchlaeufe to authenticated;

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------
-- Rolle des Angemeldeten in einem Durchlauf: 'besitzer', 'mitwirkend' oder null.
-- Immer Voraussetzung: Er darf den Kurs des Durchlaufs sehen.
create function public.kt_durchlauf_rolle(p_durchlauf_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when not public.kt_ist_trainer() then null
    when d.id is null then null
    when public.kt_kurs_stufe(d.kurs_id) is null then null
    when d.besitzer_id = auth.uid() then 'besitzer'
    when exists (select 1 from public.kt_durchlauf_trainer m where m.durchlauf_id = d.id and m.trainer_id = auth.uid())
      then 'mitwirkend'
  end
  from (select 1) eins left join public.durchlaeufe d on d.id = p_durchlauf_id;
$$;

-- Gehoert der Kurstag zum Kurs des Durchlaufs? Nur fuer Beteiligte aussagekraeftig.
create function public.kt_tag_im_durchlauf(p_durchlauf_id uuid, p_kurstag_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.kt_durchlauf_rolle(p_durchlauf_id) is not null and exists (
    select 1 from public.durchlaeufe d join public.kurstage t on t.kurs_id = d.kurs_id
    where d.id = p_durchlauf_id and t.id = p_kurstag_id
  );
$$;

-- Ist ein (aktiver) Trainer Besitzer oder Mitwirkender des Durchlaufs? Nur fuer Beteiligte aussagekraeftig.
create function public.kt_ist_im_durchlauf(p_durchlauf_id uuid, p_trainer_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.kt_durchlauf_rolle(p_durchlauf_id) is not null
    and exists (select 1 from public.kt_trainer t where t.id = p_trainer_id and t.aktiv)
    and (exists (select 1 from public.durchlaeufe d where d.id = p_durchlauf_id and d.besitzer_id = p_trainer_id)
         or exists (select 1 from public.kt_durchlauf_trainer m where m.durchlauf_id = p_durchlauf_id and m.trainer_id = p_trainer_id));
$$;

-- Passt eine Fassung zu einem Plantag: eigene Fassung des Angemeldeten, der den Tag haelt, gleicher Kurstag?
-- Antwortet nur ueber eigene Fassungen (verraet nichts ueber fremde).
create function public.kt_fassung_passt(p_fassung_id uuid, p_trainer_id uuid, p_kurstag_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_fassung_id is null or (public.kt_ist_trainer() and p_trainer_id = auth.uid() and exists (
    select 1 from public.kt_deck_fassungen f
    where f.id = p_fassung_id and f.besitzer_id = auth.uid() and f.kurstag_id = p_kurstag_id
  ));
$$;

-- Kurs eines Durchlaufs; nur fuer Beteiligte
create function public.kt_durchlauf_kurs(p_durchlauf_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select d.kurs_id from public.durchlaeufe d
  where d.id = p_durchlauf_id and public.kt_durchlauf_rolle(p_durchlauf_id) is not null;
$$;

-- Fassungen: zusaetzlich "nutzen" fuer Fassungen, die ihr Besitzer selbst fuer seinen Tag in den Plan eines
-- Durchlaufs gesetzt hat, an dem man beteiligt ist und dem er noch angehoert (sonst wie 20261113210000)
create or replace function public.kt_fassung_stufe(p_fassung_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when not public.kt_ist_trainer() then null
    when f.id is null then null
    when public.kt_kurs_stufe(t.kurs_id) is null then null
    when f.besitzer_id = auth.uid() then 'besitzer'
    else coalesce(
      (select case
         when fr.stufe = 'fassung' and not public.kt_kurs_stufe_mindestens(t.kurs_id, 'fassung') then 'nutzen'
         else fr.stufe
       end
       from public.kt_fassung_freigaben fr where fr.fassung_id = f.id and fr.trainer_id = auth.uid()),
      (select 'nutzen' from public.kt_durchlauf_tage dt
       where dt.fassung_id = f.id and dt.trainer_id = f.besitzer_id
         and public.kt_durchlauf_rolle(dt.durchlauf_id) is not null
         and public.kt_ist_im_durchlauf(dt.durchlauf_id, f.besitzer_id)
       limit 1)
    )
  end
  from (select 1) eins
  left join public.kt_deck_fassungen f on f.id = p_fassung_id
  left join public.kurstage t on t.id = f.kurstag_id;
$$;

revoke execute on function public.kt_durchlauf_rolle(uuid)              from public, anon;
revoke execute on function public.kt_tag_im_durchlauf(uuid, uuid)       from public, anon;
revoke execute on function public.kt_ist_im_durchlauf(uuid, uuid)       from public, anon;
revoke execute on function public.kt_fassung_passt(uuid, uuid, uuid)    from public, anon;
revoke execute on function public.kt_durchlauf_kurs(uuid)               from public, anon;
grant  execute on function public.kt_durchlauf_rolle(uuid)              to authenticated;
grant  execute on function public.kt_tag_im_durchlauf(uuid, uuid)       to authenticated;
grant  execute on function public.kt_ist_im_durchlauf(uuid, uuid)       to authenticated;
grant  execute on function public.kt_fassung_passt(uuid, uuid, uuid)    to authenticated;
grant  execute on function public.kt_durchlauf_kurs(uuid)               to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
-- Haken: nicht verschiebbar; "wer" nur beim Abhaken oder Zuruecknehmen, sonst unveraendert
create function public.kt_fortschritt_wer()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.durchlauf_id is distinct from old.durchlauf_id or new.kurstag_id is distinct from old.kurstag_id) then
    raise exception 'Ein Haken laesst sich nicht in einen anderen Durchlauf oder Tag verschieben.' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'INSERT' or new.vermittelt is distinct from old.vermittelt then
    new.geaendert_von := coalesce(auth.uid(), new.geaendert_von);
  elsif auth.uid() is not null and pg_trigger_depth() = 1 then
    -- nur bei direkten Aenderungen; Folgeaenderungen der Datenbank (ON DELETE SET NULL) bleiben stehen
    new.geaendert_von := old.geaendert_von;
  end if;
  new.geaendert_am := now();
  return new;
end;
$$;
revoke execute on function public.kt_fortschritt_wer() from public, anon, authenticated;
create trigger kt_fortschritt_wer
  before insert or update on public.fortschritt
  for each row execute function public.kt_fortschritt_wer();

-- Plan: Trainer wechselt nur der Besitzer (die Fassung faellt dabei weg); eine Fassung setzt nur, wer den
-- Tag haelt. Ohne Anmeldung (SQL-Editor, Wartung) greift die Sperre nicht.
create function public.kt_plan_pruefen()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.trainer_id is distinct from old.trainer_id then
    if public.kt_durchlauf_rolle(old.durchlauf_id) is distinct from 'besitzer' then
      raise exception 'Nur der Besitzer des Durchlaufs aendert, wer einen Tag haelt.' using errcode = 'insufficient_privilege';
    end if;
    new.fassung_id := null;
  end if;
  if new.fassung_id is not null
     and (tg_op = 'INSERT' or new.fassung_id is distinct from old.fassung_id)
     and new.trainer_id is distinct from auth.uid() then
    raise exception 'Eine Fassung setzt nur, wer den Tag haelt.' using errcode = 'insufficient_privilege';
  end if;
  new.geaendert_am := now();
  return new;
end;
$$;
revoke execute on function public.kt_plan_pruefen() from public, anon, authenticated;
create trigger kt_plan_pruefen
  before insert or update on public.kt_durchlauf_tage
  for each row execute function public.kt_plan_pruefen();

-- Wer austritt oder ausgetragen wird, verliert seine Plantage
create function public.kt_mitwirkender_entfernt()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.kt_durchlauf_tage where durchlauf_id = old.durchlauf_id and trainer_id = old.trainer_id;
  return old;
end;
$$;
revoke execute on function public.kt_mitwirkender_entfernt() from public, anon, authenticated;
create trigger kt_mitwirkender_entfernt
  after delete on public.kt_durchlauf_trainer
  for each row execute function public.kt_mitwirkender_entfernt();

-- ---------------------------------------------------------------------------
-- Regeln: Durchlaeufe und Haken (ersetzt)
-- ---------------------------------------------------------------------------
drop policy "kt durchlaeufe lesen" on public.durchlaeufe;
create policy "kt durchlaeufe lesen" on public.durchlaeufe
  for select to authenticated
  using (public.kt_ist_trainer() and (besitzer_id = auth.uid() or public.kt_durchlauf_rolle(id) = 'mitwirkend'));

drop policy "kt fortschritt lesen"    on public.fortschritt;
drop policy "kt fortschritt anlegen"  on public.fortschritt;
drop policy "kt fortschritt aendern"  on public.fortschritt;
drop policy "kt fortschritt loeschen" on public.fortschritt;

create policy "kt fortschritt lesen" on public.fortschritt
  for select to authenticated
  using (public.kt_durchlauf_rolle(durchlauf_id) is not null);

create policy "kt fortschritt anlegen" on public.fortschritt
  for insert to authenticated
  with check (public.kt_durchlauf_rolle(durchlauf_id) is not null and public.kt_tag_im_durchlauf(durchlauf_id, kurstag_id));

create policy "kt fortschritt aendern" on public.fortschritt
  for update to authenticated
  using (public.kt_durchlauf_rolle(durchlauf_id) is not null)
  with check (public.kt_durchlauf_rolle(durchlauf_id) is not null and public.kt_tag_im_durchlauf(durchlauf_id, kurstag_id));

create policy "kt fortschritt loeschen" on public.fortschritt
  for delete to authenticated
  using (public.kt_durchlauf_rolle(durchlauf_id) = 'besitzer');

-- ---------------------------------------------------------------------------
-- Regeln: Mitwirkende und Plan
-- ---------------------------------------------------------------------------
create policy "mitwirkende lesen" on public.kt_durchlauf_trainer
  for select to authenticated
  using (public.kt_durchlauf_rolle(durchlauf_id) is not null);

create policy "mitwirkende anlegen" on public.kt_durchlauf_trainer
  for insert to authenticated
  with check (
    public.kt_durchlauf_rolle(durchlauf_id) = 'besitzer' and trainer_id <> auth.uid()
    and public.kt_kurs_zugang_von(trainer_id, public.kt_durchlauf_kurs(durchlauf_id))
  );

-- Austragen: der Besitzer jeden, ein Mitwirkender sich selbst
create policy "mitwirkende loeschen" on public.kt_durchlauf_trainer
  for delete to authenticated
  using (public.kt_durchlauf_rolle(durchlauf_id) = 'besitzer' or (trainer_id = auth.uid() and public.kt_ist_trainer()));

create policy "plan lesen" on public.kt_durchlauf_tage
  for select to authenticated
  using (public.kt_durchlauf_rolle(durchlauf_id) is not null);

create policy "plan anlegen" on public.kt_durchlauf_tage
  for insert to authenticated
  with check (
    public.kt_durchlauf_rolle(durchlauf_id) = 'besitzer'
    and public.kt_tag_im_durchlauf(durchlauf_id, kurstag_id)
    and public.kt_ist_im_durchlauf(durchlauf_id, trainer_id)
    and (fassung_id is null or trainer_id = auth.uid())
    and public.kt_fassung_passt(fassung_id, trainer_id, kurstag_id)
  );

create policy "plan aendern" on public.kt_durchlauf_tage
  for update to authenticated
  using (
    public.kt_durchlauf_rolle(durchlauf_id) = 'besitzer'
    or (trainer_id = auth.uid() and public.kt_durchlauf_rolle(durchlauf_id) = 'mitwirkend')
  )
  with check (
    public.kt_ist_im_durchlauf(durchlauf_id, trainer_id)
    and public.kt_fassung_passt(fassung_id, trainer_id, kurstag_id)
    and (public.kt_durchlauf_rolle(durchlauf_id) = 'besitzer' or trainer_id = auth.uid())
  );

create policy "plan loeschen" on public.kt_durchlauf_tage
  for delete to authenticated
  using (public.kt_durchlauf_rolle(durchlauf_id) = 'besitzer');

-- ---------------------------------------------------------------------------
-- Fassungen im Plan: fuer alle Beteiligten sichtbar (ersetzt die Leseregel aus 20261113210000)
-- ---------------------------------------------------------------------------
drop policy "fassungen lesen" on public.kt_deck_fassungen;
create policy "fassungen lesen" on public.kt_deck_fassungen
  for select to authenticated
  using (
    public.kt_ist_trainer()
    and public.kt_kurs_stufe((select t.kurs_id from public.kurstage t where t.id = kt_deck_fassungen.kurstag_id)) is not null
    and (kt_deck_fassungen.besitzer_id = auth.uid()
         or exists (select 1 from public.kt_fassung_freigaben fr
                    where fr.fassung_id = kt_deck_fassungen.id and fr.trainer_id = auth.uid())
         or exists (select 1 from public.kt_durchlauf_tage dt
                    where dt.fassung_id = kt_deck_fassungen.id and dt.trainer_id = kt_deck_fassungen.besitzer_id
                      and public.kt_durchlauf_rolle(dt.durchlauf_id) is not null
                      and public.kt_ist_im_durchlauf(dt.durchlauf_id, kt_deck_fassungen.besitzer_id)))
  );

-- ---------------------------------------------------------------------------
-- Protokoll und Selbstpruefung
-- ---------------------------------------------------------------------------
insert into public.kt_migrationen (version, name)
values ('20261113220000', 'kt_gemeinsamer_durchlauf');

do $$
declare n int; f regprocedure;
begin
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'durchlaeufe';
  if n <> 4 then raise exception 'KT-G01: erwartet 4 Regeln auf durchlaeufe, gefunden %', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'fortschritt'
    and coalesce(qual, with_check) like '%kt_durchlauf_rolle%';
  if n <> 4 then raise exception 'KT-G02: erwartet 4 neue Regeln auf fortschritt, gefunden %', n; end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'durchlaeufe'
                 and policyname = 'kt durchlaeufe lesen' and qual like '%kt_durchlauf_rolle%') then
    raise exception 'KT-G02b: Leseregel auf durchlaeufe nicht ersetzt';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'kt_durchlauf_trainer';
  if n <> 3 then raise exception 'KT-G03: erwartet 3 Regeln auf kt_durchlauf_trainer, gefunden %', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'kt_durchlauf_tage';
  if n <> 4 then raise exception 'KT-G04: erwartet 4 Regeln auf kt_durchlauf_tage, gefunden %', n; end if;
  if not exists (select 1 from pg_policies where tablename = 'kt_deck_fassungen' and policyname = 'fassungen lesen' and qual like '%kt_durchlauf_tage%')
     or not exists (select 1 from pg_proc where proname = 'kt_fassung_stufe' and prosrc like '%kt_durchlauf_tage%') then
    raise exception 'KT-G05: Leseregel oder Stufe der Fassungen nicht ersetzt';
  end if;
  if (select c.relrowsecurity from pg_class c where c.oid = 'public.kt_durchlauf_trainer'::regclass) is not true
     or (select c.relrowsecurity from pg_class c where c.oid = 'public.kt_durchlauf_tage'::regclass) is not true then
    raise exception 'KT-G06: RLS fehlt';
  end if;
  if has_table_privilege('anon', 'public.kt_durchlauf_trainer', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon', 'public.kt_durchlauf_tage', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'KT-G07: anon hat Rechte';
  end if;
  if has_table_privilege('authenticated', 'public.kt_durchlauf_trainer', 'UPDATE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated', 'public.kt_durchlauf_tage', 'TRUNCATE,REFERENCES,TRIGGER')
     or has_column_privilege('authenticated', 'public.kt_durchlauf_tage', 'durchlauf_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.kt_durchlauf_tage', 'kurstag_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.durchlaeufe', 'kurs_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.durchlaeufe', 'besitzer_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.durchlaeufe', 'id', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.durchlaeufe', 'name', 'UPDATE') then
    raise exception 'KT-G08: unnoetige oder zu weite Rechte';
  end if;
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.proname in
             ('kt_durchlauf_rolle', 'kt_tag_im_durchlauf', 'kt_ist_im_durchlauf', 'kt_fassung_passt', 'kt_durchlauf_kurs')
  loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'KT-G09: anon darf % ausfuehren', f; end if;
    if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = f), false) then
      raise exception 'KT-G10: % nicht security definer mit leerem search_path', f;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.kt_fortschritt_wer()', 'execute')
     or has_function_privilege('authenticated', 'public.kt_plan_pruefen()', 'execute')
     or has_function_privilege('authenticated', 'public.kt_mitwirkender_entfernt()', 'execute') then
    raise exception 'KT-G11: Triggerfunktion ist aufrufbar';
  end if;
  select count(*) into n from pg_trigger
  where tgname in ('kt_fortschritt_wer', 'kt_plan_pruefen', 'kt_mitwirkender_entfernt') and tgenabled = 'O';
  if n <> 3 then raise exception 'KT-G12: erwartet 3 aktive Trigger, gefunden %', n; end if;
end
$$;

commit;
