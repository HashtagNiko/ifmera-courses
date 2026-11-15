-- Rueckbau zu supabase/migrations/20261115110000_kt_stichpunkte_regeln.sql
-- Stellt die Leseregel der Decks (20261113160000) sowie Stufe und Leseregel der Fassungen
-- (20261113220000) wieder her. ACHTUNG: Danach sehen Mitnutzer mit "nur Stichpunkte" wieder die
-- ausfuehrlichen Notizen (trainer/, quellen/, fremde Fassungen). Vorher deren Freigaben entfernen
-- oder bewusst entscheiden.

begin;

set local lock_timeout = '3s';

-- Nicht zuruecknehmen, solange Mitnutzer auf "nur Stichpunkte" stehen: Sie saehen danach die
-- ausfuehrlichen Notizen, waehrend die App weiter "Notizen als Stichpunkte" zeigt.
do $$
begin
  if exists (select 1 from public.kt_kurs_freigaben where notiz_umfang = 'stichpunkte') then
    raise exception 'KT-RSR00: Es gibt Freigaben mit "nur Stichpunkte". Erst auf "vollstaendig" stellen oder entfernen.';
  end if;
end
$$;

drop policy if exists "kt decks lesen" on storage.objects;
create policy "kt decks lesen" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'decks'
    and public.kt_kurs_stufe_mindestens(
      public.kt_kurs_id((storage.foldername(name))[1]),
      case when (storage.foldername(name))[2] = 'quellen' then 'fassung' else 'nutzen' end
    )
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

drop policy if exists "fassungen lesen" on public.kt_deck_fassungen;
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

delete from public.kt_migrationen where version = '20261115110000';

do $$
begin
  if exists (select 1 from pg_policies where policyname in ('kt decks lesen', 'fassungen lesen') and qual like '%kt_kurs_notiz_umfang%')
     or exists (select 1 from pg_proc where proname = 'kt_fassung_stufe' and prosrc like '%kt_kurs_notiz_umfang%') then
    raise exception 'KT-RSR01: Regeln nicht zurueckgesetzt';
  end if;
end
$$;

commit;
