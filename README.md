# HolzOptiX Inventur-Helfer 1.2

Zwei einfache Zählhilfen für die Papierinventur in einer Holzhandlung.
Keine Warenwirtschaftsanbindung, kein Login, keine externen Bibliotheken.

## Funktionen

- **Paketrechner:** Beliebig viele Gruppen „Pakete × Stück pro Paket“ und lose Stücke.
- **Stapelzähler:** Beliebig viele gleichmäßige Teilblöcke „Bretter pro Lage × Lagen“ sowie einzelne, unregelmäßige Reihen und lose Bretter.
- **Foto-Zählhilfe (neu):** Foto der Brett-Stirnseiten aufnehmen oder öffnen, einzelne Bretter antippen, Markierungen sichtbar zählen, entfernen und rückgängig machen. Vergrößern, verschieben und Zwei-Finger-Zoom.
- **Ergebnisliste (Variante 2):** Mehrere Artikel nacheinander zählen, speichern, ändern und einzeln entfernen.
- **Automatisches Zwischenspeichern:** Aktuelle Eingabe und Ergebnisliste bleiben lokal im jeweiligen Browser erhalten.
- **Export:** CSV für Excel, übersichtliche Druckansicht/PDF über Browser-Drucken, JSON-Sicherung mit Import einschließlich verfügbarer Fotos.
- **Optional:** Einheitslänge und -breite je Artikel für lfm und m². Nur nutzen, wenn alle gezählten Stücke identische Maße haben.
- **Handy:** Große Eingaben, numerische Tastatur, responsive Oberfläche. Die Webseite selbst lässt sich auf Touchgeräten nicht mehr mit zwei Fingern vergrößern oder verkleinern; das Foto im Stapelzähler weiterhin schon. Nach dem ersten Laden auf HTTPS auch offline über den installierten Service Worker.

## Auf dem Computer ausprobieren

Den Ordner entpacken und `index.html` im Browser öffnen. Dafür ist keine Installation nötig. Eine stabile Browser-Datenspeicherung und Offline-App-Nutzung sind bei direktem Öffnen als Datei jedoch browserabhängig.

## Für Smartphone und Tablet bereitstellen

Den kompletten Ordner `inventur` auf den vorhandenen Webserver oder in das bestehende GitHub-Pages-Repository hochladen. Die Webseite liegt anschließend unter dem bisherigen Basislink plus `/inventur/`; die bisherige Startseite bleibt unverändert.

Beispiel bei Verwendung des bestehenden GitHub-Pages-Repositories:

`https://test-low.github.io/Inventur/`

Den Link einmal im Browser mit Internet öffnen; danach kann die App bei erfolgreicher Cache-Einrichtung ohne Netz genutzt werden. Für das Zurückholen und Synchronisieren der Daten gibt es **keinen automatischen Abgleich zwischen Geräten**.

**Wichtig:** Browserdaten können gelöscht werden. Deshalb regelmäßig unter „Ergebnisliste → Sicherung speichern“ eine JSON-Datei herunterladen. Die JSON-Sicherung lässt sich in eine andere Installation importieren. Die CSV dient zur Übertragung auf eure Papier- oder Excel-Liste.

## Foto-Zählhilfe

1. Im Reiter „Stapelzähler“ auf „Foto aufnehmen / öffnen“ tippen.
2. Die Stirnseite des Holzstapels möglichst gerade und vollständig fotografieren.
3. Auf jedes sichtbar zu zählende Brett einmal tippen. Es wird mit einem nummerierten Punkt markiert.
4. Zum Korrigieren „Entfernen“ wählen und auf einen Punkt tippen oder „Rückgängig“ nutzen.
5. Mit den Zoom-Tasten oder zwei Fingern vergrößern. Bei Vergrößerung kann das Foto verschoben werden.
6. Den Artikel wie gewohnt zur Ergebnisliste hinzufügen.

Die Markierungen und der Zählwert werden lokal zwischengespeichert; das komprimierte Foto wird separat im lokalen Browser-Fotospeicher abgelegt. **Keine Bilder werden an einen Server übertragen.** Die JSON-Sicherung enthält die verfügbaren Fotos, kann daher aber deutlich größer sein. Beim Import werden Bilder und Markierungen wiederhergestellt.

**Achtung bei Mischzählungen:** Die Fotozahl wird zu Teilblöcken, Einzelreihen und losen Brettern addiert. Jedes Brett darf nur mit einer Methode erfasst werden, sonst wird es doppelt gezählt. Wenn Bretter verdeckt sind, muss der Stapel zusätzlich von Hand kontrolliert werden.

## Umfang

Dies ist ein **eigenständiges Web-Modul**, kein Austausch der vorhandenen Windows-EXE und kein Update des Kubikmeter-Rechners. Die bisherigen HolzOptiX-Projekte und gespeicherten Aufmaße werden nicht verändert. Zählungen aus Version 1.0 bleiben beim Update auf demselben Gerät erhalten.

## Rechenbeispiele

- 12 Pakete × 8 + 5 Pakete × 6 + 7 lose = 133 Stück
- 18 Bretter/Lage × 24 Lagen = 432 Stück
- 15 × 10 + 13 × 8 + 11 × 6 + 7 einzelne = 327 Stück

Version: 1.2 · 22.10.2026
