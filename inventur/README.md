# HolzOptiX Inventur-Helfer 1.0

Zwei einfache Zählhilfen für die Papierinventur in einer Holzhandlung.
Keine Warenwirtschaftsanbindung, kein Login, keine externen Bibliotheken.

## Funktionen

- **Paketrechner:** Beliebig viele Gruppen „Pakete × Stück pro Paket“ und lose Stücke.
- **Stapelzähler:** Beliebig viele gleichmäßige Teilblöcke „Bretter pro Lage × Lagen“ sowie einzelne, unregelmäßige Reihen und lose Bretter.
- **Ergebnisliste (Variante 2):** Mehrere Artikel nacheinander zählen, speichern, ändern und einzeln entfernen.
- **Automatisches Zwischenspeichern:** Aktuelle Eingabe und Ergebnisliste bleiben lokal im jeweiligen Browser erhalten.
- **Export:** CSV für Excel, übersichtliche Druckansicht/PDF über Browser-Drucken, JSON-Sicherung mit Import.
- **Optional:** Einheitslänge und -breite je Artikel für lfm und m². Nur nutzen, wenn alle gezählten Stücke identische Maße haben.
- **Handy:** Große Eingaben, numerische Tastatur, responsive Oberfläche. Nach dem ersten Laden auf HTTPS auch offline über den installierten Service Worker.

## Auf dem Computer ausprobieren

Den Ordner entpacken und `index.html` im Browser öffnen. Dafür ist keine Installation nötig. Eine stabile Browser-Datenspeicherung und Offline-App-Nutzung sind bei direktem Öffnen als Datei jedoch browserabhängig.

## Für Smartphone und Tablet bereitstellen

Den kompletten Ordner `inventur` auf den vorhandenen Webserver oder in das bestehende GitHub-Pages-Repository hochladen. Die Webseite liegt anschließend unter dem bisherigen Basislink plus `/inventur/`; die bisherige Startseite bleibt unverändert.

Beispiel bei Verwendung des bestehenden GitHub-Pages-Repositories:

`https://test-low.github.io/Holz-Rechner/inventur/`

Den Link einmal im Browser mit Internet öffnen; danach kann die App bei erfolgreicher Cache-Einrichtung ohne Netz genutzt werden. Für das Zurückholen und Synchronisieren der Daten gibt es **keinen automatischen Abgleich zwischen Geräten**.

**Wichtig:** Browserdaten können gelöscht werden. Deshalb regelmäßig unter „Ergebnisliste → Sicherung speichern“ eine JSON-Datei herunterladen. Die JSON-Sicherung lässt sich in eine andere Installation importieren. Die CSV dient zur Übertragung auf eure Papier- oder Excel-Liste.

## Umfang

Dies ist ein **eigenständiges Web-Modul**, kein Austausch der vorhandenen Windows-EXE und kein Update des Kubikmeter-Rechners. Die bisherigen HolzOptiX-Projekte und gespeicherten Aufmaße werden nicht verändert. Der Fotozähler gehört wie besprochen zu einer späteren Version.

## Rechenbeispiele

- 12 Pakete × 8 + 5 Pakete × 6 + 7 lose = 133 Stück
- 18 Bretter/Lage × 24 Lagen = 432 Stück
- 15 × 10 + 13 × 8 + 11 × 6 + 7 einzelne = 327 Stück

Version: 1.0 · 22.10.2026
