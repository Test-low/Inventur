# HolzOptiX Inventur-Helfer 1.3.1

Drei einfache Zählhilfen für die Papierinventur in einer Holzhandlung.
Keine Warenwirtschaftsanbindung, kein Login, keine externen Bibliotheken.

## Funktionen

- **Paketrechner:** Beliebig viele Gruppen „Pakete × Stück pro Paket“, lose Stücke und Restpakete (direkt gezählter Rest oder ursprüngliche Menge minus Entnahme). Standard-Paketgrößen lokal speichern.
- **Stapelzähler:** Gleichmäßige Teilblöcke und einzelne, unregelmäßige Reihen. Zusätzlich Stapelhöhen-Rechner mit/ohne Zwischenhölzer. Höhenergebnisse sind Schätzungen und werden gekennzeichnet.
- **Foto-Zählhilfe:** Farbige, selbst benannte Zählbereiche, abschließbare Bereiche, nummerierte Markierungen und Bereichszähler. Foto zoomen, verschieben und mit den Markierungen als JPG speichern.
- **Längen-Sortierzähler:** Beliebig viele Holzlängen unter einer gemeinsamen Artikelnummer erfassen; jede Länge als eigene Ergebnisposition, gesamte lfm/m²/m³ berechnen. Gemeinsam wieder bearbeiten.
- **Ergebnisliste (Variante 2):** Mehrere Artikel/Positionen speichern, ändern, löschen, drucken und exportieren.
- **Automatisches Zwischenspeichern:** Aktuelle Eingabe und Ergebnisliste bleiben lokal im jeweiligen Browser erhalten.
- **Export:** CSV für Excel, Druckansicht/PDF, JSON-Sicherung mit Import einschließlich verfügbarer Fotos und Paketgrößen. Alte Sicherungen bleiben importierbar.
- **Optional:** Einheitslänge und -breite je Artikel für lfm und m². Nur nutzen, wenn alle gezählten Stücke identische Maße haben.
- **Handy:** Große Eingaben, numerische Tastatur, responsive Oberfläche. Die Webseite selbst lässt sich auf Touchgeräten nicht mehr mit zwei Fingern vergrößern oder verkleinern; das Foto im Stapelzähler weiterhin schon. Nach dem ersten Laden auf HTTPS auch offline über den installierten Service Worker.

## Auf dem Computer ausprobieren

Den Ordner entpacken und `index.html` im Browser öffnen. Dafür ist keine Installation nötig. Eine stabile Browser-Datenspeicherung und Offline-App-Nutzung sind bei direktem Öffnen als Datei jedoch browserabhängig.

## Für Smartphone und Tablet bereitstellen

Die Dateien **aus** dem Ordner `inventur` in das bestehende GitHub-Pages-Repository für die Inventur hochladen und die bisherigen Dateien ersetzen. Die Adresse bleibt unverändert.

Eure bestehende Adresse:

`https://test-low.github.io/Inventur/`

Den Link einmal im Browser mit Internet öffnen; danach kann die App bei erfolgreicher Cache-Einrichtung ohne Netz genutzt werden. Für das Zurückholen und Synchronisieren der Daten gibt es **keinen automatischen Abgleich zwischen Geräten**.

**Wichtig:** Browserdaten können gelöscht werden. Deshalb regelmäßig unter „Ergebnisliste → Sicherung speichern“ eine JSON-Datei herunterladen. Die JSON-Sicherung lässt sich in eine andere Installation importieren. Die CSV dient zur Übertragung auf eure Papier- oder Excel-Liste.

**Vor dem Update:** In der bisherigen Version einmal eine JSON-Sicherung erstellen. Version 1.3.1 verwendet weiterhin denselben lokalen Datenspeicher und übernimmt frühere Zählungen sowie Markierungen. Die Daten werden nicht automatisch zwischen verschiedenen Handys übertragen.

**Wichtig beim Hochladen von 1.3.1:** Unbedingt **alle Dateien**, besonders `app.js`, `photo.js`, `index.html`, `style.css` und `sw.js`, aus diesem ZIP ersetzen. Wenn nur die Webseite (`index.html`) ausgetauscht wird, fehlen die neuen Berechnungen. Die Programmdateien tragen nun eine neue Versionskennung in ihren Ladeadressen, damit ein altes Offline-Zwischenspeicherpaket sie nicht versehentlich ersetzt. Nach dem Upload auf dem Handy gegebenenfalls zweimal neu laden. **Nicht die Website-Daten löschen**, sonst würden lokale Zählungen verloren gehen.

## Foto-Zählhilfe

1. Im Reiter „Stapelzähler“ auf „Foto aufnehmen / öffnen“ tippen.
2. Die Stirnseite des Holzstapels möglichst gerade und vollständig fotografieren.
3. Bei Bedarf mit „+ Bereich“ weitere Farbgruppen hinzufügen, benennen und eine Farbe wählen.
4. Den gewünschten Bereich auswählen. Jedes sichtbare Brett einmal antippen, der Punkt erhält Nummer und Bereichsfarbe.
5. Zum Korrigieren „Entfernen“ oder „Rückgängig“ nutzen. Fertige Bereiche lassen sich abschließen und wieder freigeben.
6. Mit den Zoom-Tasten oder zwei Fingern vergrößern, bei Vergrößerung verschieben. Über „Foto mit Markierungen speichern“ ein Kontrollbild herunterladen.
7. Den Artikel wie gewohnt zur Ergebnisliste hinzufügen.

Die Markierungen und der Zählwert werden lokal zwischengespeichert; das komprimierte Foto wird separat im lokalen Browser-Fotospeicher abgelegt. **Keine Bilder werden an einen Server übertragen.** Die JSON-Sicherung enthält die verfügbaren Fotos, kann daher aber deutlich größer sein. Beim Import werden Bilder und Markierungen wiederhergestellt.

**Achtung bei Mischzählungen:** Die Fotozahl wird zu Teilblöcken, Höhenschätzungen, Einzelreihen und losen Brettern addiert. Jedes Brett darf nur mit einer Methode erfasst werden, sonst wird es doppelt gezählt. Das Programm zeigt bei einer Mischung eine Rückfrage. Wenn Bretter verdeckt sind, muss der Stapel zusätzlich von Hand kontrolliert werden.

## Umfang

Dies ist ein **eigenständiges Web-Modul**, kein Austausch der vorhandenen Windows-EXE und kein Update des Kubikmeter-Rechners. Die bisherigen HolzOptiX-Projekte und gespeicherten Aufmaße werden nicht verändert. Zählungen aus den Versionen 1.0–1.2 bleiben beim Update auf demselben Gerät erhalten.

## Rechenbeispiele

- 12 Pakete × 8 + 5 Pakete × 6 + 7 lose = 133 Stück
- 18 Bretter/Lage × 24 Lagen = 432 Stück
- 15 × 10 + 13 × 8 + 11 × 6 + 7 einzelne = 327 Stück
- 4 volle Pakete à 80 + Restpaket (80 − 25) = 375 Stück
- 1.520 mm Stapelhöhe − 4 × 20 mm Zwischenholz = 1.440 mm; geteilt durch 24 mm × 10 je Lage = geschätzt 600 Stück
- 42 × 3 m + 31 × 4 m + 18 × 5 m = 91 Stück und 340 lfm

Version: 1.3.1 · 22.10.2026
