# CLAUDE.md – neuer Kurs im ifmera Kurs-Tool

> Anleitung für Claude (Claude Code, die Claude-App oder claude.ai). Dieser Ordner ist das **Startpaket**
> aus dem ifmera Kurs-Tool (courses.shnoozy.top). Ein Trainer baut damit zusammen mit dir einen **eigenen
> Kurs**: Er bringt Thema und Fachwissen mit, du planst mit ihm, schreibst die Folien und baust die Decks.
> Der Trainer ist meist kein Techniker: einfache Sprache, kurze Schritte, Fachwörter kurz erklären.

## Was hier liegt

| Datei / Ordner | Inhalt |
|---|---|
| `CLAUDE.md` | diese Anleitung |
| `KURSPLAN.md` | Vorlage für den Kursplan (Eckdaten, Kurstage, Lernziele) – füllst du mit dem Trainer aus |
| `_vorlage-kurstag/` | Vorlage für **einen** Kurstag: Engine, Build, Bauplan, vier Beispielfolien, eigene `CLAUDE.md` |

Jeder Kurstag bekommt später einen eigenen Ordner (`Tag1/`, `Tag2/` …), angelegt als Kopie von
`_vorlage-kurstag/`. Was in einem Tagesordner gilt (Aufbau, Bauen, Folienregeln), steht in dessen
`CLAUDE.md`; lies sie, bevor du den ersten Tag baust.

## Ablage beim Trainer

1. Das Zip entpacken und den Ordner nach dem Kurs benennen, zum Beispiel
   `Dokumente\ifmera-Kurse\Brandschutz\`. Das ist ab jetzt **der** Kursordner.
2. Darin: `CLAUDE.md`, `KURSPLAN.md`, `_vorlage-kurstag/` und je Kurstag ein Ordner `Tag1/`, `Tag2/` …
   Je Kurstag gibt es nur **einen** Arbeitsordner, keine Kopien oder „_alt“-Ordner daneben.
3. **Gesichert ist, was im Kurs-Tool liegt.** Nach jeder fertigen Änderung wird der Tag dort hochgeladen.
   Der Ordner auf dem Rechner ist die Werkbank und bleibt bestehen; nicht löschen.

## Ablauf

### 1. Planen (vor der ersten Folie)

Frag den Trainer nacheinander, nicht alles auf einmal:

- Thema und Name des Kurses
- Zielgruppe und deren Vorwissen; was sollen die Teilnehmer danach können?
- Anzahl der Kurstage und Dauer je Tag; online (Teams) oder vor Ort
- vorhandenes Material: Skripte, Gesetzestexte, eigene Folien, eigene oder lizenzierte Grafiken
- sein Name für die Fußzeile, genau wie im Kurs-Tool unter „Profil“ (zum Beispiel „Herr Muster“)

Trag alles in `KURSPLAN.md` ein, schlag eine Gliederung vor (je Kurstag Thema, Lernziele, Interaktionen)
und lass sie vom Trainer bestätigen. Erst dann bauen.

### 2. Einen Kurstag bauen

1. `_vorlage-kurstag/` kopieren und in `Tag<n>/` umbenennen (`Tag1`, `Tag2` …). Für Projekttage
   `Projekttag<n>/`, für die Abschlussprüfung `Pruefung1/`.
2. In `Tag<n>/build.json` anpassen: `name` (`Tag<n>`), `title` (zum Beispiel
   `ifmera · Brandschutz · Tag 2 von 4 — Fluchtwege`) und `out` (`dist/Tag<n>.html`).
3. Die Beispielfolien in `slides/tag.html` durch die echten Folien ersetzen, nach den Regeln in der
   `CLAUDE.md` und der `KURSREGELN.md` des Tagesordners. In jeder Fußzeile den Namen des Trainers.
4. Bauen: im Tagesordner `python engine/build.py .`, dann das Deck aus `dist/` im Browser durchklicken,
   auch das Trainer-Cockpit.
5. Auf Wunsch das PDF für die Teilnehmer: `python engine/pdf_fassung.py .` (siehe Tages-`CLAUDE.md`).
6. In `KURSPLAN.md` den Stand des Tages nachtragen.

Einen Tag nach dem anderen bauen und vom Trainer ansehen lassen; nicht alle Tage auf einmal.

### 3. Ins Kurs-Tool hochladen (macht der Trainer, du erklärst es)

Einmalig: im Kurs-Tool oben „Eigene Kurse“, Kursname eingeben, „Kurs anlegen“.

Je Kurstag, auf der Seite „Kurs bearbeiten“:

1. „Tag anlegen“: Art (Kurstag, Projekttag oder Abschlussprüfung), Nummer und Titel wie im Kursplan.
2. Beim Tag „Dateien hochladen“:
   - **Gebautes Deck:** `Tag<n>/dist/Tag<n>.html`
   - **Ordner des Tages als Zip:** den ganzen Ordner `Tag<n>` zippen (Windows: Rechtsklick auf den Ordner →
     „Senden an“ → „ZIP-komprimierter Ordner“ bzw. „In ZIP-Datei komprimieren“). Das Zip ist das
     Quellpaket: Damit können andere Trainer, denen der Kurs freigegeben ist, eigene Fassungen bauen.
   - **PDF** (optional): `Tag<n>/dist/teilnehmer/pdf/Tag<n>.pdf`
   - dann „Hochladen“. Die Teilnehmerfassung (ohne Notizen und Cockpit) macht das Tool selbst.
3. Eine neue Version eines Tages: ändern, neu bauen, wieder „Dateien hochladen“. Das Tool hält den
   letzten Stand.

Den Kurs sieht nur der Trainer selbst, bis er ihn unter „Freigaben“ anderen Trainern freigibt.

## Inhalt: worauf du achtest

- **Fachlich richtig und aktuell.** Rechtsstände, Zahlen und Fristen nur, wenn du dir sicher bist; sonst
  ausdrücklich als „bitte prüfen“ markieren (in der Notiz, nicht auf der Folie) und den Trainer fragen.
- **Keine fremden Bilder.** Grafiken und Fotos nur, wenn der Trainer sie selbst liefert (eigene oder
  lizenzierte). Lieber eine gut gebaute Folie aus den Bausteinen der Engine als ein Bild aus dem Netz.
- **Keine Daten echter Personen** (Teilnehmer, Kunden, Eigentümer) in Folien oder Notizen.
- **Notizen sind der Sprechtext.** Ausführlich und in ganzen Sätzen; `data-aktion` sagt, was der Trainer
  tut, `data-bruecke` ist der Überleitungssatz zur nächsten Folie.
- `KURSREGELN.md` stammt aus den Kursen des Kursautors. Gestaltung, Bausteine und die harten Regeln
  gelten auch hier. Was sich dort ausdrücklich auf dessen Kurse bezieht (Skripte und deren Nummerierung,
  bestimmte Kurstage, ein durchgehendes Fallbeispiel, ein Grafik-Ordner auf dessen Rechner), gilt nicht.

## Im Chat (Claude-App oder claude.ai)

Claude Code liest diese Datei von selbst. Im Chat lädt der Trainer das Startpaket hoch und bittet dich,
diese Datei zu lesen. Dann:

1. **Kannst du Code ausführen** (Dateien entpacken, Python starten)? Dann arbeitest du im entpackten Paket
   wie oben beschrieben und gibst dem Trainer je fertigem Tag **zwei Dateien zum Herunterladen**: das
   gebaute Deck und den Tagesordner als Zip (oberster Ordner `Tag<n>`), dazu am Ende den ganzen Kursordner
   als Zip, damit er seine Werkbank vollständig hat.
2. **Kannst du keinen Code ausführen**, sag das gleich zu Beginn. Dann ist Claude Code am eigenen Rechner
   der bessere Weg (die Einrichtung erklärt die Datei „Einrichtung für Claude“ im Kurs-Tool unter
   „Anleitung“). Oder der Trainer schaltet in der App die Code-Ausführung ein (bezahltes Abo).
3. **Weiterarbeiten:** Jede neue Sitzung beginnt mit dem zuletzt zurückgegebenen Kursordner, nie mit dem
   alten Startpaket, sonst gehen Änderungen verloren.

## Zum Schluss jeder Sitzung

Sag dem Trainer kurz, was du gebaut oder geändert hast, welcher Tag fertig ist und was er jetzt im
Kurs-Tool hochladen muss. Halte `KURSPLAN.md` auf dem aktuellen Stand.
