# Store listing — Deutsch

> Machine-drafted; have a native speaker review before publishing.

## Name

Reddit Slideshow Spectacular!

## Summary

Verwandle deine alten oder neuen Reddit-Feeds in eine bildschirmfüllende, per Tastatur gesteuerte Medien-Diashow. Kostenlos, privat, lokal, ohne Tracking.

## Description

Reddit Slideshow Spectacular! verwandelt deine Reddit-Feeds in eine bildschirmfüllende, per Tastatur gesteuerte Medien-Diashow. Öffne einen Feed, ein Subreddit, ein Multireddit oder Suchergebnisse auf old.reddit.com oder www.reddit.com, klicke auf das Symbol in der Symbolleiste (oder drücke Alt+Shift+S) und lehn dich zurück.

Die Diashow nutzt deine bereits angemeldete Reddit-Sitzung – keine API-Schlüssel, keine separate Anmeldung, kein zusätzliches Konto. Sie geht die Medienbeiträge in der Reihenfolge durch, in der Reddit sie liefert, und blättert automatisch durch den Feed, sodass die Diashow über die erste Seite hinaus weiterläuft.

NEU IN V1.3.1

- NEU: Wählbarer Download-Ordner (ein Ordner im Downloads-Ordner deines Browsers)
- BEHOBEN: Beim Zoomen füllt ein hohes Bild jetzt den ganzen Bildschirm, statt auf eine schmale Spalte beschnitten zu bleiben

NEU IN V1.3.0

- NEU: Anpassbares Tastenkürzel zum Öffnen
- NEU: Der Pfeil im Titel zeigt jetzt deine aktuelle Stimme
- VERBESSERT: Eine übersichtlichere Infozeile, leichter lesbarer Text über Bildern
- VERBESSERT: Die Liste schließt sich nicht mehr von selbst und reicht weiter zurück
- BEHOBEN: Video-Clips skalieren jetzt richtig, sodass die Player-Steuerelemente nicht mehr über das ganze Fenster reichen

Vollständige Versionshinweise: https://github.com/Rio517/reddit-slideshow-spectacular/releases

WAS ABGESPIELT WIRD

- Direkte Reddit-Bilder (i.redd.it in voller Auflösung, sofern verfügbar)
- Reddit-Galerien, aufgeteilt in je eine Folie pro Bild
- Von Reddit gehostete Videos (v.redd.it) mit Ton (der separate Audiotrack)
- Clips von Redgifs, Imgur (.gifv), Streamable und Giphy, als natives Video abgespielt
- Imgur-Alben, aufgeteilt in je eine Folie pro Bild
- Catbox-Video- und Bilddateien
- Crossposts, aufgelöst auf das Medium des Originalbeitrags

Die Warteschlange enthält nur Medienbeiträge: Text- und Self-Posts, ausgehende Artikellinks, angepinnte Ankündigungen sowie Werbe- und gesponserte Beiträge werden übersprungen. Medien, die sich nicht laden lassen, werden ebenfalls übersprungen – die Diashow bleibt nie auf einer leeren Folie stehen.

STEUERUNG

- Tastatur: Left/Right zum Navigieren (Shift+Right springt zum nächsten Beitrag; Page Up/Page Down springen 10 Einträge zurück/vor), Up/Down zum Hoch-/Runtervoten, Space zum Abspielen/Pausieren, M zum Stummschalten, F für Vollbild, D zum Herunterladen, I zum Blockieren des Autors (und Überspringen seines Beitrags), A um ihn als Freund hinzuzufügen oder ihm zu folgen, Esc zum Schließen
- Eine Steuerungsleiste auf dem Bildschirm: zurück, Abspielen/Pausieren, weiter, Stummschalten, Vollbild, in einem Fenster öffnen und Einstellungen
- Unter jeder Folie: eine Infozeile (wer den Beitrag gepostet hat, in welchem Subreddit, Quelle und Auflösung) sowie Schaltflächen zum Öffnen des Originalbeitrags oder zum Herunterladen des Mediums
- Klicke auf den Positionszähler, um direkt zu einem beliebigen Beitrag in der geladenen Warteschlange zu springen
- Klicke auf den dunklen Hintergrund, um die Diashow zu schließen
- Bilder wechseln nach einem einstellbaren Timer; der Timer läuft auch nach manueller Navigation weiter, und Videos wechseln automatisch am Ende des Clips

SCHÖNE DETAILS

- Folienübergänge: Überblenden, Schieben, Schieben mit Überlappung, Zoomen, Kippen oder keiner
- Optionaler Countdown-Balken oben (bei Videofolien, bei allen Folien oder nie)
- Optionales langsames Schwenken & Zoomen für Bilder, die größer als der Bildschirm sind
- Fixierter Positionszähler und Beitragstitel, damit du immer weißt, wo du bist
- „In einem Fenster öffnen" öffnet die Diashow in einem minimalen Popup-Fenster – bereit zum AirPlay oder Chromecast auf einen Fernseher oder zweiten Bildschirm für einen entspannten Großbildmodus
- Duplikate überspringen: Reposts, Crossposts und wiederholte Galerien werden übersprungen; ein perzeptiver Hash (standardmäßig aktiviert) erkennt außerdem dasselbe Bild, das unter einem neuen Link erneut hochgeladen wurde – einzeln oder in einer Galerie
- „Original öffnen" springt direkt zum Quellbeitrag

EINSTELLUNGEN (werden sofort übernommen, kein Neuladen erforderlich)

- Zeit pro Bild (1 Sekunde bis 5 Minuten, mit feiner Abstufung im unteren Bereich)
- Folienübergang
- Sichtbarkeit des Timer-Balkens
- Wartezeit für langsame Medien, bevor zur nächsten Folie gewechselt wird
- Automatische Wiedergabe ein/aus, stummgeschaltet starten ein/aus
- NSFW einbeziehen – folgt standardmäßig deiner Reddit-Sitzung und zeigt Inhalte ab 18 Jahren nur so weit, wie dein Konto es ohnehin bereits tut
- Doppelte Medien überspringen, einschließlich erneut hochgeladener Bilder (standardmäßig aktiviert)
- Download-Ordner (im Downloads-Ordner deines Browsers)
- Schwenken & Zoomen für große Bilder (oder alle Bilder), mit voller Kontrolle über die Reihenfolge

DATENSCHUTZ

Keine Analysedaten, kein Tracking, keine Werbung, keine Konten und keine Entwicklerserver (es gibt keine). Die Erweiterung ruft nur die Medien ab, die du dir ansiehst: den Feed und seine Medien von Reddit sowie Clips der Anbieter Imgur, Redgifs, Streamable, Giphy und Catbox. Das Einzige, was in dein Reddit-Konto schreibt, sind das Abstimmen (Hoch-/Runter-Tasten), das Blockieren eines Autors (I) und das Hinzufügen oder Folgen eines Autors (A) – und nur, wenn du die jeweilige Taste drückst. Deine Einstellungen werden lokal auf deinem Computer gespeichert, und die Erweiterung lädt keinen Remotecode. Vollständige Richtlinie: siehe den Link zur Datenschutzrichtlinie.

Open source, MIT lizenziert.
