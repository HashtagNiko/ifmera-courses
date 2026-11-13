-- Sicherung der Kurs-Tool-Daten und -Regeln vor einer Migration (CLAUDE.md §4 Nr. 4).
--
--   node scripts/sql.mjs --lesend supabase/sicherung.sql > backup/<datum>_<anlass>.json
--
-- Gesichert werden Tabelleninhalte, Regeln (Policies), Funktionen und Rechte des Kurs-Tools.
-- Die Dateien im Bucket nicht: Nikos Decks lassen sich jederzeit per Sync aus den Kursordnern neu
-- hochladen. Sobald Fassungen anderer Trainer im Bucket liegen (Baustein 4), muss das neu bedacht werden.
--
-- Neue kt_-Tabellen hier eintragen, sobald ihre Migration eingespielt ist; vorher fehlen sie und die
-- Abfrage scheitert.

select json_build_object(
  'erstellt_am', now(),
  'tabellen', json_build_object(
    'kurse',             (select coalesce(json_agg(t), '[]') from public.kurse t),
    'kurstage',          (select coalesce(json_agg(t), '[]') from public.kurstage t),
    'durchlaeufe',       (select coalesce(json_agg(t), '[]') from public.durchlaeufe t),
    'fortschritt',       (select coalesce(json_agg(t), '[]') from public.fortschritt t),
    -- kurs_zugriff gibt es seit 20261113160000 nicht mehr (aufgegangen in kt_trainer)
    'kt_migrationen',    (select coalesce(json_agg(t), '[]') from public.kt_migrationen t),
    'kt_trainer',        (select coalesce(json_agg(t), '[]') from public.kt_trainer t),
    'kt_kurs_freigaben', (select coalesce(json_agg(t), '[]') from public.kt_kurs_freigaben t)
  ),
  'policies', (
    select json_agg(p order by p.schemaname, p.tablename, p.policyname)
    from pg_policies p
    where (p.schemaname = 'public'
           and (p.tablename in ('kurse', 'kurstage', 'durchlaeufe', 'fortschritt')
                or p.tablename like 'kt\_%'))
       or (p.schemaname = 'storage' and p.tablename = 'objects')
  ),
  'funktionen', (
    select json_agg(json_build_object('name', p.oid::regprocedure::text, 'definition', pg_get_functiondef(p.oid)))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname = 'hat_kurszugriff' or p.proname like 'kt\_%')
  ),
  'rechte', (
    select json_agg(json_build_object('tabelle', g.table_name, 'rolle', g.grantee, 'recht', g.privilege_type))
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and (g.table_name in ('kurse', 'kurstage', 'durchlaeufe', 'fortschritt')
           or g.table_name like 'kt\_%')
  ),
  'bucket_dateien', (
    select json_agg(json_build_object('name', o.name, 'groesse', o.metadata->>'size', 'geaendert', o.updated_at) order by o.name)
    from storage.objects o where o.bucket_id = 'decks'
  )
) as sicherung;
