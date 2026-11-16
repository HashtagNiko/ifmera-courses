# CHANGELOG

Neueste Einträge oben. Je Eintrag: Datum, Baustein, was sich geändert hat, geänderte Dateien.

## 2026-11-16 · Aufräumen · Offene Punkte entschieden, Testdateien gelöscht

- Entscheidungen Niko (16.11.2026), alle wie empfohlen: OFFENE-FRAGEN Nr. 14 (Testdateien löschen: ja),
  Nr. 26 (Speicher beobachten), Nr. 27 (keine Dateisicherung eigener Kurse), Nr. 28 (Löschsperre durch
  Fassungen bleibt), Nr. 29 (Objektliste in CLAUDE.md ergänzen: ja). Nr. 10 erledigt (Ordner nicht mehr
  im Repo-Ordner).
- Gelber Schritt Nr. 14: die zwei verwaisten Testdateien `test/mit-charset.html` und
  `test/ohne-charset.html` (je 54 Byte, August 2026) als Admin über die Storage-API gelöscht. Einmal-Skript
  in `tmp/` mit Probelauf; vorher Dateien und ihre Speicher-Angaben in `backup/2026-11-16_testdateien/`
  gesichert und geprüft. Zweiter Blick (Sub-Agent): keine Blocker; übernommen: Speicher-Angaben
  mitsichern, Nachprüfung per SQL unabhängig vom Skript (0 Dateien unter `test/`). Rückgängig: Niko lädt
  die Dateien aus der Sicherung im Supabase-Dashboard wieder hoch. Skript danach gelöscht. Rechte-Tests 9/9.
- `CLAUDE.md` §6 (Nikos „ja“): Objektliste ergänzt um alle `kt_*`-Trigger und die Buckets `fassungen` und
  `kt-vorlagen` samt Policies.
- Dateien: `CLAUDE.md`, `OFFENE-FRAGEN.md`, `CHANGELOG.md`

## 2026-11-16 · Baustein 10 · Eigene Kurse im Tool, Startpaket für Claude

- Entscheidungen Niko (16.11.2026): Baustein bauen; eigene Kurse darf jeder aktive Trainer anlegen;
  Startpaket mit neutralem, erfundenem Beispiel. Einspielen der Migration als gelber Schritt (sie schränkt
  bestehende Schreibwege ein, auch den Deck-Sync in Randfällen): Niko „Ja“.
- Migration `20261116100000_kt_eigene_kurse.sql` (keine bestehende Regel geändert): `kurse.angelegt_im_tool`
  (unveränderlich), CHECK `kurse_kuerzel_format`, Trigger `kt_kurse_pruefen` (Nicht-Trainer und
  Nicht-Besitzer zuerst 42501; Kürzel von Nicht-Admins mit Zufallsendung; Kürzel unveränderlich; Name
  2–80 Zeichen ohne unsichtbare Zeichen), `kt_kurse_kuerzel_frei` (AFTER INSERT: kein Kürzel mit
  verbliebenen Dateien), `kt_kurse_loeschen_pruefen` (kein Löschen, solange Dateien darunter liegen),
  `kt_kurstage_pfade_pruefen` (Pfade nur im eigenen Kursordner und im Unterordner der Spalte), Bucket
  `kt-vorlagen` (privat, nur Zip, 40 MB; lesen aktive Trainer, schreiben Admin). Rückbau mit
  `storage.allow_delete_query`, verweigert bei Kursen anderer Trainer. Test
  `20261116100000_kt_eigene_kurse_test.sql` (E00–E66).
- Zweiter Blick (Sub-Agent) vor dem Einspielen. Erster Durchgang, zwei Blocker:
  - Zwei alte Rechte-Tests (C28, C54) wären an der neuen Namensprüfung gescheitert, weil die Trigger vor
    den Regeln laufen.
  - Der Rückbau scheiterte an Supabases Löschsperre.

  Beide behoben. Außerdem umgesetzt: Wettlauf beim Anlegen (Prüfung jetzt AFTER INSERT), keine neuen
  verwaisten Dateien, keine Auskunft an Nicht-Trainer, Kürzel-Besetzung, Selbstprüfung nur lesend,
  Escapes als Text, Bucketname mit `kt-`.

  Probelauf (zurückgerollt): Migration mit jedem der 9 Rechte-Tests grün, Rückbau grün. Sechs Gegenproben
  schlagen an: Trigger kurse weg, Leseregel kt-vorlagen ohne Trainerprüfung, Trigger kurstage weg,
  Pfadprüfung ohne Backslash, Kürzel-frei-Trigger weg, Löschsperre weg.
- App: Reiter „Eigene Kurse“ (`EigeneKursePage.tsx`: Startpaket, Kurs anlegen, eigene Kurse) und
  „Kurs bearbeiten“ (`KursBearbeitenPage.tsx`: Name, Kurstage, Dateien hochladen, Ändern, Löschen, Kurs
  löschen); Logik in `src/lib/eigeneKurse.ts` (Teilnehmerfassung beim Hochladen wie Baustein 9, nichts
  wird hochgeladen, wenn darin Trainertexte übrig bleiben). Kurstage: „Kurs bearbeiten“ bei eigenen
  Kursen; Decks von Kursen anderer Trainer (außer Admin) öffnen sich nicht mehr im Tool, nur Download
  (OFFENE-FRAGEN Nr. 21, 25). Hilfe, Anleitung, Einrichtungs-Datei ergänzt.
- Startpaket (`scripts/startpaket.mjs`, Texte in `scripts/startpaket/`): Anleitung für den ganzen Kurs
  und für einen Kurstag, Kursplan-Vorlage, H&G-Engine, Build, `teilnehmer.py`, `pdf.py`,
  `pdf_fassung.py`, Gestaltungsregeln, Logo, Bildmarke, vier erfundene Beispielfolien. Der Deck-Sync lädt
  es hoch, wenn es sich ändert. Test `scripts/startpaket.test.mjs`: Inhalt, reproduzierbares Zip, echter
  Bau mit Python (4 Folien, Teilnehmerfassung sauber). Von Hand zusätzlich PDF erzeugt (4 Seiten) und
  angesehen.
- Zweiter Durchgang des zweiten Blicks: alles behoben, keine neuen Blocker. Umgesetzt: Test E52b mit echtem
  Kurs. Merkposten aus dem Hinweis: Würde im Speicher die Versionierung eingeschaltet, zählten alte
  Versionen als Dateien, und Kurse ließen sich nicht mehr löschen (heute aus).
- Eingespielt nach Sicherung (`backup/2026-11-16_vor_kt_eigene_kurse.json`, geprüft, in einer Kette mit
  der Migration). Danach Rechte-Tests 9/9, Zustand lesend geprüft: 4 Trigger aktiv, Bucket privat,
  14 Speicher-Regeln, `anon` ohne Rechte.
- Deck-Sync für alle vier Kurse fehlerfrei; der Upsert der Kurse läuft mit den neuen Triggern. Das
  Startpaket ist hochgeladen.
- Fehler beim ersten Lauf: Ordner-Einträge im Zip trugen die aktuelle Uhrzeit, also galt das Startpaket bei
  jedem Lauf als geändert. Behoben (Ordner mit festem Datum); der Test prüft jetzt das Datum jedes Eintrags.
  Zweiter Probelauf: „unverändert“.
- Nach dem Hochladen: Rechte-Tests 9/9, Downloads 184/184. Speicher 375,1 MB.
- Unit-Tests 117 grün (neu: `eigeneKurse.test.ts`, `startpaket.test.mjs`, Hilfe-Beschriftungen).
- OFFENE-FRAGEN Nr. 25–29 neu.
- Nikos Laien-Test mit Test-Konto und eigenem Konto: Startpaket laden, Kurs und Kurstag anlegen, Dateien
  hochladen, Deck öffnen, freigeben, als Niko nur Download, Kurs löschen. Ergebnis: **passt**
  (16.11.2026), Baustein 10 damit abgeschlossen. Lesend geprüft: Der Testkurs ist samt Kurstag und Dateien
  weg, im Bucket liegen keine neuen verwaisten Dateien (nur die zwei bekannten unter `test/`, OFFENE-FRAGEN
  Nr. 14). Testdateien in `tmp/` gelöscht.

## 2026-11-16 · Baustein 7 (Nachtrag) · Brücken bleiben vollständig; H&G-Quellpakete neu

- Entscheidung Niko (15.11.2026): Die „Brücken“ (`data-bruecke`, `data-bruecke-kann`, Überleitung zur
  nächsten Folie; 51 Folien im H&G-Kurs) bleiben in der Stichpunkt-Fassung vollständig, wie die Aktionen.
- `scripts/stichpunkte.mjs`: Brücken zählen in der Leck-Prüfung ausdrücklich als sichtbar (vorher nur, weil
  sie am Folien-Element stehen). Neuer Test in `scripts/stichpunkte.test.mjs`: Brücken bleiben Byte für Byte,
  ein Notizsatz, der auch in der Brücke steht, ist kein Leck, der Rest der Notiz schon. Gegenprobe (Brücken
  als geheim behandelt) schlägt an.
- Hilfe („?“ auf der Kursseite), Anleitung (Häufige Fragen) und `SPEC.md`: Hinweis, dass Aktionen und
  Brücken vollständig bleiben.
- H&G voll: 15 Quellpakete und 15 Stichpunkt-Quellpakete mit dem Stand von Baustein 9 neu geladen
  (Leck-Prüfung vor jedem Hochladen ohne Fund). Rechte-Tests 8/8, Downloads 184/184, Quellpakete 44/44
  identisch mit den Decks.

## 2026-11-15 · Baustein 9 · Teilnehmerfassung und PDF zu Fassungen, Ablage

- `src/lib/teilnehmer.ts`: Teilnehmerfassung im Browser, übertragen aus Nikos `engine/teilnehmer.py`
  (Navigationsbaustein wörtlich übernommen, Zeilenenden wie die Vorlage). Test
  `teilnehmer.engine.test.ts`: alle 44 fertigen Teilnehmerfassungen beider Kurse byte-gleich; Gegenprobe
  (ohne „Brücken“-Texte) schlägt an.
- Fassungen: neuer Knopf „Teilnehmer herunterladen“; in Deck, Teilnehmerfassung und beim Öffnen steht der
  Name dessen, der sie lädt. `fussNameErsetzen` ersetzt jetzt auch bei gleichem Besitzer und Betrachter,
  wenn im Deck ein anderer Name steht (eigene Fassung aus fremden Quellen).
- Quellpaket: zusätzlich Nikos `engine/teilnehmer.py` und `engine/pdf.py` sowie `engine/pdf_fassung.py`
  (`scripts/paket/`). Probe: Paket H&G Tag 8 entpackt, gebaut, `pdf_fassung.py`: Teilnehmerfassung
  byte-gleich mit Nikos, PDF 30 Seiten mit identischem Text. Paket-Anleitung: Abschnitte „Teilnehmerfassung
  und PDF“ und „Ablage und Ablauf beim Trainer“ (auch als Arbeitsanweisung für Claude). Einrichtungs-Datei
  und Anleitung im Tool: Ablage und PDF-Einrichtung.
- Neue Quellpakete geladen: WEG 16, WEG kompakt 8, H&G kompakt 5 (H&G voll folgt nach Entscheidung zu den
  „Brücken“-Texten). Rechte-Tests 8/8, Downloads 184/184. 97 Tests grün.
- Gelber Schritt (Niko: „Ja“): Adresse des Co-Trainers in die Einladungsliste des Prüfungstools eingetragen
  (nach zweitem Blick: Abgleich ohne Groß-/Kleinschreibung, keine Nebenwirkungen). Niko hat das Konto im
  Dashboard angelegt (das Prüfungstool legte wie erwartet ein leeres Trainer-Konto an). Danach, nach
  Sicherung und zweitem Blick, im Kurs-Tool als Co-Trainer freigeschaltet (Rolle trainer, aktiv, ohne
  Freigabe; die setzt Niko selbst). Rechte-Tests 8/8.
- Korrektur: In `src/lib/profil.test.ts` stand als Beispiel der Nachname des Co-Trainers (veröffentlicht mit
  Baustein 8); ersetzt durch „Herr Muster“. In der Git-Geschichte bleibt er stehen.

## 2026-11-15 · Baustein 8 · Profil (Name und Passwort)

- Migration `20261115120000_kt_profil.sql` (hinzufügend, nach Sicherung eingespielt): Funktion
  `kt_anzeigename_setzen` ändert nur den eigenen Anzeigenamen aktiver Trainer; `kt_trainer` bleibt sonst nur
  lesbar. Prüfung: 2–60 Zeichen, mindestens ein Buchstabe, keine Steuer-, unsichtbaren oder
  richtungsdrehenden Zeichen, keine spitzen Klammern, kein Name eines anderen Trainers (auch nicht in
  anderer Groß-/Kleinschreibung). Zweiter Blick vorher: kein Blocker; umgesetzt: unsichtbare Zeichen,
  doppelte Namen (sonst könnte sich jemand in der Freigaben-Auswahl als anderer Trainer ausgeben),
  `[[:space:]]`, „nicht gespeichert“ statt stillem Erfolg, Selbstprüfung auch auf Spaltenrechte und
  Regelzahl. Test `20261115120000_kt_profil_test.sql` (P00–P13); Gegenproben (ohne Trainer-Prüfung → P10,
  ohne Doppelnamen-Prüfung → P06f). Rückbau im Probelauf: Stand identisch. Rechte-Tests danach 8/8.
- App: Seite „Profil“ (`/profil`, Link oben rechts): Name ändern (wirkt sofort, ohne Neuladen) und
  Passwort ändern (bisheriges Passwort wird erst geprüft, neues mindestens 10 Zeichen, zweimal). Hinweis,
  dass das Passwort auch für das Prüfungstool gilt. Hilfe und Anleitung um die Seite ergänzt.
- Namenstausch in fremden Decks liest den Namen jetzt aus der Fußzeile des Decks (`deckAnpassung.ts`),
  damit er greift, auch wenn der Besitzer seinen Anzeigenamen ändert. Neue Tests: `profil.test.ts` (4,
  Gegenprobe: ohne Prüfung des bisherigen Passworts schlägt an), Fußzeile (1). 94 Tests grün.

## 2026-11-15 · Baustein 7 · Notizen nur als Stichpunkte (eingespielt)

- **Teil 2 eingespielt nach Nikos „ja“** (gelb), vorher zweiter Blick auf Teil 2 und den Code. Er fand
  eine echte Lücke im Verfahren (nicht in den Daten): Notizen außerhalb einer Folie (auskommentierte Folie,
  anderes Element) wären weder ersetzt noch von der Leck-Prüfung bemerkt worden. Nachgeprüft: In allen
  15 Decks und ihren Quellen steht jede Notiz in genau einer Folie, die hochgeladenen Dateien waren
  sauber. Umgesetzt: Abbruch, wenn im Text mehr `data-notes` stehen als an Folien; Leck-Prüfung liest
  Kommentare, Vorlagen, Skripte und den Rohtext, sucht auch Notizen aus den Folienquellen, und „sichtbar“
  ist nur, was zur Folie gehört (Text, Attribute wie Quiz-Antworten, Aktionen). Dabei fiel bei Tag 8 eine
  Quiz-Antwort auf, die einen Notizsatz wiederholt; der Sync lud dort vorsorglich nichts, bis die Regel
  „Attribute der Folie sind sichtbar“ ergänzt war. Rückbau von Teil 2 verweigert sich, solange eine
  Freigabe auf „nur Stichpunkte“ steht. Test um Plan, Aufbauen auf fremder Fassung und deren Quellpaket
  ergänzt. App wählt im Zweifel die kurze Fassung und zeigt fremde Kurse erst, wenn die eigene Freigabe
  geladen ist. Danach: Sicherung `backup/2026-11-15_vor_stichpunkte_teil2.json`, Teil 2 eingespielt,
  Rechte-Tests 7/7, Downloads 184/184, anon ohne Rechte. 87 Tests grün.
- Nikos Laien-Test mit dem Test-Konto (H&G mit „nur Stichpunkte“: Hinweis, Kacheln, Cockpit mit
  Stichpunkten; bei Niko weiter die ausführlichen Notizen): **in Ordnung**. Baustein 7 abgeschlossen.
- Stichpunkte für alle 15 H&G-Tage (423 Folien, 1.862 Stichpunkte, 1–5 je Folie, zusammen etwa halb so
  lang wie die Notizen), geschrieben von sechs Sub-Agenten parallel, danach zentral geprüft (Anzahl,
  Titel, Länge ≤ 120 Zeichen, Form, kein ganzer Satz aus der Notiz). Abgelegt im Kursordner
  `50_H&G-Kurs/stichpunkte/` (15 JSON + LIESMICH.md), je Folie mit Prüfsumme der Original-Notiz.
- `scripts/stichpunkte.mjs`: ersetzt in Deck und Folienquellen nur die `data-notes`-Attribute (über
  Quelltext-Positionen, Rest Byte für Byte gleich), Cockpit-Stil „Zeilen beibehalten“ nur in der kurzen
  Fassung, Hinweis in der Paket-Anleitung, Platzhalter „Stichpunkte folgen.“ bei geänderten Notizen,
  Leck-Prüfung (kein Satz ab 50 Zeichen aus den Notizen, außer er steht ohnehin sichtbar). Tests
  `scripts/stichpunkte.test.mjs` (6) mit Gegenprobe. `quellpaket.mjs`: Zip mit überschriebenen Dateien.
- Sync: baut für Kurse mit Feld `stichpunkte` (`kurse.config.json`, nur `hg`) Stichpunkt-Deck und
  -Quellpaket, prüft auf Lecks, lädt nach `trainer-kurz/` und `quellen-kurz/`. Geladen: 15 + 15 Dateien,
  39 MB. Probe: Jedes Stichpunkt-Quellpaket, mit Nikos `build.py` gebaut, ergibt byte-genau das
  Stichpunkt-Deck. `pruefen:downloads` prüft die kurzen Fassungen mit (184 von 184 in Ordnung).
- Migration `20261115100000_kt_stichpunkte.sql` (hinzufügend, nach Sicherung eingespielt):
  `kt_kurs_freigaben.notiz_umfang` ('voll'|'stichpunkte', Vorgabe 'voll'), Pfade/Prüfsummen der kurzen
  Fassungen an `kurstage`, Funktion `kt_kurs_notiz_umfang`. Zweiter Blick vorher: kein Blocker; umgesetzt:
  Spaltenname eindeutig, Stufe einmal je Aufruf, Selbstprüfung erweitert, Test strenger (inaktiv, S00).
  Test `20261115100000_kt_stichpunkte_test.sql` (S00–S31), Gegenprobe (Funktion immer „voll“) → S20.
- Vorbereitet, **nicht eingespielt** (gelb): `20261115110000_kt_stichpunkte_regeln.sql` ersetzt die
  Leseregel der Deck-Dateien (ausführlich nur mit „voll“, kurze ab gleicher Stufe, unbekannte Ordner
  gesperrt) und, nach Hinweis des zweiten Blicks, Stufe und Leseregel der Fassungen (fremde Fassungen
  nur mit „voll“). Test (R00–R51) im Probelauf grün; Gegenproben: ohne Notiz-Prüfung bei `trainer/` → R20,
  alte Fassungs-Regeln → R21. Rückbau beider Teile im Probelauf: Stand identisch.
- `npm run pruefen:rechte` überspringt Tests von Migrationen, die noch nicht eingespielt sind
  (`supabase/eingespielt.sql`), statt sie als Fehler zu melden.
- App: Freigaben mit „Notizen: vollständig / nur
  Stichpunkte“; Kurstage, Notizen und Fassungen wählen bei „nur Stichpunkte“ die kurzen Dateien
  (`pfadeFuer`), Kachel zeigt „Notizen als Stichpunkte“ bzw. „Stichpunkt-Fassung folgt noch“; Hilfe und
  Anleitung ergänzt. 84 Tests grün.

## 2026-11-15 · Pflege · Alte Durchläufe gelöscht

- Gelb, Niko: „Ja bitte löschen“ (nie wirklich gepflegt). Nach Sicherung
  `backup/2026-11-15_vor_durchlaeufe_loeschen.json` und zweitem Blick per Skript mit Vor- und Nachprüfung
  gelöscht: alle vier Durchläufe („2608 - WEG-Kurs“, „2609 - H&G-Kurs“, „2610 - WEG-Kurs“, „Ohne Namen“)
  samt 66 Haken-Zeilen, darin 5 Tagesnotizen (kopierte Themenlisten, Niko vorher gezeigt).
- Unverändert: 4 Kurse, 57 Kurstage (mit den Tagebuch-Themen), Kursfreigabe für den Test-Trainer.
  Wiederherstellen ginge aus der Sicherung (dabei setzt der Trigger `geaendert_am` auf den Zeitpunkt
  der Wiederherstellung).
- **Korrektur:** Die erste Fassung dieses Eintrags meldete „Rechte-Tests danach 5/5“; tatsächlich waren
  es 4/5. Test C (`20261113160000_…_test.sql`) lieh sich einen echten Durchlauf von Niko aus und brach
  ab, als es keinen mehr gab (Verstoß gegen „Tests nutzen nur eigene Daten“). Umgestellt auf einen
  eigenen Test-Durchlauf mit einem Haken (neu C09b); danach 5/5, Gegenprobe (zu lockere Regel auf
  `fortschritt`) schlägt bei C31 an. Die Datenbank selbst war nicht betroffen.
- Nikos Kontrolle (Tagebuch leer, keine Häkchen auf den Kacheln): passt.

## 2026-11-15 · Baustein 6 · Hilfe und Anleitung

- Neuer Reiter „Anleitung“ (`src/pages/AnleitungPage.tsx`, Route `/anleitung`): Ablauf, alle Seiten kurz
  erklärt, häufige Fragen, Downloads „Einrichtung für Claude“ (`public/claude-einrichtung.md`) und
  „Anleitung im Quellpaket“ (dieselbe Datei wie `CLAUDE.md` in jedem Paket, per `?raw` eingebunden).
- „?“ in der Kopfzeile (`src/components/Hilfe.tsx`): Hilfe zur aktuellen Seite, Ablauf, Verweis auf die
  Anleitung; Escape, Klick daneben oder „✕ schließen“ schließt. Einmaliger Hinweis „Neu hier?“ (im
  Browser gemerkt, ohne Speicher kein Hinweis).
- `public/claude-einrichtung.md`: Anleitung für Claude, die zuerst „Claude-App oder VS Code?“ fragt und
  dann Schritt für Schritt einrichtet (Python, VS Code mit Claude Code bzw. App mit Code-Ausführung),
  mit Probelauf vom Quellpaket bis zum Hochladen. Liegt öffentlich (GitHub Pages), enthält nichts
  Vertrauliches.
- `scripts/quellpaket-anleitung.md`: Abschnitt „Im Chat (Claude-App oder claude.ai)“; Hochladen-Hinweis
  korrigiert („⧉ Fassungen“ statt „Eigene Fassung“). Alle 44 Quellpakete neu geladen; Rechte-Tests 5/5,
  Downloads 154/154.
- Test `src/components/Hilfe.test.ts` (25 Fälle): Seitenerkennung, Öffnen/Schließen, Hinweis gemerkt, und
  21 Beschriftungen, die Hilfe und Anleitung nennen, gibt es im Tool wirklich (Gegenprobe: umbenannter
  Knopf schlägt an). Insgesamt 74 Tests grün.
- Nikos Laien-Test (Reiter „Anleitung“, Download, „?“ mit Escape, Einrichtungs-Datei in der Claude-App):
  **passt**. Baustein 6 damit abgeschlossen.

## 2026-11-15 · Pflege · Uhr-Fehler der WEG-Engine behoben, Decks neu gebaut (OFFENE-FRAGEN Nr. 18, 20)

- Gelber Schritt (Kursordner), Niko: „Ja, bitte bauen“ nach Plan. Vorher Sicherungskopie (lokal, nicht in
  OneDrive): WEG-Engine, alle `dist`-Ordner (voll und kompakt, beide Kurse), beide „2. Slides“,
  221 Dateien, 589 MB, Größe geprüft (`backup/2026-11-15_decks_vor_neubau/`).
- WEG-Engine `10_WEG-Kurs/engine/deck_engine.html`: Zugriffe auf die Uhr `#tmr` abgesichert wie in der
  H&G-Engine (`tFmt()`, Prüfung auf `null`), 964 → 967 Zeilen, sonst unverändert.
- Neu gebaut mit Nikos Skripten: alle WEG-Decks (16 voll, 8 kompakt) und H&G Tag 3–15; Teilnehmer-
  fassungen beider Kurse (alle „OK“); PDF nur für WEG Tag 6 (Lieferung 2.4), die einzige inhaltliche
  Änderung (ein gestrichenes Wort auf Folie 23, im PDF geprüft).
- Ausgeliefert ohne `ausliefern.py`, damit nichts Ungeprüftes mitwandert: Vorher wurde jede Datei in
  „2. Slides“ (ohne Ordner mit „_“) ihrer byte-gleichen `dist`-Datei zugeordnet (89 von 90), danach genau
  diese Dateien ersetzt (44 geändert, 46 gleich), dazu WEG Kompakt 3.2 auf Nikos Wunsch (vorher nur ein
  unsichtbarer Kommentar anders). Danach alle 90 ausgelieferten Dateien byte-gleich mit ihrem Bau;
  H&G Segment 2 und 4/5 voll sowie „_voll (nicht ausgegeben)“ unberührt.
- Sync: WEG 16 Trainer, 16 Teilnehmer, 1 PDF, 16 Quellpakete; H&G 13 Trainer, 2 Teilnehmer; WEG kompakt
  8/8/8; H&G kompakt unverändert. Prüfungen: Quellpakete 44 von 44 byte-gleich (vorher 26),
  Downloads 154 von 154, Rechte-Tests 5 von 5.
- Ein Fehler von mir im Chat: WEG Tag 6 als „2.6“ bezeichnet; ausgeliefert wird er als **2.4**
  („Verwalter, Beirat & Vertragsrecht“). Gebaut und ausgeliefert wurde richtig.
- `src/lib/folien.engine.test.ts`: verlangt jetzt, dass die echte Engine nicht mehr abbricht (vorher hielt
  der Test den Fehler fest); Gegenprobe mit dem alten Deck aus der Sicherung schlägt an. 49 Tests grün.
- Google Drive nicht angefasst (Nikos Schritt).
- Nikos Laien-Test (Stand-Datum auf der Kachel, Cockpit beim Blättern, Knopf „Präsentieren“): bestanden.
- Die Sicherungskopie `backup/2026-11-15_decks_vor_neubau/` (221 Dateien, 563 MB) auf Nikos Wunsch
  gelöscht; die Datenbank-Sicherungen in `backup/` bleiben.

## 2026-11-15 · Bausteine 2–5 · Gesamttest bestanden, Testdaten entfernt

- Nikos Laien-Gesamttest in vier Teilen mit eigenem Konto und Test-Konto: **passt** (Bausteine 2–5 damit
  abgeschlossen). Geprüft: Downloads (Trainer, PDF), Fußzeile mit eigenem Namen, Kursfreigabe an den
  Test-Trainer, eigene Folien-Notiz nur im Cockpit des Test-Trainers, Quellpaket laden, eigene Fassung
  hochladen, öffnen und an Niko freigeben (bei Niko nur herunterladbar), gemeinsamer Durchlauf (aufnehmen,
  Plan, Fassung im Plan, „abgehakt von“, gemeinsame Tagesnotiz, Konfliktmeldung bei gleichzeitigem
  Schreiben, Austreten räumt den Plantag des Ausgetretenen).
- Aufräumen (gelb, Niko: „aufräumen“): nach Sicherung `backup/2026-11-15_vor_aufraeumen_gesamttest.json`
  und zweitem Blick per Skript mit Vor- und Nachprüfung gelöscht: zwei Durchläufe „Test gemeinsam“ (samt
  einem Haken und einem Plantag) und die Folien-Notiz des Test-Trainers. Die Testfassung hat Niko als
  Test-Trainer in der App gelöscht (so verschwinden auch die Dateien im Bucket). Danach lesend geprüft:
  4 Durchläufe, 66 Haken wie vor dem Test, keine Fassungen und keine Dateien im Bucket `fassungen`.
  Die Kursfreigabe „WEG-Kurs → Test-Trainer“ bleibt für spätere Tests.
- Keine Code-Änderung.

## 2026-11-15 · Baustein 5 · Gemeinsamer Durchlauf (eingespielt; vorbereitet ab 13.11.)

- **Eingespielt am 15.11.2026 nach Nikos „ja“** (gelber Schritt, inkl. OFFENE-FRAGEN Nr. 23): Sicherung
  `backup/2026-11-15_vor_baustein5.json` und Migration in einem Befehl; Selbstprüfung KT-G00–G12 bestanden;
  danach alle 5 Rechte-Tests live grün; lesend geprüft: anon ohne Rechte auf Tabellen und Funktionen des
  Kurs-Tools, alle `kt_`-Tabellen mit RLS, Regeln und drei Trigger wie erwartet, `kt_migrationen` stimmt mit
  dem Repo überein. Erst danach App nach `main`. Ehrlich vermerkt: Der erste Anlauf brach vor der Migration
  ab, weil meine eigene Prüfung der Sicherungsdatei einen falschen Schlüssel las; die Kette hat wie gewollt
  gestoppt, die Datenbank blieb unverändert.
- `supabase/sicherung.sql`: neue Tabellen `kt_durchlauf_trainer`, `kt_durchlauf_tage`; neu auch
  Spaltenrechte und Trigger des Kurs-Tools.
- Migration `20261113220000_kt_gemeinsamer_durchlauf.sql` (**ersetzt Regeln, gelb**): Mitwirkende
  (`kt_durchlauf_trainer`), Plan (`kt_durchlauf_tage`: Kurstag → Trainer + eigene Fassung),
  `fortschritt.geaendert_von` per Trigger; Regeln für Durchläufe und Haken um Mitwirkende erweitert;
  Fassungen im Plan für alle Beteiligten sichtbar (nur Deck). Rückbau und Rechte-Test (G00–G61).
- Zweiter Blick (Sub-Agent) fand eine Lücke: Der Besitzer eines Durchlaufs hätte eine nicht freigegebene
  Fassung eines Mitwirkenden selbst in den Plan setzen und so lesen können. Neu deshalb: Eine Fassung setzt
  nur, wer den Tag hält (Regel + Trigger `kt_plan_pruefen`); wer austritt oder ausgetragen wird, verliert
  seine Plantage (Trigger `kt_mitwirkender_entfernt`), seine Fassung ist dann nicht mehr sichtbar; Haken
  lassen sich nicht in einen anderen Tag oder Durchlauf verschieben; „wer zuletzt abgehakt hat“ ändert sich
  nur beim Abhaken, nicht bei der Notiz; Kurs eines Durchlaufs unveränderlich; Fremdschlüssel mit
  `ON DELETE`; Hilfsfunktionen antworten nur Beteiligten; Datenprüfung vorab (KT-G00).
- Zweiter Blick auf die überarbeitete Fassung (15.11.2026): kein Blocker. Umgesetzt: `kt_fassung_passt`
  antwortet nur über eigene Fassungen (verriet sonst, ob es eine fremde Fassung gibt und wem sie gehört;
  die Planregel hält damit auch ohne Trigger); „wer“-Trigger lässt Folgeänderungen der Datenbank stehen
  (sonst blockiert das Löschen eines Trainers); Indizes für Plan und „wer“; Selbstprüfung prüft Inhalt
  der Regeln und alle Spaltenrechte auf `durchlaeufe`; Test um upsert-Wege, Hilfsfunktionen für Fremde,
  später Aufgenommene und gelöschte Trainer ergänzt; `lock_timeout` auch im Test.
- App: Haken und Tagesnotiz werden getrennt gespeichert. Die Notiz (`src/lib/notizEntwurf.ts`) speichert
  nach kurzer Pause, beim Verlassen des Feldes und beim Zuklappen, nie zwei Aufträge gleichzeitig. Jeder
  Entwurf merkt sich den Stand, auf dem er beruht, und speichert nur, wenn ihn seither niemand geändert
  hat (Versionsmarke `geaendert_am`); bei einem Konflikt wird neu geladen und der neueste eigene Text in
  der Meldung gezeigt; bei anderen Fehlern bleibt der Text im Feld und wird erneut gesendet. Der Haken
  liefert den ganzen Stand zurück; verspätete ältere Antworten überschreiben keinen neueren Stand. Nach
  dem Wechsel des Durchlaufs ist erst bearbeitbar, was geladen ist. Ladefehler (Tage, Plan, Fassungen,
  Trainer) werden angezeigt statt verschluckt.
- Dritter Blick (nur auf die Änderungen) fand drei Wege, auf denen Notiztext verloren gehen konnte
  (Haken schob die Versionsmarke weiter; Netzfehler löschte den Entwurf; Konflikt verschluckte neueren
  Text): behoben, siehe oben.
- Neu: `src/lib/tagebuch.test.ts` (9 Fälle) und `src/lib/notizEntwurf.test.ts` (6 Fälle); 5 Gegenproben
  (Versionsprüfung weg, Grundlage neu beim Tippen, Fehler verwirft Text, Konflikt nennt alten Text,
  gleichzeitige Aufträge): alle erkannt. Insgesamt 49 Tests grün.
- SPEC: Annahme zu Notizen präzisiert (Folien-Notizen privat, Tagesnotiz gemeinsam, OFFENE-FRAGEN Nr. 23);
  neu OFFENE-FRAGEN Nr. 24 (wer im gemeinsamen Durchlauf was sieht).
- Probelauf (alles in einer Transaktion, zurückgerollt): Migration + neuer Test, Migration + jeder der vier
  bisherigen Tests, Migration + Rückbau + alte Tests: alle grün. Nach Migration + Rückbau ist der Stand
  (Regeln, Funktionen, Spalten, Rechte, Trigger, Indizes) laut Prüfsumme identisch mit vorher.
  9 Gegenproben (je ein Trigger entfernt, alte Prüffunktion, Recht zurück, Regel geschwächt, falsche
  Erwartung): alle erkannt.
- App auf dem Zweig `baustein-5-gemeinsam`: Tagebuch mit Team-Leiste (aufnehmen, austragen, sich selbst
  austragen), je Tag „hält: …“ und „mit: …“ (eigene Fassung), „abgehakt von …“, fremde Durchläufe in der
  Auswahl mit „(von …)“. Wird erst nach Nikos „ja“ und dem Einspielen nach `main` gemischt.

## 2026-11-13 · Baustein 4, Teil 2 · Eigene Fassungen hochladen und freigeben

- Migration `20261113210000_kt_deck_fassungen.sql` (hinzufügend, nach Sicherung eingespielt): Tabellen
  `kt_deck_fassungen` und `kt_fassung_freigaben`, **eigener privater Bucket `fassungen`** (40 MB je Datei)
  mit eigenen Regeln; die Regeln des Buckets `decks` bleiben unverändert (dort gilt die Admin-Regel für
  verwaiste Dateien, die Fassungen nicht erfassen soll).
- Regeln: Fassung nur sichtbar für Besitzer und per Freigabe, nur solange man den Kurs selbst sehen darf;
  Anlegen ab Kursstufe „fassung“, Kopie einer Fassung nur mit Stufe „fassung“ an ihr; Freigabe nur an
  Trainer mit Kurszugang, wirksam höchstens bis zur Kursstufe des Empfängers; Dateizugriff an den
  Besitzer-Ordner gebunden; unbekannte Dateinamen gesperrt; id, Besitzer, Kurstag und Grundlage nach dem
  Anlegen unveränderlich (Spaltenrechte); Grundlage nur vom selben Kurstag; Kurstage mit Fassungen nicht
  löschbar; Längen-, Format- und Pfadprüfungen.
- Zweiter Blick (Sub-Agent) **vor** dem Einspielen: fand zwei ernste Punkte in der App (Titel einer fremden
  Fassung ungeschützt im Ladefenster; fremdes Deck liefe im Tool mit der Anmeldung des Betrachters) und
  zwölf Verschärfungen der Regeln. Alle umgesetzt; fremde Fassungen lassen sich nur herunterladen
  (OFFENE-FRAGEN Nr. 21).
- Rechte-Test `20261113210000_kt_deck_fassungen_test.sql` (F01–F61); 17 Gegenproben, jede eingebaute
  Schwäche wird erkannt (teils von der Selbstprüfung der Migration oder doppelt).
- App: Seite „Fassungen“ je Kurstag (`/fassungen/:tagId`, Link „⧉ Fassungen“ mit Anzahl): Quellpaket des
  Originals, eigene Fassungen (öffnen, herunterladen, Quellen, neue Version, freigeben, löschen, Hinweis
  wenn die Grundlage neuer ist), für mich freigegebene Fassungen (herunterladen, Quellen, als Grundlage),
  Hochladen mit Prüfung von Deck und Zip. Ladefenster maskiert jede Beschriftung.
- Neu: `npm run pruefen:fassungen`: Selbsttest auf dem echten Weg über die Storage-API unter Nikos
  Sync-Anmeldung (Probe-Fassung anlegen, Deck und Zip hochladen, byte-gleich zurücklesen, ersetzen,
  verbotene Datei und fremden Ordner abgelehnt, alles wieder gelöscht). Erster Lauf: 11 von 11, nichts übrig.
- Neu: `npm run pruefen:rechte` (alle Rechte-Tests). Dabei aufgefallen: Test C zählte seit dem Hochladen
  der echten Quellpakete falsch (erwartete genau eine Datei unter `weg/quellen/`); korrigiert, Tests
  zählen nur noch ihre eigenen Testdaten. Lehre in `CLAUDE.md` §4 Nr. 4.
- Ehrlich vermerkt: Der zweite Blick vor dem Einspielen fehlte bei `20261113180000` und `20261113200000`
  (je nur neue Spalten) und erfolgte bei `20261113190000` erst mit dem Code danach.

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
