-- Baustein 1, Schritt A (hinzufuegend): Besitz und Freigaben fuer mehrere Trainer.
--
-- Neu:
--   * kt_migrationen     Protokoll der Kurs-Tool-Migrationen. supabase_migrations gehoert dem
--                        Pruefungstool und bleibt unberuehrt.
--   * kt_trainer         wer das Kurs-Tool nutzt, mit Anzeigename und Rolle. Uebernimmt kurs_zugriff.
--   * kurse.besitzer_id, durchlaeufe.besitzer_id
--                        jeder Kurs und jeder Durchlauf gehoert genau einem Trainer; bestehende
--                        gehoeren dem bisher einzigen freigeschalteten Konto (Niko).
--   * kt_kurs_freigaben  der Besitzer gibt einen Kurs an einen Trainer frei: nutzen, notizen, fassung
--   * Hilfsfunktionen    fuer die Regeln in Schritt C
--
-- Unveraendert: Die bestehenden Regeln auf kurse, kurstage, durchlaeufe, fortschritt, kurs_zugriff und
-- im Bucket. Sie werden erst in Schritt C ersetzt (gelb, nach Nikos "ja"). Bis dahin aendert sich fuer
-- niemanden etwas an Rechten: nur Konten in kurs_zugriff kommen an die Daten.
--
-- Rechte: Supabase vergibt in diesem Projekt fuer neue Tabellen und Funktionen standardmaessig alle
-- Rechte an anon und authenticated (pg_default_acl). Deshalb wird hier alles zuerst entzogen und dann
-- nur das Noetige vergeben.
--
-- Rueckbau: supabase/rueckbau/20261113150000_kt_besitz_und_freigaben.sql
--
-- Nebenwirkungen (gewollt):
--   * Nikos Konto laesst sich nicht mehr loeschen, solange ihm Kurse oder Durchlaeufe gehoeren
--     (auth.users -> kt_trainer kaskadiert, besitzer_id blockiert).
--   * Ein Insert in kurse/durchlaeufe ohne Anmeldung (SQL-Editor, service_role) braucht ab jetzt eine
--     ausdrueckliche besitzer_id.

begin;

-- kt_trainer verweist auf auth.users; das sperrt auth.users kurz gegen Aenderungen. Muss die Datei auf
-- eine Sperre warten, bricht sie nach 3 Sekunden ab (und aendert nichts), statt Anmeldungen im
-- Pruefungstool aufzuhalten.
set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Protokoll
-- ---------------------------------------------------------------------------
create table public.kt_migrationen (
  version        text primary key,
  name           text not null,
  eingespielt_am timestamptz not null default now()
);
alter table public.kt_migrationen enable row level security;
revoke all on public.kt_migrationen from anon, authenticated;

comment on table public.kt_migrationen is
  'Welche Migrationen des Kurs-Tools eingespielt sind. Nur fuer die Datenbank selbst, nicht ueber die API.';

-- ---------------------------------------------------------------------------
-- Trainer
-- ---------------------------------------------------------------------------
create table public.kt_trainer (
  id          uuid primary key references auth.users (id) on delete cascade,
  -- steht in der Fusszeile der Decks und bei fremden Kursen ("von ...")
  anzeigename text not null check (char_length(btrim(anzeigename)) between 1 and 80),
  rolle       text not null default 'trainer' check (rolle in ('admin', 'trainer')),
  aktiv       boolean not null default true,
  angelegt_am timestamptz not null default now()
);
alter table public.kt_trainer enable row level security;
revoke all on public.kt_trainer from anon, authenticated;
-- Anlegen und Aendern laeuft ueber Migrationen bzw. SQL (gelb), nicht ueber die App.
grant select on public.kt_trainer to authenticated;

comment on table public.kt_trainer is
  'Trainer des Kurs-Tools. Ersetzt kurs_zugriff. Nicht verwechseln mit public.trainer (Pruefungstool).';

-- Uebernahme aus kurs_zugriff: dort steht bisher genau ein Konto (Niko).
insert into public.kt_trainer (id, anzeigename, rolle)
select z.trainer_id, 'Herr Krnic', 'admin'
from public.kurs_zugriff z;

-- ---------------------------------------------------------------------------
-- Besitzer an Kursen und Durchlaeufen
-- ---------------------------------------------------------------------------
-- Ohne ON DELETE CASCADE: Ein Trainer mit Kursen oder Durchlaeufen laesst sich nicht versehentlich
-- samt Inhalten loeschen.
alter table public.kurse add column besitzer_id uuid references public.kt_trainer (id);
update public.kurse set besitzer_id = (select t.id from public.kt_trainer t where t.rolle = 'admin');
alter table public.kurse alter column besitzer_id set default auth.uid();
alter table public.kurse alter column besitzer_id set not null;
create index kurse_besitzer_idx on public.kurse (besitzer_id);

alter table public.durchlaeufe add column besitzer_id uuid references public.kt_trainer (id);
update public.durchlaeufe set besitzer_id = (select t.id from public.kt_trainer t where t.rolle = 'admin');
alter table public.durchlaeufe alter column besitzer_id set default auth.uid();
alter table public.durchlaeufe alter column besitzer_id set not null;
create index durchlaeufe_besitzer_idx on public.durchlaeufe (besitzer_id);

-- ---------------------------------------------------------------------------
-- Freigaben
-- ---------------------------------------------------------------------------
create table public.kt_kurs_freigaben (
  kurs_id     uuid not null references public.kurse (id) on delete cascade,
  trainer_id  uuid not null references public.kt_trainer (id) on delete cascade,
  stufe       text not null check (stufe in ('nutzen', 'notizen', 'fassung')),
  angelegt_am timestamptz not null default now(),
  primary key (kurs_id, trainer_id)
);
create index kt_kurs_freigaben_trainer_idx on public.kt_kurs_freigaben (trainer_id);
alter table public.kt_kurs_freigaben enable row level security;
revoke all on public.kt_kurs_freigaben from anon, authenticated;
grant select, insert, update, delete on public.kt_kurs_freigaben to authenticated;

comment on table public.kt_kurs_freigaben is
  'Freigabe eines Kurses an einen Trainer. Stufen bauen aufeinander auf: nutzen < notizen < fassung.';

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------
-- security definer: Die Funktionen lesen kt_trainer, kurse und kt_kurs_freigaben unabhaengig von den
-- Regeln der aufrufenden Tabelle; sonst wuerden sich Regeln gegenseitig aufrufen.
-- search_path leer: alle Namen voll qualifiziert, nichts laesst sich unterschieben.

-- Ist der Angemeldete ein aktiver Trainer des Kurs-Tools?
create function public.kt_ist_trainer()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.kt_trainer t where t.id = auth.uid() and t.aktiv
  );
$$;

-- Ist der Angemeldete ein aktiver Admin?
create function public.kt_ist_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.kt_trainer t where t.id = auth.uid() and t.aktiv and t.rolle = 'admin'
  );
$$;

-- Gehoert der Kurs dem Angemeldeten (und ist er aktiver Trainer)?
create function public.kt_ist_kursbesitzer(p_kurs_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.kt_ist_trainer() and exists (
    select 1 from public.kurse k where k.id = p_kurs_id and k.besitzer_id = auth.uid()
  );
$$;

-- Was darf der Angemeldete an diesem Kurs? 'besitzer', eine Freigabestufe oder null (nichts).
create function public.kt_kurs_stufe(p_kurs_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when not public.kt_ist_trainer() then null
    when exists (select 1 from public.kurse k where k.id = p_kurs_id and k.besitzer_id = auth.uid())
      then 'besitzer'
    else (
      select f.stufe from public.kt_kurs_freigaben f
      where f.kurs_id = p_kurs_id and f.trainer_id = auth.uid()
    )
  end;
$$;

-- Hat der Angemeldete an diesem Kurs mindestens die genannte Stufe?
-- Reihenfolge: nutzen < notizen < fassung < besitzer. Unbekannte Stufe oder kein Zugriff: false.
create function public.kt_kurs_stufe_mindestens(p_kurs_id uuid, p_stufe text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    array_position(array['nutzen', 'notizen', 'fassung', 'besitzer'], public.kt_kurs_stufe(p_kurs_id))
      >= array_position(array['nutzen', 'notizen', 'fassung', 'besitzer'], p_stufe),
    false
  );
$$;

-- Kurs zu einem Kuerzel. Fuer die Bucket-Regeln: der erste Ordner eines Pfads ist das Kurs-Kuerzel.
-- Nur fuer aktive Trainer: "authenticated" umfasst in diesem Projekt auch anonyme Teilnehmer des
-- Pruefungstools, und die sollen ueber diese Funktion keine Kurs-IDs erfahren.
create function public.kt_kurs_id(p_kuerzel text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select k.id from public.kurse k where k.slug = p_kuerzel and public.kt_ist_trainer();
$$;

revoke execute on function public.kt_ist_trainer()                       from public, anon;
revoke execute on function public.kt_ist_admin()                         from public, anon;
revoke execute on function public.kt_ist_kursbesitzer(uuid)              from public, anon;
revoke execute on function public.kt_kurs_stufe(uuid)                   from public, anon;
revoke execute on function public.kt_kurs_stufe_mindestens(uuid, text)   from public, anon;
revoke execute on function public.kt_kurs_id(text)                       from public, anon;
grant  execute on function public.kt_ist_trainer()                       to authenticated;
grant  execute on function public.kt_ist_admin()                         to authenticated;
grant  execute on function public.kt_ist_kursbesitzer(uuid)              to authenticated;
grant  execute on function public.kt_kurs_stufe(uuid)                    to authenticated;
grant  execute on function public.kt_kurs_stufe_mindestens(uuid, text)   to authenticated;
grant  execute on function public.kt_kurs_id(text)                       to authenticated;

-- ---------------------------------------------------------------------------
-- Regeln fuer die neuen Tabellen
-- ---------------------------------------------------------------------------
-- Trainer sehen sich selbst (auch deaktiviert) und als aktive Trainer alle aktiven Trainer,
-- damit der Besitzer bei Freigaben jemanden auswaehlen kann.
create policy "trainer lesen" on public.kt_trainer
  for select to authenticated
  using (id = auth.uid() or (aktiv and public.kt_ist_trainer()));

-- Freigaben sieht der Besitzer des Kurses und der Trainer, dem sie gilt.
create policy "freigaben lesen" on public.kt_kurs_freigaben
  for select to authenticated
  using (public.kt_ist_kursbesitzer(kurs_id) or (trainer_id = auth.uid() and public.kt_ist_trainer()));

-- Anlegen, aendern, loeschen nur der Besitzer; an sich selbst freigeben ergibt keinen Sinn.
create policy "freigaben anlegen" on public.kt_kurs_freigaben
  for insert to authenticated
  with check (public.kt_ist_kursbesitzer(kurs_id) and trainer_id <> auth.uid());

create policy "freigaben aendern" on public.kt_kurs_freigaben
  for update to authenticated
  using (public.kt_ist_kursbesitzer(kurs_id))
  with check (public.kt_ist_kursbesitzer(kurs_id) and trainer_id <> auth.uid());

create policy "freigaben loeschen" on public.kt_kurs_freigaben
  for delete to authenticated
  using (public.kt_ist_kursbesitzer(kurs_id));

-- ---------------------------------------------------------------------------
-- Protokoll-Eintrag und Selbstpruefung
-- ---------------------------------------------------------------------------
insert into public.kt_migrationen (version, name)
values ('20261113150000', 'kt_besitz_und_freigaben');

do $$
declare
  n int;
  f regprocedure;
begin
  select count(*) into n from public.kt_trainer;
  if n <> 1 then raise exception 'KT-A01: erwartet genau 1 Trainer aus kurs_zugriff, gefunden %', n; end if;

  select count(*) into n from public.kt_trainer where rolle = 'admin' and aktiv;
  if n <> 1 then raise exception 'KT-A02: erwartet genau 1 aktiven Admin, gefunden %', n; end if;

  select count(*) into n from public.kurse where besitzer_id is null;
  if n <> 0 then raise exception 'KT-A03: % Kurse ohne Besitzer', n; end if;

  select count(*) into n from public.durchlaeufe where besitzer_id is null;
  if n <> 0 then raise exception 'KT-A04: % Durchlaeufe ohne Besitzer', n; end if;

  select count(*) into n
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'r' and c.relname like 'kt\_%' and not c.relrowsecurity;
  if n <> 0 then raise exception 'KT-A05: % kt_-Tabellen ohne RLS', n; end if;

  -- has_table_privilege beruecksichtigt auch Rechte ueber PUBLIC
  select count(*) into n
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'r' and c.relname like 'kt\_%'
    and has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  if n <> 0 then raise exception 'KT-A06: anon hat Rechte auf % kt_-Tabellen', n; end if;

  select count(*) into n from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public' and table_name = 'kt_migrationen';
  if n <> 0 then raise exception 'KT-A07: authenticated hat Rechte auf kt_migrationen'; end if;

  select count(*) into n from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public' and table_name = 'kt_trainer'
    and privilege_type <> 'SELECT';
  if n <> 0 then raise exception 'KT-A08: authenticated darf kt_trainer mehr als lesen'; end if;

  select count(*) into n from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public' and table_name = 'kt_kurs_freigaben'
    and privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
  if n <> 0 then raise exception 'KT-A09: authenticated hat unnoetige Rechte auf kt_kurs_freigaben'; end if;

  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname like 'kt\_%'
  loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'KT-A10: anon darf % ausfuehren', f;
    end if;
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'KT-A11: authenticated darf % nicht ausfuehren', f;
    end if;
    if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = f), false) then
      raise exception 'KT-A12: % ist nicht security definer mit leerem search_path', f;
    end if;
  end loop;

  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname like 'kt\_%';
  if n <> 6 then raise exception 'KT-A13: erwartet 6 kt_-Funktionen, gefunden %', n; end if;

  -- Bestehende Regeln unveraendert (14 auf den Tabellen, 3 im Bucket; Stand 13.11.2026)
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename in ('kurse', 'kurstage', 'durchlaeufe', 'fortschritt', 'kurs_zugriff');
  if n <> 14 then raise exception 'KT-A14: erwartet 14 bestehende Regeln, gefunden %', n; end if;

  select count(*) into n from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname like 'decks %';
  if n <> 3 then raise exception 'KT-A15: erwartet 3 Bucket-Regeln, gefunden %', n; end if;

  select count(*) into n from pg_policies where schemaname = 'public' and tablename like 'kt\_%';
  if n <> 5 then raise exception 'KT-A16: erwartet 5 Regeln auf kt_-Tabellen, gefunden %', n; end if;
end
$$;

commit;
