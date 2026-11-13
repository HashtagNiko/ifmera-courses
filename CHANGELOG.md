# CHANGELOG

Neueste Einträge oben. Je Eintrag: Datum, Baustein, was sich geändert hat, geänderte Dateien.

## 2026-11-13 · Baustein 0 · Datenbankzugang und Bestandsaufnahme

- `scripts/sql.mjs`: führt SQL über die Supabase Management API aus; Schlüssel aus
  `SUPABASE_TOKEN_KURSTOOL` (notfalls direkt aus den Windows-Benutzervariablen), Zielprojekt nur aus
  der `.env`, `--lesend` erzwingt eine Nur-Lese-Transaktion (Gegenprobe: `create temp table` scheitert).
  Kein `process.exit()` nach `fetch`, weil Node unter Windows sonst abstürzt.
- Bestandsaufnahme (nur lesend): Projekt heißt „ifm-pruefungstool“, nicht „shnoozy-App“ (README,
  `.env.example`, `src/lib/supabase.ts` korrigiert). Migration `20260912100000_loeschrechte.sql` ist nicht
  eingespielt. `anon` hat formal volle Tabellenrechte. Bucket `decks`: 46 Dateien, 99,7 MB, davon zwei
  Testdateien unter `test/`. Kurs-Tool-Migrationen stehen nicht in `supabase_migrations`.
- Nikos Entscheidungen: nur Live-Datenbank; Kopien in beide Richtungen (`SPEC.md` Baustein 4).
- Dateien: `scripts/sql.mjs`, `CLAUDE.md`, `SPEC.md`, `OFFENE-FRAGEN.md`, `CHANGELOG.md`, `README.md`,
  `.env.example`, `src/lib/supabase.ts`

## 2026-11-13 · Baustein 0 · Projektdateien

- Arbeitsregeln für Claude angelegt: Ampel (was Claude allein darf), Berichtsform für Niko,
  Sicherheitsnetz statt Prüfer, Regeln für das öffentliche Repo, Zugänge.
- Fachlicher Umfang für „mehrere Trainer“ in fünf Bausteinen beschrieben.
- Offene Punkte nummeriert angelegt (Nr. 1–10).
- `backup/` und `tmp/` vom Hochladen ausgeschlossen.
- Dateien: `CLAUDE.md`, `SPEC.md`, `OFFENE-FRAGEN.md`, `CHANGELOG.md`, `.gitignore`
