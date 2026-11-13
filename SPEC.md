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
| Fassung | eigenes Deck eines Trainers zu einem Kurstag eines fremden Kurses. Vermerkt, auf welchem Stand des Originals sie beruht |
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
- `kurstage` bekommt dafür Pfade und Prüfsummen.
- Je Kurstag drei Knöpfe: Trainer-HTML, Teilnehmer-HTML, PDF.
- **Annahme:** Dateiname wie in „2. Slides“ (Liefername), sonst `Tag<n>`.
- Die Trainer-HTML enthält ab Baustein 3 die eigenen Notizen dessen, der sie herunterlädt.
- **Annahme:** Öffnet oder lädt ein Trainer ein fremdes Deck, ersetzt die App in der Fußzeile
  „Herr Krnic“ durch seinen Anzeigenamen, nur in seiner Kopie (OFFENE-FRAGEN Nr. 3).
- Heruntergeladene HTML-Dateien bekommen eine unsichtbare Markierung mit Trainer und Datum, falls Niko
  zustimmt (OFFENE-FRAGEN Nr. 7).

**Laien-Test:** Als Test-Trainer alle drei Dateien eines Tages herunterladen und öffnen. Die
Teilnehmerfassung hat kein Cockpit und keine Notizen.

### Baustein 3 – Eigene Notizen

- **Feste Folien-IDs:** Jede Folie in den Quellen bekommt einmalig ein `data-id` (gelb: ändert die
  Kursordner, mit Sicherung). Der Build prüft, dass keine ID doppelt vorkommt (gelb: ändert die
  Build-Skripte). Gilt für alle Kurse, voll und kompakt. Ohne feste IDs würden Notizen beim Einfügen
  einer Folie verrutschen.
- `kt_folien_notizen`: Trainer, Kurstag, Folien-ID, Notiz, Aktion, geändert am. Lesen und schreiben
  nur der Besitzer; Länge begrenzt.
- Seite „Notizen“ je Kurstag: Folienliste aus dem Deck. Links das Original (nur lesen; „übernehmen“
  kopiert es als Vorlage), rechts die eigene Notiz. Speichert automatisch.
- **Annahme – Mini-Formatierung:** **fett**, *kursiv*, Aufzählung mit „-“, Zeilenumbruch. Sonst nichts.
- Cockpit: zeigt die eigene Notiz statt des Originals, wenn es eine gibt; Schalter „Original anzeigen“.
  Die Formatierung wird sicher dargestellt (erst alles maskieren, dann nur die vier Formate umsetzen).
  Umgesetzt in der Kopie im Browser; die Engines bleiben unverändert.
- Verwaiste Notizen (die Folie gibt es nicht mehr) stehen gesammelt unten und gehen nicht verloren.
- **Annahme:** Niko kann die Notiz-Ebene auch für seine eigenen Decks nutzen.
- **Baustein 3b** (danach): Bearbeiten direkt im Cockpit; gespeichert wird über das App-Fenster.

**Laien-Test:** Als Test-Trainer zu drei Folien Notizen schreiben, eine davon mit Fettschrift. Deck
öffnen, Cockpit öffnen: die eigenen Notizen erscheinen, fett ist fett. Als Niko dasselbe Deck öffnen:
Nikos Notizen stehen unverändert da.

### Baustein 4 – Eigene Fassungen mit Claude

- Der Sync baut je Kurstag ein **Quellpaket** (Zip): Folienquellen des Tages, die Bilder dazu, Engine,
  Build-Skript, Bauplan nur für diesen Tag und eine Anleitung `CLAUDE.md` für den Co-Trainer. Die
  Vorlage dieser Anleitung liegt bei den Kursquellen, nicht in diesem öffentlichen Repo. Ablage in
  `<kürzel>/quellen/`, lesbar ab Stufe `fassung`.
- `kt_deck_fassungen`: Trainer, Kurstag, Pfad, Prüfsumme, Stand des Originals (`basis_hash`),
  hochgeladen am, Bemerkung. Ablage im Bucket unter `fassungen/<trainer-id>/…`; schreiben darf nur
  der Trainer selbst.
- App, je Kurstag „Eigene Fassung“: Quellpaket laden; fertiges Deck hochladen (nur HTML mit Folien,
  Größengrenze); Fassung öffnen, herunterladen, löschen. Hinweis, wenn das Original neuer ist als die
  Grundlage der Fassung, mit Link zum neuen Quellpaket.
- Der Co-Trainer arbeitet lokal mit Claude Code (eigenes Claude-Abo). Für den Build braucht er Python.
- **Annahme:** Eine Fassung sieht nur ihr Besitzer; andere nur über einen gemeinsamen Durchlauf (Baustein 5).

**Laien-Test:** Als Test-Trainer ein Quellpaket laden, eine Folienüberschrift ändern, bauen, hochladen,
öffnen. Danach als Niko: das Original ist unverändert.

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
