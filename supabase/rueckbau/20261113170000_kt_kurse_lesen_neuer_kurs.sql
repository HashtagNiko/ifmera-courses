-- Rueckbau zu supabase/migrations/20261113170000_kt_kurse_lesen_neuer_kurs.sql
-- Stellt die Leseregel aus 20261113160000 wieder her (mit dem Fehler beim Anlegen neuer Kurse).

begin;

set local lock_timeout = '3s';

drop policy "kt kurse lesen" on public.kurse;

create policy "kt kurse lesen" on public.kurse
  for select to authenticated
  using (public.kt_kurs_stufe(id) is not null);

delete from public.kt_migrationen where version = '20261113170000';

commit;
