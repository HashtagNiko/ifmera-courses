# Einrichtung: eigene Kursfassungen mit Claude bearbeiten

> **Für Claude.** Ein Trainer gibt dir diese Datei, damit du ihn beim Einrichten begleitest. Er ist
> Laie: kein Programmierer, will kurze, klare Schritte. Antworte auf Deutsch, in der du-Form.

## Worum es geht

Im ifmera Kurs-Tool (https://courses.shnoozy.top) liegen die Foliensätze (Decks) der Kurse. Wer die
Stufe „+ eigene Kopie bearbeiten“ hat, kann zu jedem Kurstag ein **Quellpaket** (Zip) laden, es mit
Claude verändern, daraus ein neues Deck **bauen** und beides als **eigene Fassung** wieder ins Tool
hochladen. Das Original bleibt immer unverändert; die eigene Fassung sieht nur er, bis er sie freigibt.

Im Quellpaket liegt eine eigene Anleitung (`CLAUDE.md`) und die Gestaltungsregeln (`KURSREGELN.md`).
Für die eigentliche Arbeit am Deck gelten die; diese Datei hier ist nur für die Einrichtung.

## Deine Aufgabe

1. **Stell zuerst genau eine Frage** und warte auf die Antwort:
   > „Möchtest du in der **Claude-App** arbeiten oder in **VS Code**?
   > – Claude-App: schneller Einstieg, nichts weiter zu installieren. Gut für einzelne Änderungen.
   > – VS Code: einmal etwas mehr Einrichtung, dafür bequemer bei größeren Umbauten, und alles bleibt
   >   als Ordner auf deinem Rechner.
   > Wenn du unsicher bist: Nimm die App.“
2. Schreib dann eine **Laien-Anleitung nur für diesen Weg**:
   - nummerierte Schritte, je Schritt: was er tut und was er danach sehen muss;
   - jeden Klick ausschreiben, Fachwörter kurz in Klammern erklären;
   - höchstens etwa zehn Schritte am Stück, dann fragen, ob alles geklappt hat;
   - am Ende ein **Probelauf** mit einem echten Quellpaket (siehe „Was am Ende funktionieren muss“).
3. Programme ändern ihre Menüs. Wenn du dir bei einem Menünamen oder einer Einstellung nicht sicher
   bist, sag das offen und beschreib, wonach er suchen soll. Erfinde keine Menüpunkte.
4. Passwörter, Zugangsdaten oder Schlüssel soll er dir **nie** in den Chat schreiben.
5. Wenn etwas nicht klappt: nach dem genauen Wortlaut der Meldung fragen, dann Schritt für Schritt
   weiter.

## Was am Ende funktionieren muss (beide Wege)

1. **Quellpaket holen:** Im Kurs-Tool anmelden, Reiter „Kurstage“, beim Kurstag unter
   „Herunterladen:“ auf „Quellen“ klicken (oder „⧉ Fassungen“ → „Quellpaket des Originals laden“).
2. **Bearbeiten:** Claude liest im Paket `CLAUDE.md` und `KURSREGELN.md` und ändert die Folien.
3. **Bauen:** `python engine/build.py .` im Paketordner (Python 3, keine Zusatzpakete). Das fertige
   Deck liegt danach in `dist/`.
4. **Ansehen:** Das Deck aus `dist/` im Browser öffnen, mit den Pfeiltasten durchklicken, auch
   „🖥 Trainer-Cockpit öffnen“.
5. **Hochladen:** Im Kurs-Tool beim Kurstag „⧉ Fassungen“ → unter „Neue Fassung hochladen“ einen
   Titel eingeben, bei „Gebautes Deck“ die HTML-Datei aus `dist/` wählen, bei „Quellpaket“ den ganzen
   Ordner als Zip, dann „Fassung hochladen“. Spätere Änderungen: bei der Fassung „Neue Version
   hochladen“.
6. **Für die Teilnehmer:** Die Teilnehmerfassung (HTML) gibt es im Tool bei der Fassung über
   „Teilnehmer herunterladen“. Das PDF entsteht im Paketordner mit `python engine/pdf_fassung.py .`
   (nur Weg B oder mit Python am eigenen Rechner, siehe dort).

## Ablage auf dem Rechner (für beide Wege gleich)

Erkläre dem Trainer diese Ordnung und halte dich selbst daran:

- Ein Hauptordner, zum Beispiel `Dokumente\ifmera-Fassungen`, darin **ein Ordner je Kurs**
  (`H&G-Kurs`), darin **ein Ordner je Kurstag**: das entpackte Quellpaket (Name wie im Zip, etwa
  `Tag8_Segment3`). Je Kurstag nur **ein** Arbeitsordner, keine Kopien.
- Gearbeitet wird nur dort. **Gesichert wird im Tool:** nach jeder fertigen Änderung hochladen (Deck aus
  `dist/` und den ganzen Ordner als Zip). Im Chat (Weg A) ist das zuletzt heruntergeladene Zip der
  Arbeitsstand; es gehört in den Kurstag-Ordner, ältere Zips löschen.
- Hat der Kursautor sein Original geändert (gelber Hinweis im Tool), das neue Quellpaket als zweiten
  Ordner daneben entpacken (`…_neu`), Änderungen übernehmen, hochladen, `…_neu` löschen, im Tool
  „Ist erledigt“ klicken.
- Die genaue Arbeitsweise steht in der `CLAUDE.md` jedes Quellpakets (Abschnitt „Ablage und Ablauf“).

## Weg A: Claude-App (Windows) oder claude.ai im Browser

- **Voraussetzung:** ein bezahltes Claude-Abo, in dem du Code ausführen und Dateien erstellen kannst.
  Prüfe selbst, ob du in diesem Chat Code ausführen kannst. Wenn nicht: erkläre, wo man das in den
  Einstellungen einschaltet (so genau, wie du es sicher weißt), oder nenne als Ausweg Python am
  eigenen Rechner (dann baut er selbst, siehe Weg B, Schritt „Python“).
- **Gibt es in der App einen Bereich, in dem Claude direkt in einem Ordner auf seinem Rechner arbeitet**
  (Claude Code in der App), dann ist das der bequemere Weg: Er entpackt das Paket in einen Ordner,
  öffnet ihn dort, und alles läuft wie in Weg B, nur ohne VS Code. Biete das an, wenn du weißt, dass
  es das in seiner App gibt.
- **Arbeiten im Chat:** je Kurstag ein neuer Chat. Zip hochladen und zum Beispiel schreiben:
  > „Lies zuerst CLAUDE.md und KURSREGELN.md im Paket. Dann ändere: … Bau danach das Deck und gib mir
  > das Deck aus dist/ und den ganzen Ordner als Zip zum Herunterladen.“
- **Wichtig:** Beim Weiterarbeiten immer das zuletzt heruntergeladene Zip hochladen, nicht das alte
  Paket. Die zwei heruntergeladenen Dateien sind genau die, die er im Tool hochlädt.

## Weg B: VS Code mit Claude Code

Führe ihn durch diese Teile, jeweils mit Prüfung, ob es geklappt hat:

1. **Python 3** installieren (von python.org). Unter Windows beim Installieren den Haken
   „Add python.exe to PATH“ setzen. Prüfen: im Terminal `python --version` zeigt eine Version 3.x.
2. **VS Code** installieren (code.visualstudio.com).
3. **Claude Code** in VS Code einrichten (Erweiterung von Anthropic) und mit seinem Claude-Konto
   anmelden. Nenne die aktuellen Voraussetzungen für Windows, soweit du sie sicher kennst, und
   verweise sonst auf die offizielle Anleitung von Anthropic.
4. **Arbeitsordner:** zum Beispiel `Dokumente\ifmera-Fassungen`. Jedes Quellpaket dort entpacken
   (Rechtsklick auf das Zip → „Alle extrahieren…“). In VS Code „Datei → Ordner öffnen…“ und den
   Ordner des Kurstags wählen (der Ordner, in dem `CLAUDE.md` liegt).
5. **Arbeiten:** Claude Code öffnen und schreiben, was geändert werden soll. Claude Code liest
   `CLAUDE.md` von selbst und kann selbst bauen.
6. **Zip für das Tool:** Im Explorer Rechtsklick auf den Ordner des Kurstags → „Senden an“ →
   „ZIP-komprimierter Ordner“. Dieses Zip und das Deck aus `dist/` im Tool hochladen.
7. **PDF für die Teilnehmer (einmal einrichten):** im Terminal `pip install playwright pymupdf` und
   `python -m playwright install chromium`. Danach im Kurstag-Ordner `python engine/pdf_fassung.py .`;
   das PDF liegt in `dist/teilnehmer/pdf/`.

## Kurz-Hilfe für unterwegs

- Der Bau bricht ab mit „Kein Bild für Platzhalter …“ oder „Nicht ersetzte Platzhalter …“: Ein Bild
  ist in einer Folie eingebunden, aber nicht im Bauplan `build.json` eingetragen (oder umgekehrt).
- Das Tool nimmt das Deck nicht an: Es muss die gebaute Datei aus `dist/` sein, nicht eine Datei aus
  `slides/`.
- Folientitel möglichst nicht ändern: Eigene Notizen im Tool finden ihre Folie über den Titel.
