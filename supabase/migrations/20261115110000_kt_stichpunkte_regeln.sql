-- Baustein 7, Teil 2 (ERSETZEND, GELB: nur nach Nikos "ja"): Zugriff nach Notiz-Umfang.
--
-- 1. Ersetzt die Regel "kt decks lesen" auf storage.objects (Bucket "decks"). Neu je Unterordner:
--      trainer/       ab "nutzen",  nur mit Notiz-Umfang "voll" (ausfuehrliche Trainer-Notizen)
--      quellen/       ab "fassung", nur mit Notiz-Umfang "voll"
--      trainer-kurz/  ab "nutzen"  (Stichpunkt-Fassung)
--      quellen-kurz/  ab "fassung" (Stichpunkt-Quellpaket)
--      teilnehmer/, pdf/  ab "nutzen" (keine Trainer-Notizen darin)
--      alles andere   gesperrt (vorher: ab "nutzen"; dort liegen keine Dateien)
--    Besitzer haben immer "voll". Die Regel fuer verwaiste Dateien (Admin) bleibt unveraendert.
-- 2. Fremde Fassungen enthalten die ausfuehrlichen Notizen ihres Besitzers. Wer in einem Kurs nur
--    Stichpunkte bekommt, sieht dort deshalb keine fremden Fassungen, weder per Freigabe noch im Plan
--    eines gemeinsamen Durchlaufs (ersetzt kt_fassung_stufe und "fassungen lesen" aus 20261113220000).
--    Eigene Fassungen bleiben sichtbar.
-- Fuer bestehende Freigaben (alle "voll") aendert sich nichts.
--
-- Rueckbau: supabase/rueckbau/20261115110000_kt_stichpunkte_regeln.sql

begin;

set local lock_timeout = '3s';

-- 1. Deck-Dateien ------------------------------------------------------------
drop policy "kt decks lesen" on storage.objects;
create policy "kt decks lesen" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'decks'
    and case (storage.foldername(name))[2]
      when 'trainer' then
        public.kt_kurs_stufe_mindestens(public.kt_kurs_id((storage.foldername(name))[1]), 'nutzen')
        and public.kt_kurs_notiz_umfang(public.kt_kurs_id((storage.foldername(name))[1])) = 'voll'
      when 'quellen' then
        public.kt_kurs_stufe_mindestens(public.kt_kurs_id((storage.foldername(name))[1]), 'fassung')
        and public.kt_kurs_notiz_umfang(public.kt_kurs_id((storage.foldername(name))[1])) = 'voll'
      when 'trainer-kurz' then
        public.kt_kurs_stufe_mindestens(public.kt_kurs_id((storage.foldername(name))[1]), 'nutzen')
      when 'quellen-kurz' then
        public.kt_kurs_stufe_mindestens(public.kt_kurs_id((storage.foldername(name))[1]), 'fassung')
      when 'teilnehmer' then
        public.kt_kurs_stufe_mindestens(public.kt_kurs_id((storage.foldername(name))[1]), 'nutzen')
      when 'pdf' then
        public.kt_kurs_stufe_mindestens(public.kt_kurs_id((storage.foldername(name))[1]), 'nutzen')
      else false
    end
  );

-- 2. Fremde Fassungen nur mit Notiz-Umfang "voll" -----------------------------
create or replace function public.kt_fassung_stufe(p_fassung_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when not public.kt_ist_trainer() then null
    when f.id is null then null
    when public.kt_kurs_stufe(t.kurs_id) is null then null
    when f.besitzer_id = auth.uid() then 'besitzer'
    -- fremde Fassungen enthalten ausfuehrliche Notizen: nur fuer Notiz-Umfang "voll"
    when public.kt_kurs_notiz_umfang(t.kurs_id) is distinct from 'voll' then null
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

drop policy "fassungen lesen" on public.kt_deck_fassungen;
create policy "fassungen lesen" on public.kt_deck_fassungen
  for select to authenticated
  using (
    public.kt_ist_trainer()
    and public.kt_kurs_stufe((select t.kurs_id from public.kurstage t where t.id = kt_deck_fassungen.kurstag_id)) is not null
    and (kt_deck_fassungen.besitzer_id = auth.uid()
         or (public.kt_kurs_notiz_umfang((select t.kurs_id from public.kurstage t where t.id = kt_deck_fassungen.kurstag_id)) = 'voll'
             and (exists (select 1 from public.kt_fassung_freigaben fr
                          where fr.fassung_id = kt_deck_fassungen.id and fr.trainer_id = auth.uid())
                  or exists (select 1 from public.kt_durchlauf_tage dt
                             where dt.fassung_id = kt_deck_fassungen.id and dt.trainer_id = kt_deck_fassungen.besitzer_id
                               and public.kt_durchlauf_rolle(dt.durchlauf_id) is not null
                               and public.kt_ist_im_durchlauf(dt.durchlauf_id, kt_deck_fassungen.besitzer_id)))))
  );

insert into public.kt_migrationen (version, name) values ('20261115110000', 'kt_stichpunkte_regeln');

do $$
declare n int;
begin
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'kt decks%';
  if n <> 6 then raise exception 'KT-SR01: erwartet 6 Regeln "kt decks", gefunden %', n; end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'kt decks lesen' and qual like '%kt_kurs_notiz_umfang%' and qual like '%trainer-kurz%') then
    raise exception 'KT-SR02: Leseregel der Decks nicht ersetzt';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'kt_deck_fassungen' and policyname = 'fassungen lesen'
                 and qual like '%kt_kurs_notiz_umfang%' and qual like '%kt_durchlauf_tage%')
     or not exists (select 1 from pg_proc where proname = 'kt_fassung_stufe'
                    and prosrc like '%kt_kurs_notiz_umfang%' and prosrc like '%kt_durchlauf_tage%') then
    raise exception 'KT-SR03: Fassungen nicht auf Notiz-Umfang umgestellt';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'kt_deck_fassungen';
  if n <> 4 then raise exception 'KT-SR04: erwartet 4 Regeln auf kt_deck_fassungen, gefunden %', n; end if;
end
$$;

commit;
