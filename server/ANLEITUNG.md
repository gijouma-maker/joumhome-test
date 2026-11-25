# JoumHome auf dem eigenen Server

Damit läuft JoumHome ohne Claude-Konto: eigener Login für Vermieter, Verwaltung, Mieter und Handwerker, eine gemeinsame Datenbank mit Live-Abgleich, Fotos und PDFs auf dem eigenen Server und **eigene KI ohne Kosten pro Foto** (Belege, Bescheide, Bewerber-Prüfung, KI-Chat).

Der Server ist derselbe wie bei WN Entrümpelung. Beide Apps können auf **einem** Server laufen, jede mit eigener Domain, und teilen sich dieselbe eigene KI.

## Was Sie brauchen
- **Einen V-Server** mit Ubuntu 24.04, z. B. netcup in Nürnberg. Für die eigene KI am besten **8 GB RAM oder mehr**. Läuft WN auf demselben Server, reicht derselbe Server.
- **Eine Domain oder Subdomain** für JoumHome, z. B. `app.joumhome.de`, mit A-Record auf die IP des Servers.

## Installation
1. Per SSH auf den Server: `ssh root@IP-DES-SERVERS`
2. Diesen Befehl einfügen:
   `curl -fsSL https://raw.githubusercontent.com/gijouma-maker/joumhome-test/main/server/install.sh | bash`
3. Domain eingeben und bei der KI **1 = eigene KI** wählen. Ist die eigene KI schon da (z. B. von WN), wird sie mitbenutzt.
4. `https://IHRE-DOMAIN` öffnen und den **Vermieter-Zugang** anlegen.

## Zugänge
Unter **„Zugänge verwalten“** (Leiste ganz oben) legen Sie die Zugänge an:
- **Verwaltung:** Mitarbeiter, die alles bearbeiten dürfen.
- **Mieter / Handwerker:** Nach dem Anlegen in der App beim Mieter bzw. Handwerker auf **„Verbinden“** tippen und die Person suchen. Danach sieht der Mieter seine Wohnung, Nachrichten und Dokumente, der Handwerker seine Aufträge.
- **Gekündigt oder ausgezogen?** Auf **Sperren** tippen. Der Zugang ist sofort abgemeldet.

## Daten aus der Claude-Version übernehmen
1. In der Claude-Version: **Datensicherung → „Komplett-Sicherung (ZIP mit Fotos)“** bzw. **Umzug** herunterladen.
2. Auf dem eigenen Server in der App unter **Einstellungen → „Umzug importieren“** die ZIP-Datei auswählen.
3. Mieter und Handwerker bekommen neue Zugänge und werden in der App einmal neu **verbunden**.

## Eigene KI
- Die KI ist **Qwen3-VL** über **Ollama** und läuft auf dem Server. Fotos verlassen den Server nicht.
- Ohne Grafikkarte dauert ein Beleg etwa 1–2 Minuten (Schätzung). Mit einem Büro-PC mit Grafikkarte geht es in Sekunden. Dann in `/opt/jh/server/.env` `WN_OLLAMA_URL` auf den PC setzen, verbunden z. B. über Tailscale. WN und JoumHome können denselben PC nutzen.
- Auf Wunsch geht auch Claude über einen API-Schlüssel: `WN_KI=anthropic` und `ANTHROPIC_API_KEY=…` in `.env` eintragen. Das kostet pro Anfrage.

## Im Alltag
- **Neue Version:** Auf dem Server `jh-update` eingeben.
- **Datensicherung (mehrfach):**
  - Die Datenbank wird **3× täglich automatisch gesichert** (6, 14 und 22 Uhr), außerdem bei jedem Neustart und vor jeder Datenübernahme. Die Sicherungen werden **30 Tage** aufbewahrt, in `/opt/jh/server/data/sicherung/`.
  - Gelöschte Fotos und PDFs landen erst im Papierkorb `sicherung/geloescht/` und werden nach 30 Tagen endgültig gelöscht.
  - Unter **„Zugänge verwalten → Datensicherung“** kann man jederzeit von Hand sichern und die neueste Sicherung herunterladen. Diese Datei ab und zu auf dem PC oder einem USB-Stick ablegen.
  - **Wichtig, eine zweite Kopie außerhalb des Servers:** Beim Hoster zusätzlich Speicherplatz buchen (z. B. eine Storage-Box), einbinden und in `.env` `WN_SICHERUNG_KOPIE=/mnt/backup` eintragen. Dann werden alle Sicherungen und Fotos automatisch dorthin kopiert. Zusätzlich die Snapshot- bzw. Backup-Funktion des Hosters einschalten. So sind die Daten auch sicher, wenn der Server ausfällt.
  - Uhrzeiten und Aufbewahrung lassen sich in `.env` ändern (`WN_SICHERUNG_ZEITEN=6,14,22`, `WN_SICHERUNG_TAGE=30`).
- **Spracheingabe und Vorlesen** laufen über den Browser (Chrome, Edge, iPhone-Safari).
