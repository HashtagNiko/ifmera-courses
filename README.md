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
   Supabase-Projekt, Service-Role-Key nur lokal für den Deck-Sync).
3. Migration `supabase/migrations/20260818120000_kurs_tool_init.sql` im
   Supabase-SQL-Editor einspielen.
4. `npm run sync:decks -- --dry` zeigt, welche Decks hochgeladen würden.
5. `npm run sync:decks` lädt sie hoch.
6. `npm run dev` startet die App lokal.

Für das Deployment braucht das Repo unter Settings, Secrets and variables,
Actions, Variables die Einträge `VITE_SUPABASE_URL` und
`VITE_SUPABASE_ANON_KEY`.

## Decks aktuell halten

Gearbeitet wird weiter im lokalen Kursordner (`DECK_QUELLE` in der `.env`).
Nach dem Bauen der Decks:

```
npm run sync:decks
```

Das Skript vergleicht jede Trainer-Fassung per sha256 mit dem Stand im Bucket
und lädt nur Geändertes hoch. Danach ist die neue Fassung sofort im Tool
sichtbar. Die Teilnehmerfassungen bleiben vorerst außen vor; die Bucket-Struktur
(`weg/trainer/…`) lässt Platz dafür.

## Offen

- Domain `courses.shnoozy.top` bei GoDaddy anlegen und `public/CNAME` ergänzen
- UI des Trainer-Cockpits: Aufbau steht noch nicht fest, wird nach dem ersten
  sichtbaren Deck besprochen
- Kursinhalte aus "Themenübersicht Trainertagebuch - WEG-Kurs.docx" tageweise
  im Tool hinterlegen
