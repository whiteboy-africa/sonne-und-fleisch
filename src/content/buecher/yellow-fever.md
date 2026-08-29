---
# Angelegt aus dem Druckbogen (Rückseite kopfüber, Rücken, Vorderseite).
# Klappentexte und Zitate stehen im Wortlaut der Manuskripte:
# „YELLOW FEVER Blocksatz.docx" (7.822 Woerter) und „Der Götveren
# Blocksatz.docx" (5.658 Woerter). Beide sind an den gedruckten
# Leseprobe-Seiten geprueft — der Satz von S. 37 steht in der zweiten Datei
# wortgleich, S. 30 bis auf ein eingefuegtes „Das" am Satzanfang.
titel: Yellow Fever
kurztitel: Yellow Fever
autor: C. T. Selters
klappentext: >-
  Ein österreichischer Schriftsteller fährt mit einem Reisestipendium nach
  Bangkok, um ein Buch zu beenden, und schreibt stattdessen dieses. Im
  Untertitel: A Single Man's Guide to Thailand, Laos and Despair.
klammer: >-
  Selters fährt nach Bangkok und kommt mit einem türkischen Schimpfwort zurück. Hinweg und Rückweg in einem Band.
zitat: >-
  Ich bin kein Tourist mehr, kein Reisender und schon lange kein
  Schriftsteller …
zitat_von: Kapitel IX
format: Broschur
verfuegbarkeit: In Vorbereitung
# Gesetzt in Times New Roman — so steht es in der Druckdatei.
leseprobe_schrift: "'Times New Roman', Times, serif"
seiten_zahl: 192
cover_bild: /buecher/yellow-fever/cover.webp
# Dieser Band behaelt seinen gedruckten Ruecken aus dem Bogen.
ruecken_bild: /buecher/yellow-fever/ruecken.webp
# Farben für Rücken, Kanten und Blockrand — aus dem Umschlag genommen.
cover_farbe: '#32352d'
akzent_farbe: '#b64c36'
schrift_farbe: '#ccbd99'
motiv: fracture
hoehe: 2.0
dicke: 0.078
# Das echte Format des Bandes: 5,06 x 7,81 Zoll (364 x 562 pt aus der
# Druckdatei), nicht A5. Danach richten sich der Band im Stapel und die
# aufgeschlagene Doppelseite.
breite_verhaeltnis: 0.648
reihenfolge: 1
# Die Leseprobe ist die echte gesetzte Seite aus der Druckdatei — mit den
# Schwaerzungen, die im Buch stehen. Seitenzahl ist die des Buches.
leseprobe:
  # Aus der Druckdatei „yf fkp / mysteriöse g" gerastert (Seiten 11–14),
  # mit scripts/magazin-rendern.swift und scripts/seite-schwaerzen.mjs.
  # Die alten Seiten 30–33 liegen weiter im Ordner; zum Zurückstellen
  # genügt es, hier die Nummern zu tauschen.
  seite: 11
  bild: /buecher/yellow-fever/leseprobe-s11.webp
  # Die Folgeseiten, ebenfalls echt — schon beim Ausspielen geschwaerzt.
  geschwaerzt:
    - /buecher/yellow-fever/leseprobe-s12-schwarz.webp
    - /buecher/yellow-fever/leseprobe-s13-schwarz.webp
    - /buecher/yellow-fever/leseprobe-s14-schwarz.webp
    - /buecher/yellow-fever/leseprobe-s15-schwarz.webp
  # Die Schlussseite, ebenfalls echt — mit ausgesparter Zone für den
  # Stempel (`--stanze 0.40 0.66` beim Ausspielen).
  schluss: /buecher/yellow-fever/leseprobe-s16-stanze.webp
# Wendeband: die zweite Vorderseite liegt im Druckbogen kopfüber links.
# Hier ist sie aufrecht abgelegt — das Regal dreht sie beim Drucken selbst.
rueckseite:
  titel: Götveren
  kurztitel: Götveren
  autor: C. T. Selters
  klappentext: >-
    Ein Wort, auf der Straße aufgeschnappt: götveren, türkisch, ein
    Schimpfwort für die Verstoßenen. Der Erzähler verliebt sich in seinen
    Klang und trägt ihn durch Wien, Havanna und den Lesesaal, bis er weiß,
    wozu er ihn braucht.
  zitat: Man müsste schreiben, sagte ich mir und begann zu schreiben.
  zitat_von: Letzter Satz
  cover_bild: /buecher/yellow-fever/rueckseite.webp
  # Die Wende sitzt im Druck bei Blatt 47; Buchseite 37 des Goetveren.
  leseprobe:
    seite: 37
    bild: /buecher/yellow-fever/leseprobe-goetveren-s37.webp
    geschwaerzt:
      - /buecher/yellow-fever/leseprobe-goetveren-s38-schwarz.webp
      - /buecher/yellow-fever/leseprobe-goetveren-s39-schwarz.webp
      - /buecher/yellow-fever/leseprobe-goetveren-s40-schwarz.webp
  cover_farbe: '#c9b98a'
  akzent_farbe: '#c8352a'
  schrift_farbe: '#22303c'
  motiv: boom
---

Platzhalter für die lange Beschreibung. Der Umschlag ist als Bogen angelegt:
links die Rückseite kopfüber, in der Mitte der Rücken, rechts die
Vorderseite — beim Wenden im Regal steht die zweite Geschichte richtig herum.
