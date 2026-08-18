-- Mehrere Kurse: der Sync legt Kurse jetzt selbst an, sobald in einem
-- Kursordner gebaute Decks liegen. Bisher durfte er nur lesen.
-- Erlaubt ist das wie ueberall nur fuer Konten in kurs_zugriff.
create policy "kurse anlegen" on public.kurse
  for insert to authenticated with check (public.hat_kurszugriff());

create policy "kurse aendern" on public.kurse
  for update to authenticated
  using (public.hat_kurszugriff()) with check (public.hat_kurszugriff());
