# CLAUDE.md – eigene Fassung eines ifmera-Kurstags

> Anleitung für Claude (Claude Code, die Claude-App oder claude.ai). Dieser Ordner ist das
> Quellpaket **eines** Kurstags aus dem ifmera Kurs-Tool (courses.shnoozy.top). Wer damit arbeitet,
> baut daraus seine **eigene Fassung**; das Original des Kursautors bleibt davon unberührt.
> Ohne Claude Code: siehe Abschnitt „Im Chat (Claude-App oder claude.ai)“ unten.

## Was hier liegt

| Datei / Ordner | Inhalt |
|---|---|
| `slides/` | Folienquellen (HTML-Bausteine, je Folie ein `<section class="slide">`) |
| `anlagen/` | Bilder und Dokumente, die auf den Folien erscheinen |
| `build.json` | Bauplan: welche Folienquellen, welche Bilder, wohin das Ergebnis kommt |
| `engine/deck_engine.html` | Gestaltung, Steuerung und Trainer-Cockpit der Decks |
| `engine/build.py` | baut aus allem ein einzelnes HTML-Deck |
| `KURSREGELN.md` | Gestaltungsregeln des Kurses (falls vorhanden) – **zuerst lesen** |

## Bauen

Python 3 genügt, keine weiteren Pakete:

```
python engine/build.py .
```

Das fertige Deck liegt danach in `dist/` (Dateiname wie im Bauplan). Es läuft offline in jedem
Browser; der Knopf „Trainer-Cockpit öffnen“ zeigt Notizen und Aktionen.

## Regeln für Änderungen

1. **Aufbau beibehalten.** Jede Folie ist ein `<section class="slide" …>`. Bausteine und Klassen
   der Engine verwenden (siehe `KURSREGELN.md`), keine eigenen Layouts erfinden.
2. **Trainer-Notizen** stehen in `data-notes`, Anweisungen in `data-aktion` an der jeweiligen
   `<section>`. Sie erscheinen nur im Cockpit, nie auf der Folie.
3. **Bilder** werden über Platzhalter eingebunden: in der Folie `src="data:image/png;base64,{{NAME}}"`,
   im Bauplan unter `images` der Pfad zu `anlagen/…`. Neue Bilder: Datei nach `anlagen/`, Eintrag
   in `build.json`, Platzhalter in der Folie. Der Build bricht ab, wenn ein Platzhalter fehlt.
4. **Folientitel** (`<h2 class="folientitel">`) möglichst behalten: Eigene Notizen im Kurs-Tool
   finden ihre Folie über den Titel.
5. **Engine** (`engine/deck_engine.html`) nur ändern, wenn es nicht anders geht; sie gilt für alle
   Decks des Kurses.
6. Nach jeder Änderung neu bauen und das Deck im Browser durchklicken (Pfeiltasten), auch das Cockpit.

## Fertige Fassung ins Kurs-Tool laden

Im Kurs-Tool unter „Kurstage“ beim Kurstag auf „⧉ Fassungen“, dann bei „Neue Fassung hochladen“
(oder bei einer eigenen Fassung „Neue Version hochladen“):

- das gebaute Deck aus `dist/` (HTML) und
- diesen ganzen Ordner als Zip (damit andere Trainer, denen du die Fassung freigibst, sie wiederum
  bearbeiten können).

## Im Chat (Claude-App oder claude.ai)

Claude Code liest diese Datei von selbst. Im Chat bittet der Trainer dich, sie zu lesen; dann gilt:

1. **Zuerst lesen:** diese Datei und `KURSREGELN.md` (falls vorhanden), dann `build.json`.
2. **Kannst du Code ausführen** (Dateien entpacken, Python starten)? Dann: Zip entpacken, Änderungen
   machen, mit `python engine/build.py .` bauen, das Deck auf Fehler prüfen und dem Trainer **zwei
   Dateien zum Herunterladen** geben: das Deck aus `dist/` und den ganzen Ordner als Zip, mit
   demselben obersten Ordner wie im erhaltenen Paket.
3. **Kannst du keinen Code ausführen**, sag das gleich zu Beginn. Ändere dann die Dateien, gib sie
   zurück und erkläre in einfachen Schritten, wie der Trainer am eigenen Rechner baut (Python 3
   installieren, im Ordner `python engine/build.py .` ausführen). Oft ist es einfacher, die
   Code-Ausführung in den Einstellungen der App einzuschalten (bezahltes Abo).
4. **Weiterarbeiten:** Jede neue Sitzung beginnt mit dem zuletzt zurückgegebenen Zip, nie mit dem
   alten Paket, sonst gehen Änderungen verloren.
5. Erkläre dem Trainer am Ende kurz, was du geändert hast, und erinnere ihn an das Hochladen im
   Kurs-Tool (siehe oben).

Ändert der Kursautor später sein Original, zeigt das Kurs-Tool einen Hinweis und bietet das neue
Quellpaket an. Dann kann Claude die Änderungen des Originals in diese Fassung übernehmen, ohne die
eigenen Änderungen zu verlieren: beide Pakete nebeneinander entpacken und vergleichen.
