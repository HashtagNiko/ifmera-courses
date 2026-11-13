# CHANGELOG

Neueste Einträge oben. Je Eintrag: Datum, Baustein, was sich geändert hat, geänderte Dateien.

## 2026-11-13 · Baustein 1 · Besitz und Rechte (Schritte A und B)

- **Schritt A (hinzufügend, eingespielt):** `20261113150000_kt_besitz_und_freigaben.sql` legt
  `kt_migrationen`, `kt_trainer` (Niko als Admin, übernommen aus `kurs_zugriff`), `kurse.besitzer_id`,
  `durchlaeufe.besitzer_id` und `kt_kurs_freigaben` an, dazu sechs Hilfsfunktionen. Bestehende Regeln
  unverändert, niemand bekommt neue Rechte. Rückbau in `supabase/rueckbau/`.
- **Schritt B (App):** Zugang über `kt_trainer` statt `kurs_zugriff` (`ProtectedRoute`, neues
  `TrainerContext`), Kopfzeile zeigt den Anzeigenamen, neue Seite „Freigaben“ (Kurs an Trainer
  freigeben, Stufe ändern, entfernen; jeder Schreibschritt prüft per `.select()`, ob er wirklich ankam),
  freigegebene Kurse tragen den Hinweis „Freigegeben von …“.
- **Schritt C (Regeln nach Besitz) vorbereitet, nicht eingespielt:** `20261113160000_kt_regeln_nach_besitz.sql`
  samt Rückbau und Test. Wartet auf Nikos „ja“ (gelb).
- Selbstprüfung: Probelauf A + Test A und Probelauf A + C + Test C jeweils in einer zurückgerollten
  Transaktion auf der Live-Datenbank bestanden; danach nachweislich nichts übrig (keine `kt_`-Tabellen,
  keine Testadressen in `eingeladene_trainer`). Gegenproben: 5 für A, 9 für C, jede eingebaute
  Schwachstelle lässt den Test scheitern. Direktes Löschen in `storage.objects` sperrt Supabase per
  `storage.protect_delete`; der Test öffnet das nur für seine Transaktion.
- Sicherung vor Schritt A: `backup/2026-11-13_vor_baustein1_schritt_a.json` (lokal).
- Neu: `supabase/sicherung.sql` (Sicherungsabfrage).
- Dateien: `supabase/migrations/20261113150000_*`, `supabase/migrations/20261113160000_*`,
  `supabase/rueckbau/*`, `supabase/tests/*`, `supabase/sicherung.sql`, `src/lib/trainer.ts`,
  `src/lib/TrainerContext.tsx`, `src/components/ProtectedRoute.tsx`, `src/components/Kopfzeile.tsx`,
  `src/pages/FreigabenPage.tsx`, `src/pages/DashboardPage.tsx`, `src/lib/kurse.ts`, `src/App.tsx`

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
