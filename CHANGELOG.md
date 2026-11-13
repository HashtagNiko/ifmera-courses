# CHANGELOG

Neueste Einträge oben. Je Eintrag: Datum, Baustein, was sich geändert hat, geänderte Dateien.

## 2026-11-13 · Baustein 2 · Herunterladen

- Migration `20261113180000_kt_downloads.sql` (hinzufügend, eingespielt nach Sicherung): `kurstage`
  bekommt `liefername`, `teilnehmer_pfad/_hash/_groesse`, `pdf_pfad/_hash/_groesse`. Regeln unverändert;
  Test C prüft zusätzlich, dass ein Trainer mit Freigabe Teilnehmerfassung und PDF seines Kurses sieht
  (C35b) und keine fremden (C36). Probeläufe mit Test und Rückbau grün, danach alle Tests live grün.
- Deck-Sync lädt Teilnehmerfassung und PDF hoch, aber nur, was im Lieferordner „2. Slides“ liegt
  (gleiche Prüfsumme; Ordner mit „_“ vorn zählen nicht), und übernimmt von dort den Liefernamen.
  Neues Feld `lieferung` in `kurse.config.json` (weg, hg, weg-kompakt; hg-kompakt hat keinen).
- Kacheln: unten „Herunterladen: Trainer · Teilnehmer · PDF“, je nur, wenn es die Datei gibt.
- „Abmelden“ meldet nur noch dieses Browserfenster ab (`scope: 'local'`); bisher wurde dabei auch die
  Sitzung des Deck-Syncs beendet.
- Sync: kein `process.exit()` mehr nach Netzwerkanfragen (Absturz unter Windows), klare Meldung, wenn
  die gespeicherte Sitzung fehlt.
- Dateien: `supabase/migrations/20261113180000_kt_downloads.sql`, `supabase/rueckbau/…`,
  `supabase/tests/20261113160000_kt_regeln_nach_besitz_test.sql`, `scripts/sync-decks.mjs`,
  `kurse.config.json`, `src/lib/kurse.ts`, `src/lib/AuthContext.tsx`, `src/pages/DashboardPage.tsx`,
  `README.md`, `SPEC.md`, `OFFENE-FRAGEN.md`

## 2026-11-13 · Baustein 1 · Test-Konto

- Test-Konto (Nikos Gmail-Adresse mit Zusatz) auf Nikos „ja“: Eintrag in `eingeladene_trainer`
  (Claude), Konto im Dashboard (Niko), Freischaltung in `kt_trainer` als „Test-Trainer“, Rolle
  `trainer` (Claude, nach Sicherung). Das Prüfungstool hat dafür automatisch ein leeres Profil angelegt.
  Rechte-Tests A und C danach erneut grün.
- Kurstage und Tagebuch zeigen ohne eigenen oder freigegebenen Kurs jetzt „Dir ist noch kein Kurs
  freigegeben“ statt des Hinweises auf den Deck-Sync bzw. den Tagebuch-Import.
- Dateien: `src/components/KeinKurs.tsx`, `src/pages/DashboardPage.tsx`, `src/pages/TagebuchPage.tsx`,
  `OFFENE-FRAGEN.md`

## 2026-11-13 · Baustein 1 · Besitz und Rechte (Schritte A, B, C)

**Abgeschlossen:** Laien-Test von Niko bestanden („passt“, 13.11.2026).

- **Schritt A (hinzufügend, eingespielt 13.11.2026, Test live grün):** `20261113150000_kt_besitz_und_freigaben.sql` legt
  `kt_migrationen`, `kt_trainer` (Niko als Admin, übernommen aus `kurs_zugriff`), `kurse.besitzer_id`,
  `durchlaeufe.besitzer_id` und `kt_kurs_freigaben` an, dazu sechs Hilfsfunktionen. Bestehende Regeln
  unverändert, niemand bekommt neue Rechte. Rückbau in `supabase/rueckbau/`.
- **Schritt B (App):** Zugang über `kt_trainer` statt `kurs_zugriff` (`ProtectedRoute`, neues
  `TrainerContext`), Kopfzeile zeigt den Anzeigenamen, neue Seite „Freigaben“ (Kurs an Trainer
  freigeben, Stufe ändern, entfernen; jeder Schreibschritt prüft per `.select()`, ob er wirklich ankam),
  freigegebene Kurse tragen den Hinweis „Freigegeben von …“.
- **Schritt C (Regeln nach Besitz), eingespielt 13.11.2026 nach Nikos „ja“:**
  `20261113160000_kt_regeln_nach_besitz.sql`. Alte Regeln, `kurs_zugriff` und `hat_kurszugriff()` entfernt;
  Lesen nach Besitz und Freigabe, Schreiben und Löschen nur der Besitzer, Bucket nach Kurs-Kürzel,
  verwaiste Bucket-Dateien für den Admin; `anon` ohne Tabellenrechte.
- **Korrektur, eingespielt 13.11.2026:** `20261113170000_kt_kurse_lesen_neuer_kurs.sql`. Nach Schritt C
  konnte ein *neuer* Kurs nicht angelegt und in derselben Anweisung zurückgelesen werden (so macht es der
  Deck-Sync): Die Leseregel fragte `kt_kurs_stufe(id)`, und die Funktion sieht die gerade eingefügte
  Zeile noch nicht. Gefunden durch erneuten Lauf von Test A (T14); jetzt erkennt die Regel den Besitzer
  zusätzlich direkt an der Zeile. Test C prüft das jetzt selbst (C09). Bestehende Kurse waren nie betroffen.
- Panne: Vor der Korrektur scheiterte die Sicherung (`kurs_zugriff` war schon entfernt), die Korrektur lief
  trotzdem, weil beide Befehle parallel abgeschickt wurden. Folgen: keine (nur eine Leseregel, Rückbau
  vorhanden, Sicherung von vor Schritt C vollständig). Seitdem Regel in `CLAUDE.md` §4 Nr. 4: Sicherung
  und Migration mit `&&` verketten; nach jeder Migration alle Rechte-Tests.
- Test A kennt jetzt beide Stände (T35: vor Schritt C sieht Co nichts, danach genau seinen Kurs).
- Nach allem live geprüft: Test A und Test C grün, 3 Einträge in `kt_migrationen`, keine Testreste;
  `npm run sync:decks -- --dry` unter Nikos Anmeldung sieht alle 4 Kurse und 44 Decks unverändert.
- Feste Erlaubnis für `node scripts/sql.mjs` in `.claude/settings.local.json` (lokal, nicht im Repo),
  auf Nikos „ja“.
- Selbstprüfung: Probelauf A + Test A und Probelauf A + C + Test C jeweils in einer zurückgerollten
  Transaktion auf der Live-Datenbank bestanden; danach nachweislich nichts übrig (keine `kt_`-Tabellen,
  keine Testadressen in `eingeladene_trainer`). Gegenproben: 5 für A, 9 für C, jede eingebaute
  Schwachstelle lässt den Test scheitern. Direktes Löschen in `storage.objects` sperrt Supabase per
  `storage.protect_delete`; der Test öffnet das nur für seine Transaktion.
- Nebenwirkungen von Schritt A (gewollt): Nikos Konto lässt sich nicht löschen, solange ihm Kurse oder
  Durchläufe gehören; ein Insert in `kurse`/`durchlaeufe` ohne Anmeldung (SQL-Editor) braucht eine
  ausdrückliche `besitzer_id`; jede Migration bricht nach 3 s Sperr-Wartezeit ab (`lock_timeout`), statt
  Anmeldungen im Prüfungstool aufzuhalten.
- Zweiter Blick (Sub-Agent) vor dem Einspielen: keine Blocker; umgesetzt wurden `lock_timeout`,
  `kt_kurs_id` nur für aktive Trainer (anonyme Prüfungsteilnehmer sind ebenfalls `authenticated`),
  schärfere Tests (T11–T15, T32b/c, T36–T38, T55) und strengere Selbstprüfungen.
- Sicherung vor Schritt A: `backup/2026-11-13_vor_baustein1_schritt_a_2.json` (lokal).
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
