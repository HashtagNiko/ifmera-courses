-- Welche Migrationen des Kurs-Tools sind eingespielt? (fuer scripts/rechte-pruefen.mjs)
select version from public.kt_migrationen order by version;
