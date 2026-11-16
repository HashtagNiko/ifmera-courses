# CLAUDE.md – ein Kurstag (ifmera Kurs-Tool)

> Anleitung für Claude (Claude Code, die Claude-App oder claude.ai). Dieser Ordner ist **ein Kurstag**
> eines Kurses, den ein Trainer im ifmera Kurs-Tool (courses.shnoozy.top) selbst angelegt hat. Er
> entstand aus dem Startpaket des Tools. Wer damit arbeitet, ist entweder der Besitzer des Kurses (er
> baut seinen Kurs) oder ein anderer Trainer, dem der Kurs freigegeben ist (er baut daraus seine
> **eigene Fassung**; das Original bleibt unberührt). Frag im Zweifel, welcher Fall vorliegt.

## Was hier liegt

| Datei / Ordner | Inhalt |
|---|---|
| `slides/` | Folienquellen (HTML-Bausteine, je Folie ein `<section class="slide">`) |
| `anlagen/` | Bilder, die auf den Folien erscheinen (Logo und Bildmarke sind schon da) |
| `build.json` | Bauplan: welche Folienquellen, welche Bilder, wohin das Ergebnis kommt |
| `engine/deck_engine.html` | Gestaltung, Steuerung und Trainer-Cockpit der Decks |
| `engine/build.py` | baut aus allem ein einzelnes HTML-Deck |
| `engine/teilnehmer.py`, `engine/pdf.py` | Teilnehmerfassung und PDF |
| `engine/pdf_fassung.py` | ruft beide für diesen Ordner auf (siehe unten) |
| `KURSREGELN.md` | Gestaltungsregeln – **zuerst lesen** |

## Bauen

Python 3 genügt, keine weiteren Pakete. Im Ordner dieses Kurstags:

```
python engine/build.py .
```

Das fertige Deck liegt danach in `dist/` (Dateiname wie `out` im Bauplan). Es läuft offline in jedem
Browser; der Knopf „Trainer-Cockpit öffnen“ zeigt Notizen, Aktionen und Brücken.

## Folien schreiben

1. **Jede Folie** ist ein `<section class="slide" …>` in `slides/tag.html` (oder in mehreren Dateien,
   dann alle unter `slides` im Bauplan aufzählen, in der richtigen Reihenfolge). Die vier Beispielfolien
   zeigen Titel, Inhalt mit Karten und Merke-Kasten, Quiz und Abschluss.
2. **Bausteine der Engine** verwenden (Liste in `KURSREGELN.md`: `prinzip-grid`, `vier`, `flow`,
   `merkezeile`, `quiz` …), keine eigenen Layouts erfinden. Dunkle Rahmenfolien: `class="slide dark"`.
3. **Trainertexte** als Attribute an der `<section>`, nie sichtbar auf der Folie:
   - `data-notes` – der Sprechtext des Trainers, ausführlich, in ganzen Sätzen
   - `data-aktion` – was der Trainer tut (zeigen, fragen, abstimmen lassen)
   - `data-bruecke` – der Überleitungssatz zur nächsten Folie
   Anführungszeichen in diesen Texten als `&quot;` schreiben oder „deutsche“ verwenden.
4. **Rahmenfolien** (Titel, Agenda, Abschluss „Rückblick & Q&A“) tragen `data-topic="Rahmen"`; die
   übrigen ein Stichwort zum Thema, etwa `data-topic="Grundlagen"`.
5. **Fußzeile** jeder Folie: `© ifmera academy GmbH | <Name des Trainers>` (wie im Kurs-Tool unter
   „Profil“). Wer eine fremde Fassung baut, lässt den Namen stehen; das Tool setzt beim Herunterladen den
   eigenen ein.
6. **Bilder:** Datei nach `anlagen/`, im Bauplan unter `images` einen Schlüssel eintragen (zum Beispiel
   `"PLAN": "anlagen/plan.png"`), in der Folie `src="data:image/png;base64,{{PLAN}}"`. Der Build bricht
   ab, wenn ein Platzhalter fehlt. Nur Bilder, die der Trainer selbst liefert (eigene oder lizenzierte).
7. **Folientitel** (`<h2 class="folientitel">`) später möglichst nicht mehr ändern: Eigene Notizen anderer
   Trainer finden ihre Folie über den Titel.
8. **Engine** (`engine/deck_engine.html`) nur ändern, wenn es nicht anders geht.
9. Nach jeder Änderung neu bauen und das Deck durchklicken (Pfeiltasten), auch das Cockpit.

## Teilnehmerfassung und PDF

- **Teilnehmerfassung** (ohne Notizen und Cockpit): macht das Kurs-Tool beim Hochladen selbst.
- **PDF**: nach dem Bauen `python engine/pdf_fassung.py .` ausführen. Es legt
  `dist/teilnehmer/<Deck>.html` und `dist/teilnehmer/pdf/<Deck>.pdf` an. Dafür einmalig nötig:
  `pip install playwright pymupdf` und `python -m playwright install chromium`. Kannst du keine Programme
  installieren oder ausführen, sag das dem Trainer; das PDF ist freiwillig.

## Ins Kurs-Tool laden

- **Besitzer des Kurses:** im Tool „Eigene Kurse“ → beim Kurs „Kurs bearbeiten“ → beim Tag „Dateien
  hochladen“: das Deck aus `dist/`, diesen ganzen Ordner als Zip und, falls vorhanden, das PDF aus
  `dist/teilnehmer/pdf/`.
- **Anderer Trainer (eigene Fassung):** im Tool unter „Kurstage“ beim Tag „⧉ Fassungen“ → „Neue Fassung
  hochladen“ (oder bei der eigenen Fassung „Neue Version hochladen“): das Deck aus `dist/` und diesen
  ganzen Ordner als Zip.

Gesichert ist, was im Tool liegt; dieser Ordner ist die Werkbank. Keine Kopien daneben anlegen.

## Im Chat (Claude-App oder claude.ai)

1. Zuerst diese Datei und `KURSREGELN.md` lesen, dann `build.json`.
2. **Kannst du Code ausführen?** Dann: entpacken, ändern, mit `python engine/build.py .` bauen, prüfen und
   dem Trainer **zwei Dateien zum Herunterladen** geben: das Deck aus `dist/` und diesen ganzen Ordner als
   Zip, mit demselben obersten Ordner wie erhalten.
3. **Kannst du keinen Code ausführen**, sag das gleich zu Beginn und erkläre, wie der Trainer am eigenen
   Rechner baut (Python 3 installieren, im Ordner `python engine/build.py .`), oder dass er in der App die
   Code-Ausführung einschalten kann (bezahltes Abo).
4. Jede neue Sitzung beginnt mit dem zuletzt zurückgegebenen Zip, nie mit einem älteren Stand.
5. Am Ende kurz sagen, was geändert wurde, und an das Hochladen im Kurs-Tool erinnern.
