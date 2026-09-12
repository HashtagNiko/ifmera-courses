-- Loeschen fehlte bisher vollstaendig.
--
-- Aufgefallen am 12.09.2026: zwei Testdateien im Bucket liessen sich nicht
-- entfernen. Die Storage-API meldet dabei keinen Fehler, sie liefert einfach
-- eine leere Liste zurueck; ein Loeschversuch sah deshalb wie ein Erfolg aus.
--
-- Gebraucht wird das, sobald ein Kurs versehentlich angelegt wurde oder ein
-- Deck aus dem Bucket verschwinden soll. Erlaubt bleibt es nur Konten in
-- kurs_zugriff, wie alles andere auch.

create policy "decks loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'decks' and public.hat_kurszugriff());

create policy "kurse loeschen" on public.kurse
  for delete to authenticated using (public.hat_kurszugriff());

create policy "kurstage loeschen" on public.kurstage
  for delete to authenticated using (public.hat_kurszugriff());

create policy "fortschritt loeschen" on public.fortschritt
  for delete to authenticated using (public.hat_kurszugriff());
