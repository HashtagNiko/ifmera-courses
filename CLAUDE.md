# CLAUDE.md — ifmera Kurs-Tool (courses.shnoozy.top)

> Arbeitsanweisung für Claude Code. Niko pflegt sie; Claude ändert sie nur auf Nikos Wunsch.
> Was gebaut wird: `SPEC.md` · Offene Punkte: `OFFENE-FRAGEN.md` · Was geändert wurde: `CHANGELOG.md` ·
> Technischer Hintergrund (Decks, Sync, Bucket): `README.md`.

---

## 0. Worum es geht

Trainer-Oberfläche für die ifmera-Kurse: Kurstage als Kacheln, Decks im eigenen Fenster mit
Trainer-Cockpit, Trainertagebuch je Durchlauf. Bisher nutzt nur Niko das Tool.

**Laufendes Vorhaben: mehrere Trainer** (Einzelheiten in `SPEC.md`). Ein Co-Trainer bekommt einen
eigenen Zugang, nutzt Nikos freigegebene Decks, schreibt eigene Notizen, baut mit Claude eigene
Fassungen, und beide halten gemeinsame Durchläufe.

Grundsatz: **Was Niko gehört, bleibt seins. Was der Co-Trainer baut, bleibt seins.**
Das setzt die Datenbank durch, nicht die App.

---

## 1. Rollen

| Wer | Aufgabe |
|---|---|
| **Claude** | plant, baut, testet, prüft sich selbst (§4), spielt Änderungen ein, schreibt Laien-Testanleitungen. Arbeitet so selbstständig wie möglich. |
| **Niko** | entscheidet fachlich, testet als Laie, sagt „ja“ zu gelben Schritten (§2), erledigt rote Schritte nach Klick-Anleitung. |

Es gibt **keinen Prüfer**. Claude prüft sich selbst nach §4.

---

## 2. Was Claude allein darf – die Ampel

**🟢 Grün – Claude macht es allein und berichtet danach**
- Code, Doku und Tests in diesem Repo; Branches anlegen, nach bestandener Selbstprüfung nach `main`
  mergen und pushen (damit geht die App live)
- Datenbank lesen
- **hinzufügende** Datenbankschritte nur für das Kurs-Tool: neue `kt_`-Tabellen, neue Spalten, neue
  Funktionen, Rechte auf neue Tabellen – immer nach Sicherung (§4)
- `npm run sync:decks` und `npm run import:tagebuch` ausführen
- Kursordner (über `KURS_WURZEL`) und das Repo des Prüfungstools **lesen**

**🟡 Gelb – Claude erklärt in zwei, drei Sätzen, was passiert und wie es rückgängig geht, und wartet auf Nikos „ja“**
- bestehende Zugriffsregeln ändern oder ersetzen (Policies, Funktion `hat_kurszugriff`)
- Daten des Kurs-Tools löschen oder verschieben (Tabellenzeilen, Dateien im Bucket)
- alles, was eine echte andere Person sieht oder bekommt: Konten, Freigaben, Einladungen, Mails
- Dateien in den Kursordnern ändern (Folienquellen, Engine, Build-Skripte) – nur mit Sicherungskopie
- der eine Eintrag in die Freigabeliste des Prüfungstools (`eingeladene_trainer`), ohne den kein neues
  Konto angelegt werden kann

**🔴 Rot – macht nur Niko, Claude liefert eine Klick-Anleitung**
- Schlüssel, Passwörter und Zugangsdaten anlegen oder ändern
- Einstellungen im Supabase-Dashboard (Auth, Tarif, API-Schlüssel) und auf GitHub (Repo, Pages)
- alles andere am Prüfungstool: dessen Tabellen, Funktionen, Trigger und Repo. Claude ändert dort nie etwas.

Im Zweifel ist ein Schritt gelb. Offene Fragen halten nur den betroffenen Teil an; am Rest arbeitet
Claude weiter.

---

## 3. Wie Claude mit Niko spricht

Niko ist Laie und will kurze Nachrichten.

- Einfache Sprache, du-Form. Fachwörter nur mit kurzer Erklärung in Klammern.
- Jede Nachricht höchstens etwa zehn Zeilen. Technische Einzelheiten gehören in `CHANGELOG.md`, nicht in den Chat.
- Fragen nur, wenn wirklich Niko entscheiden muss: immer mit Empfehlung, beantwortbar mit „ja“, „nein“
  oder einem Buchstaben, höchstens drei auf einmal.

Jeder Bericht hat diese Form:

```
**Erledigt:**     1–3 Sätze: was ist jetzt anders, aus Nikos Sicht
**Du musst:**     „Nichts.“ – oder Tabelle: Nr. | Was du tust | Was du sehen musst
                  (jeder Klick ausgeschrieben, riskante Klicks ausdrücklich verbieten)
**Frage:**        nur wenn nötig, mit Empfehlung
**Als Nächstes:** was Claude jetzt macht
```

Claude meldet nie selbst „fertig“. Ein Baustein ist abgeschlossen, wenn Niko nach seinem Test „passt“ schreibt.

---

## 4. Sicherheitsnetz (statt Prüfer)

1. **Geteilte Datenbank, kein Testprojekt.** Das Kurs-Tool liegt im Supabase-Projekt „shnoozy-App“
   zusammen mit dem Prüfungstool, das dort echte Daten hat. Claude fasst nur Objekte des Kurs-Tools an (§6).
2. **Jede Datenbankänderung ist eine Migrationsdatei** in `supabase/migrations/` (Zeitstempel vorn):
   eine Transaktion mit Selbstprüfung am Ende (`DO`-Block, der bei Abweichung `RAISE EXCEPTION` wirft).
   Schlägt etwas fehl, ändert sich nichts. Nie Änderungen nur im Dashboard.
3. **Zu jeder Migration eine Rückbau-Datei** in `supabase/rueckbau/` mit gleichem Namen.
4. **Sicherung vorher.** Vor jeder Migration speichert Claude Inhalt und Regeln der Kurs-Tool-Tabellen
   als Datei in `backup/` (nur lokal, steht in `.gitignore`).
5. **Rechte-Tests** in `supabase/tests/` laufen in einer Transaktion, die am Ende zurückgerollt wird.
   Test-Konten entstehen nur darin, es bleibt nichts zurück. Zu jedem Test gehört eine **Gegenprobe**:
   eine absichtlich falsche Regel muss den Test scheitern lassen.
6. **Zweiter Blick.** Vor jeder Migration und jedem gelben Schritt liest ein Sub-Agent die Datei mit
   frischem Blick gegen. Er bekommt die Datei und diese Regeln, nicht Claudes Einschätzung.
7. **Reihenfolge bei Rechten:** erst hinzufügen (neue Tabellen und Funktionen) → dann App-Code live →
   dann alte Regeln ersetzen (gelb). Ein Co-Trainer bekommt erst ein Konto, wenn die neuen Regeln
   stehen und getestet sind.
8. **Nach jedem Einspielen** prüft Claude lesend: Deploy grün und App live, Regeln wie erwartet,
   `anon` hat keine Rechte auf `kt_`-Tabellen, Repo und Datenbank stimmen überein.
9. **Dateien nicht abschneiden.** Bei langen Dateien Zeilenzahl vorher und nachher vergleichen.
10. **Nikos Kursdateien bleiben unberührt**, außer bei gelben Schritten. Was nur die Anzeige betrifft
    (Vollbild-Knopf, Notizen, Name in der Fußzeile), passiert in der Kopie im Browser.

---

## 5. Öffentliches Repo

Das Repo ist öffentlich, und GitHub Pages liefert jede Datei ohne Login aus.

- Keine Kursinhalte, keine Schlüssel, keine Mailadressen, keine Namen außer Nikos eigenem.
  Der zweite Trainer heißt in allen Dateien **„Co-Trainer“**.
- Keine absoluten Pfade von Nikos Rechner; Kursordner nur über `KURS_WURZEL` aus der `.env`.
- Der Ordner `Anderes Projekt/` gehört zu einem anderen Projekt und ist lokal vom Hochladen
  ausgeschlossen (`.git/info/exclude`).
- `backup/` und `tmp/` stehen in `.gitignore`; Hilfsdateien nur dort, nach Gebrauch löschen.

---

## 6. Technik und Zugänge

| Bereich | Stand |
|---|---|
| App | React + TypeScript + Vite + Tailwind, Code in `src/` |
| Hosting | GitHub Pages, Domain `courses.shnoozy.top`. **Push auf `main` = live** (`.github/workflows/deploy.yml`) |
| Datenbank, Login, Dateien | Supabase-Projekt „shnoozy-App“ (`gjeunxdhawzptjbheoxx`), privater Bucket `decks` |
| Decks | werden in den Kursordnern gebaut; `npm run sync:decks` lädt sie hoch |
| Sprache | Oberfläche, Doku und Code-Bezeichner Deutsch wie bisher. Neue Tabellen und Funktionen beginnen mit `kt_` |

**Objekte des Kurs-Tools – nur diese darf Claude ändern:**
Tabellen `kurse`, `kurstage`, `durchlaeufe`, `fortschritt`, `kurs_zugriff` und alle `kt_*` ·
Funktion `hat_kurszugriff` und alle `kt_*`-Funktionen · Bucket `decks` und seine Policies.

**Nicht verwechseln:** Das Prüfungstool hat eigene Tabellen mit ähnlichen Namen (`trainer`, `kurs`,
`kurs_freigabe`, `pruefung_freigabe`, `eingeladene_trainer` u. a.). Jedes neue Konto im Projekt bekommt
per Trigger des Prüfungstools automatisch eine Zeile in `trainer`, und anlegen lässt es sich nur, wenn
die Adresse vorher in `eingeladene_trainer` steht.

**Datenbankzugang von Claude:** Supabase Management API mit dem persönlichen Schlüssel aus der
Windows-Benutzervariable `SUPABASE_TOKEN_KURSTOOL` (gilt nur für „shnoozy-App“).
- Den Wert nie ausgeben, nie in Dateien oder Befehlszeilen schreiben, die angezeigt werden.
- **Nie** `SUPABASE_ACCESS_TOKEN` oder `SUPABASE_ACCESS_TOKEN_PROD` verwenden – die gehören zu einem
  anderen Projekt.
- Der Supabase-Connector in claude.ai sieht „shnoozy-App“ nicht; er ist hier nicht zu verwenden.
- Ablaufdatum des Schlüssels steht in `OFFENE-FRAGEN.md`. Ab 14 Tagen vorher nennt Claude die
  Restlaufzeit in jedem Bericht.

**GitHub:** Claude legt Branches an, mergt und pusht selbst (grün). Das Repo gehört dem Konto
`HashtagNiko`; aktives `gh`-Konto ist `HausBlick` (für andere Projekte) und darf **nicht** umgestellt
werden. Push deshalb mit dem Schlüssel von `HashtagNiko`, ohne ihn auszugeben:

```bash
T=$(gh auth token --user HashtagNiko) && git -c credential.helper= \
  -c "credential.helper=!f() { echo username=HashtagNiko; echo password=$T; }; f" push origin <branch>; unset T
```

---

## 7. Ablauf je Baustein

1. Branch `baustein-<n>-<stichwort>` anlegen.
2. Bauen und Tests schreiben; `npm run build` muss fehlerfrei durchlaufen.
3. Selbstprüfung nach §4, bei Migrationen mit Sicherung und zweitem Blick.
4. Hinzufügende Migrationen einspielen (grün), gelbe Schritte erst nach Nikos „ja“.
5. `CHANGELOG.md` ergänzen: neuer Eintrag oben mit Datum, Baustein, Beschreibung, geänderten Dateien.
6. Nach `main` mergen, pushen, Deploy-Lauf abwarten, live nachsehen.
7. Branch lokal und auf GitHub löschen.
8. Bericht an Niko nach §3, mit Laien-Test.

Offene Punkte führt Claude nummeriert in `OFFENE-FRAGEN.md`: neue unten anfügen, nichts löschen,
Geklärtes mit Datum und Antwort markieren. Was nicht in `SPEC.md` steht, baut Claude nicht ungefragt.
