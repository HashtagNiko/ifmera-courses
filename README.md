# ifmera-courses

Trainer-Oberfläche für die ifmera-Kurse, erreichbar unter `courses.shnoozy.top`
(GitHub Pages). Zugang nur nach Anmeldung. Das Dashboard zeigt alle Kurstage;
ein Klick öffnet das Deck im Vollbild, um sich durch die Slides zu klicken.

Login und Daten laufen über das bestehende Supabase-Projekt "shnoozy-App",
dasselbe, das auch `exams.shnoozy.top` (Prüfungstool, eigenes Repo) nutzt.

## Warum die Decks nicht in diesem Repo liegen

GitHub Pages liefert jede Datei eines öffentlichen Repos ohne Prüfung aus. Ein
Login vor der Oberfläche würde die Decks also nicht schützen: wer die Datei-URL
kennt, lädt sie direkt herunter. Dazu kommt die Größe, die gebauten Decks des
WEG-Kurses sind zusammen rund 170 MB.

Deshalb die Aufteilung:

| | wo | Zugriff |
|---|---|---|
| App (dieses Repo) | GitHub Pages | öffentlich, aber ohne Inhalte |
| Decks | privater Supabase-Bucket `decks` | nur nach Login und Freigabe |
| Quelldateien, Anlagen, Engine | lokal in OneDrive | bleiben lokal |

Die `.gitignore` hält Kursmaterial bewusst draußen.

## Zugriff beschränken

Im Supabase-Projekt haben auch andere Trainer Konten (Prüfungstool). Eine
Anmeldung allein reicht hier deshalb nicht: durchgelassen wird nur, wer in
`public.kurs_zugriff` steht. Die RLS-Policies auf `kurse`, `kurstage` und dem
Storage-Bucket setzen dieselbe Regel serverseitig durch, die Prüfung in der App
ist nur die Bequemlichkeit.

## Einrichten

1. `npm install`
2. `.env.example` nach `.env` kopieren und ausfüllen (URL und Anon-Key aus dem
   Supabase-Projekt, die eigene Konto-Adresse für den Deck-Sync und `KURS_WURZEL`,
   den Ordner, unter dem die Kursordner liegen).
3. Migration `supabase/migrations/20260818120000_kurs_tool_init.sql` im
   Supabase-SQL-Editor einspielen.
4. `npm run sync:decks -- --dry` zeigt, welche Decks hochgeladen würden.
5. `npm run sync:decks` lädt sie hoch.
6. `npm run dev` startet die App lokal.

Für das Deployment braucht das Repo unter Settings, Secrets and variables,
Actions, Variables die Einträge `VITE_SUPABASE_URL` und
`VITE_SUPABASE_ANON_KEY`.

## Mehrere Kurse

Welche Kurse es gibt, steht in `kurse.config.json`:

```json
[
  { "slug": "weg", "name": "WEG-Kurs", "ordner": "10_WEG-Kurs" },
  { "slug": "hg",  "name": "H&G-Kurs", "ordner": "50_H&G-Kurs" }
]
```

`ordner` ist der Name unterhalb von `KURS_WURZEL`; absolute Pfade stehen
bewusst nicht im Repo. Ein neuer Kurs ist damit eine Zeile Konfiguration.
Angelegt wird ein Kurs in der Datenbank erst, wenn im zugehörigen Ordner auch
gebaute Decks liegen; so erscheint im Dashboard kein leerer Reiter.

Im Bucket liegt jeder Kurs unter seinem Kürzel, also `weg/trainer/…`.

## Decks aktuell halten

Gearbeitet wird weiter in den lokalen Kursordnern. Nach dem Bauen der Decks:

```
npm run sync:decks              # alle Kurse
npm run sync:decks -- --kurs hg # nur einer
npm run sync:decks -- --dry     # nur zeigen, was passieren würde
```

Beim ersten Lauf fragt das Skript einmal nach dem Supabase-Passwort und legt
danach nur das erneuerbare Token in `.sync-session.json` ab; spätere Läufe
fragen nicht mehr. Ein service_role-Key kommt bewusst nicht zum Einsatz: der
würde sämtliche Sicherheitsregeln des Projekts umgehen, also auch die der
Prüfungsdaten. Der Upload läuft unter der eigenen Anmeldung, erlaubt durch die
RLS-Policies für Konten in `kurs_zugriff`.

Das Skript vergleicht jede Trainer-Fassung per sha256 mit dem Stand im Bucket
und lädt nur Geändertes hoch. Danach ist die neue Fassung sofort im Tool
sichtbar.

Die Teilnehmerunterlagen laufen bewusst nicht über dieses Tool, sondern weiter
über Google Drive. Grund ist das Datenvolumen: der Free-Plan von Supabase deckt
5 GB zwischengespeicherten plus 5 GB direkten Verkehr im Monat ab, und ein
Kursdurchlauf mit 20 Teilnehmern über 15 Tage liegt bei rund 1,2 GB allein für
das Austeilen. Das Kontingent gilt für die ganze Organisation, ein Ansturm
könnte also auch das Prüfungstool ausbremsen.

## Offen

- UI des Trainer-Cockpits: Aufbau steht noch nicht fest
- Kursinhalte aus "Themenübersicht Trainertagebuch - WEG-Kurs.docx" tageweise
  im Tool hinterlegen
- H&G-Kurs: sobald die Engine dort Decks gebaut hat, holt der Sync sie ohne
  weiteres Zutun
