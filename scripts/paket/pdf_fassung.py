# -*- coding: utf-8 -*-
"""
pdf_fassung.py — Teilnehmerfassung und PDF zu einem gebauten Deck im Quellpaket (Baustein 9).

    python engine/pdf_fassung.py .          # im entpackten Paketordner, nach engine/build.py

Nimmt das gebaute Deck aus dist/, macht daraus mit engine/teilnehmer.py die Teilnehmerfassung
(dist/teilnehmer/) und mit engine/pdf.py das PDF (dist/teilnehmer/pdf/). Beides sind die Programme des
Kursautors, unverändert; dieses Skript ruft sie nur für den Aufbau eines Quellpakets auf.

Einmalig nötig (für das PDF):
    pip install playwright pymupdf
    python -m playwright install chromium

Die Teilnehmerfassung gibt es auch ohne dieses Skript: im Kurs-Tool bei der Fassung „Teilnehmer
herunterladen“.
"""
import glob
import io
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HIER)


def main():
    paket = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
    decks = sorted(glob.glob(os.path.join(paket, "dist", "*.html")))
    if not decks:
        sys.exit("Kein gebautes Deck in dist/ – erst `python engine/build.py .` ausführen.")

    import teilnehmer  # engine/teilnehmer.py des Kursautors

    ziel_tn = os.path.join(paket, "dist", "teilnehmer")
    os.makedirs(ziel_tn, exist_ok=True)
    fassungen = []
    for deck in decks:
        roh = io.open(deck, encoding="utf-8").read()
        neu, _ = teilnehmer.umbauen(roh)
        offen = teilnehmer.pruefen(neu)
        if offen:
            sys.exit("ABBRUCH – Teilnehmerfassung unvollständig (%s): %s" % (os.path.basename(deck), " | ".join(offen)))
        ziel = os.path.join(ziel_tn, os.path.basename(deck))
        io.open(ziel, "w", encoding="utf-8").write(neu)
        fassungen.append(ziel)
        print("Teilnehmerfassung: %s" % os.path.relpath(ziel, paket))

    try:
        from playwright.sync_api import sync_playwright
        import fitz  # noqa: F401  (PyMuPDF, wird von pdf.py gebraucht)
    except ImportError:
        sys.exit("Für das PDF fehlen Programme: pip install playwright pymupdf "
                 "und python -m playwright install chromium")

    import pdf  # engine/pdf.py des Kursautors

    ziel_pdf = os.path.join(ziel_tn, "pdf")
    os.makedirs(ziel_pdf, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for quelle in fassungen:
            ziel = os.path.join(ziel_pdf, os.path.basename(quelle).replace(".html", ".pdf"))
            seite = browser.new_page(viewport={"width": pdf.BREITE, "height": pdf.HOEHE}, device_scale_factor=1)
            folien, seiten = pdf.deck_zu_pdf(seite, quelle, ziel)
            seite.close()
            print("PDF: %s (%d Folien, %d Seiten)" % (os.path.relpath(ziel, paket), folien, seiten))
        browser.close()


if __name__ == "__main__":
    main()
