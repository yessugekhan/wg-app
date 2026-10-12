# WG-App

Einkaufsliste, Geld, Putzplan und Pinnwand für eine WG. Läuft im Browser, lässt sich auf dem Handy wie eine App auf den Startbildschirm legen und braucht keine Accounts: Wer den Einladungslink hat, ist dabei.

## Was sie kann

- **Liste**: Was fehlt, wer es holt, was gerade jemand im Korb hat (live). Haushaltszeug wie Klopapier oder Spülmittel wird automatisch als „Kasse“ markiert.
- **Einkauf abschließen**: Betrag vom Bon eintippen, fertig. Kassen-Sachen gehen von der WG-Kasse ab, der Rest wird auf alle (oder ausgewählte Leute) aufgeteilt.
- **Geld**: Wer wem wie viel schuldet, mit möglichst wenigen Überweisungen ausgeglichen. WG-Kasse mit Monatsbeiträgen, Kassenstand korrigieren, jede Buchung bearbeitbar.
- **Putzen**: Rotierender Putzplan (wöchentlich, alle 2 oder 4 Wochen), Tauschen für eine Woche, Nachtragen, Statistik der letzten 8 Wochen.
- **Pinnwand**: Nachrichten an alle, anheften, „gesehen“-Markierung.
- Offline nutzbar: Änderungen werden synchronisiert, sobald wieder Netz da ist.

## Technik

- Statische Seite (Preact, esbuild) in `docs/`, gehostet über GitHub Pages.
- Daten in Firebase Firestore (kostenloser Spark-Tarif reicht), alles unter `wgs/<WG-Code>/…`.
- Salden werden bei jeder Buchung atomar mitgeführt (`meta/summary`), damit die App nicht jedes Mal alle Buchungen lesen muss. „Salden neu berechnen“ in den Einstellungen baut sie aus allen Buchungen neu auf.
- Schrift: Atkinson Hyperlegible Next, selbst gehostet (kein Google-Fonts-Abruf).

## Einrichten

1. Firebase-Projekt anlegen, Firestore-Datenbank erstellen (Standort `europe-west3`, Produktionsmodus).
2. Regeln aus `firestore.rules.template` einfügen und `DEIN-WG-CODE` durch einen langen Zufallscode ersetzen.
3. Web-App im Firebase-Projekt registrieren und die Konfiguration in `public/config.js` eintragen.
4. `npm install && npm run build`, dann GitHub Pages auf den Ordner `docs/` im Branch `main` stellen.
5. Einladungslink: `https://<name>.github.io/<repo>/#wg=<WG-Code>`. Der Erste richtet die WG ein, alle anderen wählen ihren Namen.

Ohne Firebase-Konfiguration läuft die App im Demo-Modus und speichert nur auf dem jeweiligen Gerät.

## Entwickeln

```sh
npm install
npm test          # Logik, Datenebene, Schreibsemantik
npm run build     # docs/ für GitHub Pages und dist/preview.html
npm run e2e       # Klickt alles im Handy-Format in Chromium durch
npm run check:firestore   # echte Firestore-SDK-Aufrufe gegen den lokalen Cache
```
