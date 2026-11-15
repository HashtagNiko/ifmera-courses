-- Rueckbau zu supabase/migrations/20261113220000_kt_gemeinsamer_durchlauf.sql
--
-- Stellt die Regeln vor Baustein 5 wieder her (Durchlaeufe und Haken nur fuer den Besitzer, Fassungen
-- nur fuer Besitzer und per Freigabe). ACHTUNG, loescht Daten: Mitwirkende, Plan und "geaendert_von"
-- der Haken. Vorher sichern (supabase/sicherung.sql). Zuerst den App-Code zuruecknehmen.
--
-- Reihenfolge: erst Regeln und Funktion ersetzen, die auf neue Tabellen und Funktionen zeigen, dann diese
-- entfernen (sonst verweigert die Datenbank das Loeschen).

begin;

set local lock_timeout = '3s';

-- Fassungen: Leseregel und Stufe wie in 20261113210000
drop policy if exists "fassungen lesen" on public.kt_deck_fassungen;
create policy "fassungen lesen" on public.kt_deck_fassungen
  for select to authenticated
  using (
    public.kt_ist_trainer()
    and public.kt_kurs_stufe((select t.kurs_id from public.kurstage t where t.id = kt_deck_fassungen.kurstag_id)) is not null
    and (kt_deck_fassungen.besitzer_id = auth.uid()
         or exists (select 1 from public.kt_fassung_freigaben fr
                    where fr.fassung_id = kt_deck_fassungen.id and fr.trainer_id = auth.uid()))
  );

create or replace function public.kt_fassung_stufe(p_fassung_id uuid)
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

-- Durchlaeufe und Haken wie in 20261113160000
drop policy if exists "kt durchlaeufe lesen" on public.durchlaeufe;
create policy "kt durchlaeufe lesen" on public.durchlaeufe
  for select to authenticated
  using (public.kt_ist_trainer() and besitzer_id = auth.uid());

drop policy if exists "kt fortschritt lesen"    on public.fortschritt;
drop policy if exists "kt fortschritt anlegen"  on public.fortschritt;
drop policy if exists "kt fortschritt aendern"  on public.fortschritt;
drop policy if exists "kt fortschritt loeschen" on public.fortschritt;
create policy "kt fortschritt lesen" on public.fortschritt
  for select to authenticated using (public.kt_ist_durchlaufbesitzer(durchlauf_id));
create policy "kt fortschritt anlegen" on public.fortschritt
  for insert to authenticated with check (public.kt_ist_durchlaufbesitzer(durchlauf_id));
create policy "kt fortschritt aendern" on public.fortschritt
  for update to authenticated
  using (public.kt_ist_durchlaufbesitzer(durchlauf_id)) with check (public.kt_ist_durchlaufbesitzer(durchlauf_id));
create policy "kt fortschritt loeschen" on public.fortschritt
  for delete to authenticated using (public.kt_ist_durchlaufbesitzer(durchlauf_id));

-- Spaltenrechte auf durchlaeufe wie vorher (ganze Tabelle)
revoke update (name, start_am, ende_am, aktiv) on public.durchlaeufe from authenticated;
grant update on public.durchlaeufe to authenticated;

-- Trigger, Spalte, Tabellen, Funktionen
drop trigger if exists kt_fortschritt_wer on public.fortschritt;
drop function if exists public.kt_fortschritt_wer();
alter table public.fortschritt drop column if exists geaendert_von;

drop table if exists public.kt_durchlauf_tage;      -- nimmt Trigger kt_plan_pruefen mit
drop table if exists public.kt_durchlauf_trainer;   -- nimmt Trigger kt_mitwirkender_entfernt mit
drop function if exists public.kt_plan_pruefen();
drop function if exists public.kt_mitwirkender_entfernt();
drop function if exists public.kt_durchlauf_kurs(uuid);
drop function if exists public.kt_fassung_passt(uuid, uuid, uuid);
drop function if exists public.kt_ist_im_durchlauf(uuid, uuid);
drop function if exists public.kt_tag_im_durchlauf(uuid, uuid);
drop function if exists public.kt_durchlauf_rolle(uuid);

delete from public.kt_migrationen where version = '20261113220000';

do $$
declare n int;
begin
  if to_regclass('public.kt_durchlauf_tage') is not null or to_regclass('public.kt_durchlauf_trainer') is not null then
    raise exception 'KT-RG01: Tabellen noch da';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename in ('durchlaeufe', 'fortschritt');
  if n <> 8 then raise exception 'KT-RG02: erwartet 8 Regeln auf durchlaeufe/fortschritt, gefunden %', n; end if;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname in ('kt_durchlauf_rolle', 'kt_tag_im_durchlauf', 'kt_ist_im_durchlauf',
    'kt_fassung_passt', 'kt_durchlauf_kurs', 'kt_fortschritt_wer', 'kt_plan_pruefen', 'kt_mitwirkender_entfernt');
  if n <> 0 then raise exception 'KT-RG03: % Funktionen von Baustein 5 noch da', n; end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'fortschritt' and column_name = 'geaendert_von') then
    raise exception 'KT-RG04: Spalte fortschritt.geaendert_von noch da';
  end if;
  if exists (select 1 from pg_policies where tablename = 'kt_deck_fassungen' and qual like '%kt_durchlauf%')
     or exists (select 1 from pg_proc where proname = 'kt_fassung_stufe' and prosrc like '%kt_durchlauf%') then
    raise exception 'KT-RG05: Fassungen verweisen noch auf den Plan';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'kt_fortschritt_wer') then
    raise exception 'KT-RG06: Trigger auf fortschritt noch da';
  end if;
  if not has_table_privilege('authenticated', 'public.durchlaeufe', 'UPDATE') then
    raise exception 'KT-RG07: Aendern-Recht auf durchlaeufe nicht wiederhergestellt';
  end if;
end
$$;

commit;
