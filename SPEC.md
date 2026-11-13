# SPEC.md — Mehrere Trainer im Kurs-Tool

> Fachlicher Umfang. Was hier nicht steht, baut Claude nicht ungefragt. Änderungen nur mit Nikos
> Zustimmung. Stellen mit **Annahme** hat Claude vorentschieden; Niko kann sie jederzeit ändern.

---

## 1. Ziel

Niko gibt einem Co-Trainer Zugang zum Kurs-Tool. Der Co-Trainer

- sieht die Kurse, die Niko für ihn freigibt, öffnet die Decks mit Cockpit und lädt Trainer-HTML,
  Teilnehmer-HTML und PDF herunter,
- schreibt zu jeder Folie eigene Notizen, die im Cockpit erscheinen,
- baut mit Claude eigene Fassungen einzelner Tage und lädt sie hoch,
- hält mit Niko gemeinsame Durchläufe, in denen jeder an seinen Tagen seine Inhalte nutzt.

Weitere Trainer können später dazukommen. Nichts wird auf genau zwei Personen zugeschnitten.

---

## 2. Grundsätze

1. Jeder Inhalt hat genau einen Besitzer. Ändern und löschen darf nur er.
2. Teilen gibt Leserechte, nie Schreibrechte auf fremde Inhalte.
3. Die Datenbank setzt das durch (Regeln für Tabellen und Bucket). Die App zeigt nur an.
4. Nikos Dateien in den Kursordnern und im Bucket ändern sich durch die Arbeit des Co-Trainers nie.
   Notizen und Fassungen des Co-Trainers liegen getrennt daneben.
5. Quelle der Decks bleiben die lokalen Kursordner; der Sync lädt hoch.

---

## 3. Begriffe

| Begriff | Bedeutung |
|---|---|
| Besitzer | Trainer, dem ein Kurs, eine Notiz, eine Fassung oder ein Durchlauf gehört |
| Admin | Niko (Rolle `admin`): schaltet Trainer im Kurs-Tool frei |
| Co-Trainer | weiterer Trainer mit eigenem Konto (Rolle `trainer`) |
| Freigabe | Besitzer gibt einen Kurs an einen Trainer, mit einer Stufe |
| Stufe `nutzen` | Decks öffnen und herunterladen, Tagebuch lesen |
| Stufe `notizen` | wie `nutzen`, dazu eigene Folien-Notizen |
| Stufe `fassung` | wie `notizen`, dazu Quellpakete laden und eigene Fassungen hochladen |
| Fassung | eigene, bearbeitete Kopie eines Trainers zu einem Kurstag: Deck plus Quellpaket. Grundlage ist ein Original-Deck oder die Fassung eines anderen Trainers; vermerkt wird, auf welchem Stand der Grundlage sie beruht |
| Gemeinsamer Durchlauf | Durchlauf mit mehreren Trainern und Tagesplan: wer hält welchen Tag, mit welcher Fassung |

---

## 4. Bausteine

### Baustein 0 – Projektdateien und Zugang

- `CLAUDE.md`, `SPEC.md`, `OFFENE-FRAGEN.md`, `CHANGELOG.md`
- Datenbankzugang für Claude (OFFENE-FRAGEN Nr. 1) und Hilfsskript `scripts/sql.mjs`: führt eine
  SQL-Datei über die Management API aus, liest den Schlüssel aus der Umgebungsvariable und gibt ihn nie aus.
- Bestandsaufnahme (lesend): Stimmen Tabellen, Regeln und Bucket in der Datenbank mit den Migrationen im Repo überein?

### Baustein 1 – Besitz und Rechte

**Datenbank**
- `kt_trainer`: Konto, Anzeigename (z. B. „Herr Krnic“, für die Fußzeile), Rolle `admin` oder `trainer`,
  aktiv ja/nein. Übernimmt die Einträge aus `kurs_zugriff` (Niko → `admin`); `kurs_zugriff` entfällt danach.
- `kurse.besitzer_id` (Standard: der angemeldete Trainer); bestehende Kurse gehören Niko.
- `durchlaeufe.besitzer_id`; bestehende Durchläufe gehören Niko.
- `kt_kurs_freigaben`: Kurs, Trainer, Stufe. Anlegen, ändern und löschen darf nur der Besitzer des Kurses.
- Hilfsfunktionen (`SECURITY DEFINER`, fester `search_path`): ist Trainer, ist Admin, ist Besitzer
  eines Kurses, Stufe für einen Kurs.
- Neue Regeln:

  | Objekt | lesen | anlegen, ändern, löschen |
  |---|---|---|
  | `kurse`, `kurstage` | Besitzer; Freigabe ab `nutzen` | Besitzer |
  | `durchlaeufe`, `fortschritt` | Besitzer (ab Baustein 5 auch Mitwirkende) | Besitzer (Haken ab Baustein 5 auch Mitwirkende) |
  | Bucket `decks`, Ordner `<kurs-kürzel>/…` | Besitzer; Freigabe ab `nutzen`, Unterordner `quellen/` erst ab `fassung` | Besitzer |
  | `kt_trainer` | eigene Zeile; Anzeigenamen aller aktiven Trainer (für die Auswahl bei Freigaben) | Admin |

- Kurs-Kürzel bleiben im ganzen Projekt eindeutig. Der Besitzer eines Bucket-Ordners ergibt sich aus
  dem Kurs mit diesem Kürzel; der Bucket muss deshalb nicht umgeräumt werden.
- Löschen regeln die neuen Regeln gleich mit: Die Migration `20260912100000_loeschrechte.sql` wurde nie
  in die Datenbank eingespielt (Bestandsaufnahme 13.11.2026) und geht in den neuen Regeln auf.
- `anon` verliert alle Rechte auf die Tabellen des Kurs-Tools; `authenticated` behält nur, was die App
  braucht (kein `truncate`, `references`, `trigger`).
- Dateien im Bucket, deren erster Ordner zu keinem Kurs gehört (die zwei alten Testdateien unter
  `test/…`, später Reste gelöschter Kurse), darf der Admin lesen und löschen; sonst kämen sie nie wieder
  weg. Die zwei Testdateien entfernt Claude nach Schritt C über die Storage-API (gelb).
- `kt_migrationen` hält fest, welche Migrationen des Kurs-Tools eingespielt sind.
- Reihenfolge: hinzufügen (grün) → App live → alte Regeln ersetzen (gelb) → Rechte-Tests auf der
  echten Datenbank in einer zurückgerollten Transaktion.

**App**
- Der Zugang prüft `kt_trainer` statt `kurs_zugriff`.
- Die Kopfzeile zeigt, wer angemeldet ist.
- Seite „Freigaben“ für Besitzer: je Kurs Trainer hinzufügen, Stufe wählen, Freigabe entfernen.
- Fremde Kurse tragen den Hinweis „von <Anzeigename>“.
- Durchläufe: jeder sieht nur seine eigenen (bis Baustein 5).

**Konto des Co-Trainers** (erst nach den neuen Regeln): Eintrag in `eingeladene_trainer` (gelb) →
Einladung im Supabase-Dashboard (rot, Klick-Anleitung) → Eintrag in `kt_trainer` (gelb) → Freigabe
durch Niko in der App.

**Laien-Test:** Niko sieht alles wie vorher. Mit dem Test-Konto sieht man nur freigegebene Kurse und
kann nichts ändern. Ohne Freigabe sieht es gar keinen Kurs.

### Baustein 2 – Herunterladen

- Der Sync lädt zusätzlich je Tag die Teilnehmerfassung (HTML) und das PDF hoch, in
  `<kürzel>/teilnehmer/` und `<kürzel>/pdf/`. Nur Geändertes, erkannt an der Prüfsumme, wie bei den Trainer-Decks.
- **Nur Ausgegebenes:** Teilnehmerfassung und PDF gelten als ausgegeben, wenn dieselbe Datei im
  Lieferordner „2. Slides“ liegt (`lieferung` in `kurse.config.json`); Ordner mit „_“ vorn zählen nicht.
  Nicht Ausgegebenes bekommt keinen Knopf. H&G kompakt nutzt den Lieferordner des H&G-Kurses
  (OFFENE-FRAGEN Nr. 16).
- `kurstage` bekommt dafür Liefername, Pfade und Prüfsummen.
- Je Kurstag bis zu drei Knöpfe: Trainer, Teilnehmer, PDF.
- **Annahme:** Dateiname wie in „2. Slides“ (Liefername), sonst `Tag <n>`; die Trainerfassung bekommt
  den Zusatz „(Trainerfassung)“, weil sie dort denselben Namen trägt wie die Teilnehmerfassung.
- Die Trainer-HTML enthält ab Baustein 3 die eigenen Notizen dessen, der sie herunterlädt.
- **Annahme:** Öffnet oder lädt ein Trainer ein fremdes Deck, ersetzt die App in der Fußzeile
  „Herr Krnic“ durch seinen Anzeigenamen, nur in seiner Kopie (OFFENE-FRAGEN Nr. 3).
- Heruntergeladene HTML-Dateien bekommen eine unsichtbare Markierung mit Trainer und Datum, falls Niko
  zustimmt (OFFENE-FRAGEN Nr. 7).

**Laien-Test:** Als Test-Trainer alle drei Dateien eines Tages herunterladen und öffnen. Die
Teilnehmerfassung hat kein Cockpit und keine Notizen.

### Baustein 3 – Eigene Notizen

- **Welche Folie gemeint ist – Annahme (13.11.2026, Claude; Niko war nicht erreichbar):** Keine IDs in
  die Quellen. Der Schlüssel einer Folie ist ihr `data-id`, falls sie eines hat, sonst ihr Titel mit
  laufender Nummer bei gleichen Titeln. Damit bleiben die Kursordner unberührt (kein Neubau, keine neue
  Auslieferung), und eine eingefügte Folie verschiebt keine Notiz. Ändert sich ein Titel, erscheint die
  Notiz unter „Notizen ohne Folie“ und geht nicht verloren. Feste IDs bleiben möglich (gelb,
  OFFENE-FRAGEN Nr. 19).
- `kt_folien_notizen`: Trainer, Kurstag, Folien-ID, Notiz, Aktion, geändert am. Lesen und schreiben
  nur der Besitzer; Länge begrenzt.
- Seite „Notizen“ je Kurstag: Folienliste aus dem Deck. Links das Original (nur lesen; „übernehmen“
  kopiert es als Vorlage), rechts die eigene Notiz. Speichert automatisch.
- **Annahme – Mini-Formatierung:** **fett**, *kursiv*, Aufzählung mit „-“, Zeilenumbruch. Sonst nichts.
- Cockpit: zeigt die eigene Notiz statt des Originals, wenn es eine gibt; Schalter „Original-Notizen
  zeigen“. Die Formatierung wird sicher dargestellt (erst alles maskieren, dann nur die vier Formate
  umsetzen). Umgesetzt in der Kopie im Browser; die Engines bleiben unverändert. Die Engine bricht in
  `syncCockpit` an der fehlenden Uhr `#tmr` ab (OFFENE-FRAGEN Nr. 18); das Skript setzt die eigene Notiz
  trotzdem ein und gibt den Fehler unverändert weiter.
- Die heruntergeladene Trainerfassung enthält die eigenen Notizen; das Cockpit zeigt sie auch offline.
- Verwaiste Notizen (die Folie gibt es nicht mehr) stehen gesammelt unten und gehen nicht verloren.
- **Annahme:** Niko kann die Notiz-Ebene auch für seine eigenen Decks nutzen.
- **Baustein 3b** (danach): Bearbeiten direkt im Cockpit; gespeichert wird über das App-Fenster.

**Laien-Test:** Als Test-Trainer zu drei Folien Notizen schreiben, eine davon mit Fettschrift. Deck
öffnen, Cockpit öffnen: die eigenen Notizen erscheinen, fett ist fett. Als Niko dasselbe Deck öffnen:
Nikos Notizen stehen unverändert da.

### Baustein 4 – Eigene Fassungen mit Claude, in beide Richtungen

Kopien gehen in beide Richtungen (Nikos Entscheidung, 13.11.2026): Der Co-Trainer bearbeitet eine
Kopie von Nikos Inhalten, und Niko bearbeitet eine Kopie der Inhalte des Co-Trainers. Jeder ändert
dabei nur seine eigene Kopie.

- Der Sync baut je Kurstag ein **Quellpaket** (Zip): Folienquellen des Tages, die Bilder dazu, Engine,
  Build-Skript, Bauplan nur für diesen Tag und eine Anleitung `CLAUDE.md` für den, der damit arbeitet.
  Die Vorlage dieser Anleitung liegt bei den Kursquellen, nicht in diesem öffentlichen Repo. Ablage in
  `<kürzel>/quellen/`, lesbar ab Stufe `fassung`.
- Eine **Fassung** besteht aus dem gebauten Deck **und** ihrem Quellpaket. Nur so kann ein anderer
  Trainer sie wiederum kopieren und weiterbearbeiten.
- `kt_deck_fassungen`: Besitzer, Kurstag, Grundlage (Original oder andere Fassung), Stand der Grundlage
  (`grundlage_hash`), Titel, Bemerkung, Pfade und Prüfsummen von Deck und Quellpaket. Ablage in einem
  **eigenen Bucket `fassungen`** unter `<besitzer-id>/<fassung-id>/deck.html|quellen.zip`; schreiben darf
  nur der Besitzer, und nur zu einer eigenen Fassung. Eigener Bucket statt eines Ordners in `decks`, weil
  dort die Admin-Regel für verwaiste Dateien gilt: Fassungen eines Trainers soll auch der Admin nicht sehen.
- **Annahmen (13.11.2026, Claude; Niko war unterwegs):** Fassungen sieht man nur, solange man den Kurs selbst
  sehen darf (nimmt der Kursbesitzer die Freigabe zurück, verschwinden auch die eigenen Fassungen dieses
  Kurses aus dem Tool, sie beruhen auf seinen Inhalten). Freigeben darf man eine Fassung nur an Trainer, die
  den Kurs selbst sehen dürfen. Der Hinweis „Grundlage wurde geändert“ verschwindet, wenn der Besitzer der
  Fassung „Ist erledigt“ klickt.
- Quellpakete gibt es schon für alle Tage (Teil 1, seit 13.11.2026), Knopf „Quellen“ ab Stufe `fassung`.
- Seite „Fassungen“ je Kurstag (`/fassungen/:tagId`, Link „⧉ Fassungen“ in der Kachel).
- `kt_fassung_freigaben`: Fassung, Trainer, Stufe (`nutzen` = ansehen und herunterladen, `fassung` =
  zusätzlich das Quellpaket laden und eine eigene Kopie anlegen). Freigeben darf nur der Besitzer der Fassung.
- App, je Kurstag „Eigene Fassung“: Quellpaket der Grundlage laden; fertiges Deck und Quellpaket
  hochladen (Deck nur HTML mit Folien, Größengrenze); Fassung öffnen, herunterladen, freigeben,
  löschen. Hinweis, wenn die Grundlage neuer ist als der Stand, auf dem die Fassung beruht, mit Link
  zum neuen Quellpaket.
- Niko kann eine Fassung des Co-Trainers auch in seine eigenen Kursquellen übernehmen: Quellpaket
  laden, mit Claude in den Kursordner einarbeiten, wie gewohnt bauen und syncen. Sein Original ändert
  sich dann, weil er es selbst ändert, nicht der Co-Trainer.
- Jeder arbeitet lokal mit Claude Code (eigenes Claude-Abo). Für den Build braucht man Python.
- **Annahme:** Ohne Freigabe sieht eine Fassung nur ihr Besitzer; dazu kommt der gemeinsame Durchlauf
  (Baustein 5).
- Eigene ganze Kurse des Co-Trainers lässt das Datenmodell schon zu (Besitz und Freigabe gelten für
  jeden Trainer gleich). Wie er sie hochlädt, wird geklärt, wenn er welche hat.

**Laien-Test:** Als Test-Trainer ein Quellpaket von Nikos Tag laden, eine Folienüberschrift ändern,
bauen, hochladen, für Niko freigeben. Als Niko: das Original ist unverändert, die Fassung des
Test-Trainers ist sichtbar, und Niko kann ihr Quellpaket laden und eine eigene Kopie anlegen.

### Baustein 5 – Gemeinsamer Durchlauf

- `kt_durchlauf_trainer`: Durchlauf, Trainer.
- `kt_durchlauf_tage`: Durchlauf, Kurstag, Trainer, Fassung (leer = Original).
- `fortschritt` merkt sich, wer zuletzt geändert hat.
- Alle Trainer eines Durchlaufs sehen Plan, Tagebuch und Haken, dürfen Haken setzen und sehen die im
  Plan eingetragenen Fassungen (nur lesen). Plan und Trainerliste ändert der Besitzer des Durchlaufs.
- Voraussetzung: Der Kurs ist für jeden Mitwirkenden mindestens auf `nutzen` freigegeben.
- **Annahme:** Notizen bleiben privat, auch im gemeinsamen Durchlauf.

**Laien-Test:** Niko legt einen Durchlauf an, nimmt den Test-Trainer auf und teilt ihm zwei Tage zu.
Der Test-Trainer sieht den Durchlauf, öffnet an seinen Tagen seine Fassung und setzt einen Haken.
Niko sieht den Haken.

---

## 5. Nicht im Umfang

- Claude direkt im Tool (über die API)
- Zugang für Teilnehmer; Teilnehmerunterlagen laufen weiter über Google Drive
- Gemeinsames Git-Repo für Kursinhalte
- Bearbeiten fremder Decks oder fremder Notizen
- Abrechnung, Statistiken

---

## 6. Rahmen

- **Speicher:** Supabase Free-Plan, 1 GB Dateispeicher für das ganze Projekt (mit Prüfungstool).
  Trainer-Decks heute rund 100 MB; mit Teilnehmerfassung und PDF rund 290 MB, dazu Quellpakete und
  Fassungen. Claude nennt den Stand nach jedem Baustein, der Dateien hochlädt.
- **Kosten:** keine neuen Dienste.
