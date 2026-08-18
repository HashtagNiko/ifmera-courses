-- Die Deck-Titel tragen den Segmentnamen mit, z. B.
-- "ifmera · Rechtliche Grundlagen · Tag 3 von 6 — Die Eigentuemerversammlung".
-- Den Namen halten wir fest, damit das Dashboard "Rechtliche Grundlagen"
-- ueberschreiben kann statt "Segment 2".
alter table public.kurstage add column if not exists segment_titel text;
