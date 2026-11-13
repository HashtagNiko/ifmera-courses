# CHANGELOG

Neueste Einträge oben. Je Eintrag: Datum, Baustein, was sich geändert hat, geänderte Dateien.

## 2026-11-13 · Baustein 4, Teil 1 · Quellpakete

- Migration `20261113200000_kt_quellpakete.sql` (hinzufügend, nach Sicherung eingespielt): `kurstage`
  bekommt `quellen_pfad`, `quellen_hash`, `quellen_groesse`. Regeln unverändert; `<kürzel>/quellen/` ist
  seit Baustein 1 erst ab Stufe „fassung“ lesbar (Test C, C35/C39). Alle drei Testpakete danach grün.
- `scripts/quellpaket.mjs`: je Kurstag ein eigenständiges Zip (Folienquellen, Bilder, Engine, Build-Skript,
  Bauplan nur für diesen Tag, Anleitung `CLAUDE.md` aus `scripts/quellpaket-anleitung.md`, Gestaltungsregeln
  `KURSREGELN.md` = Abschnitte 3–6 der CLAUDE.md im WEG-Kursordner, Feld `regeln`). Verweise außerhalb des
  Segments (101 bei den Kompaktfassungen) werden ins Paket geholt. Prüfsumme über den Inhalt, feste
  Zeitstempel im Zip: ein zweiter Sync lädt nichts erneut.
- Deck-Sync baut und lädt Pakete nur bei Änderung. Erster Lauf: 44 Pakete, zusammen rund 58 MB.
- Kachel: Knopf „Quellen“ nur für den Besitzer und für Trainer mit Stufe „fassung“.
- Prüfung: Jedes der 44 Pakete in einen leeren Ordner entpackt und mit Python gebaut: 26 ergeben byte-genau
  das Deck im Tool; 18 weichen ab, weil das Deck im Kursordner älter ist als Quellen bzw. Engine (z. B.
  H&G: Engine mit behobenem `#tmr`-Fehler, Decks noch nicht neu gebaut; WEG Tag 6: Text nach dem Bauen
  geändert). Werkzeug dafür: `npm run pruefen:quellpakete`. `npm run pruefen:downloads` prüft jetzt auch
  die Pakete (153 Dateien, alle in Ordnung).
- Kleinigkeit aus der Prüfung von Baustein 3 behoben: Eigene Notizen kommen nur noch ins Cockpit, solange
  man sie auch schreiben darf.

## 2026-11-13 · Baustein 3 · Eigene Notizen

- Migration `20261113190000_kt_folien_notizen.sql` (hinzufügend, nach Sicherung eingespielt):
  `kt_folien_notizen` (je Trainer, Kurstag und Folie: Notiz, Aktion, Titel-Schnappschuss). Lesen und
  Löschen nur die eigenen; Anlegen und Ändern nur mit Stufe „notizen“ oder mehr. Rechte-Test
  `20261113190000_kt_folien_notizen_test.sql` (N01–N40), 3 Gegenproben; danach alle drei Testpakete live grün.
- Folienschlüssel ohne Änderung der Kursordner: `data-id`, sonst Titel + laufende Nummer (Annahme, SPEC
  Baustein 3, OFFENE-FRAGEN Nr. 19).
- Seite „Eigene Notizen“ (`/notizen/:tagId`, Link „✎ Notizen“ in der Kachel): Original links, eigene
  Fassung rechts, Speichern beim Verlassen eines Feldes, Vorschau der Formatierung, „Notizen ohne Folie“.
- Cockpit: Skript in der Kopie des Decks umhüllt `syncCockpit()` und zeigt die eigene Notiz formatiert,
  mit Schalter „Original-Notizen zeigen“. Gilt auch für die heruntergeladene Trainerfassung.
- **Fund:** Die Engine bricht in `syncCockpit()` an der fehlenden Uhr `#tmr` ab (OFFENE-FRAGEN Nr. 18).
  Ohne Gegenmaßnahme wären eigene Notizen im echten Browser nie erschienen; aufgefallen erst beim Test
  mit der echten Engine. Das Skript fängt den Fehler, setzt die Notiz ein und gibt ihn unverändert weiter.
- Tests: `folien.test.ts` (Cockpit mit nachgestellter Engine u. a.), `folien.engine.test.ts` (echte
  Engine aus einem WEG- und einem H&G-Deck in jsdom, auch mit ausgeblendeten Kann-Folien; übersprungen
  ohne `KURS_WURZEL`). Zusammen 29 Unit-Tests grün; Gegenprobe: ohne Weitergabe des Engine-Fehlers wird
  der Engine-Test rot.
- Zweiter Blick (Sub-Agent) vor dem Einspielen, umgesetzt: Build brach an der Node-Testdatei
  (`tsconfig.app.json` schließt Tests jetzt aus); Speichern je Folie nacheinander statt parallel (sonst
  konnte eine ältere Speicherung eine neuere überholen); „Original als Vorlage übernehmen“ fragt nach,
  wenn es schon eine eigene Notiz gibt; Speichern beim Verlassen der Seite und Warnung beim Schließen des
  Tabs; Schalter im Cockpit behält seinen Zustand beim Neuöffnen; Folien ohne Titel werden am Text
  erkannt, doppelte `data-id` nummeriert; Notizen werden nach dem Namenstausch eingesetzt und parallel
  zum Deck geladen; happy-dom (Sicherheitswarnung) durch jsdom ersetzt; Tests schärfer. Offen (Kleinigkeit):
  Wird die Stufe eines Trainers auf „Ansehen“ gesenkt, zeigt sein Cockpit seine alten Notizen weiter.

## 2026-11-13 · Baustein 2 · Name in der Fußzeile, Markierung, Prüfwerkzeuge

- Auf Nikos „ja“: Öffnet oder lädt ein Trainer ein fremdes Deck, steht in der Fußzeile seiner Kopie sein
  Anzeigename statt des Besitzers (nur die vollständige Fußzeile wird ersetzt, der Name wird maskiert).
  Jede heruntergeladene HTML-Datei bekommt eine unsichtbare Markierung (Kommentar + `meta`) mit Name,
  Datum und Uhrzeit. PDFs bleiben unverändert.
- Neu: Vitest (`npm test`), 12 Tests für Fußzeile, Markierung und Dateinamen; 4 Gegenproben (Name
  ungeprüft eingesetzt, Name überall ersetzt, Kommentar nicht entschärft, meta ohne Maskierung) lassen
  die Tests jeweils scheitern.
- Neu: `npm run pruefen:downloads` holt jede angebotene Datei unter Nikos Sync-Anmeldung so, wie es die
  App tut, und vergleicht die Prüfsumme. Erster Lauf: 109 Dateien (44 Trainer, 32 Teilnehmer, 33 PDF),
  alle in Ordnung.
- Dateien: `src/lib/deckAnpassung.ts`, `src/lib/deckAnpassung.test.ts`, `src/lib/kurse.ts`,
  `src/lib/deckOeffnen.ts`, `src/pages/DashboardPage.tsx`, `scripts/downloads-pruefen.mjs`,
  `package.json`, `package-lock.json`, `OFFENE-FRAGEN.md`

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
- Erster Sync mit Downloads (13.11.2026, nach Nikos neuer Anmeldung des Syncs): WEG 16/16 Tage,
  WEG kompakt 8/8 (ein Tag nur mit PDF: die ausgegebene Teilnehmer-HTML weicht von der gebauten ab),
  H&G kompakt 5/5 (Lieferordner des H&G-Kurses), H&G 4/15 (Segment 1 und 3). 65 Dateien hochgeladen,
  Bucket jetzt rund 276 MB. Test C danach grün.
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
