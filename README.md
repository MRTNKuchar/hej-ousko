# Hádačka – česká písnička dne

Poznej české písničky z první vteřiny. Každý den 5 nových, předchozí dny se dají dohrát v archivu (⟲).

## Spuštění
Stačí otevřít `public/index.html` v prohlížeči. Ukázky se stahují z Deezeru (30 s preview), takže je potřeba internet.

## Úprava písniček
Písničky jsou v `public/songs.js`. Novou přidáš takhle:
1. Najdi ji na https://www.deezer.com a otevři stránku skladby.
2. Z adresy `deezer.com/track/123456` zkopíruj číslo.
3. Přidej do seznamu `SONGS` (CZ rap: `RAP_SONGS` v `public/rap.js`) řádek: `{ id: 123456, artist: "Interpret", title: "Název" },`

Hra si každý den sama vybere 5 písniček (počet je `SONGS_PER_DAY` v `public/app.js`). Pořadí je zamíchané, pro všechny hráče stejné, v jednom dni ani ve dvou dnech po sobě se neopakuje interpret. Až se projdou všechny, zamíchají se znovu a jinak. Přidáním písničky se přehází i staré dny.
Datum dne #1 je `START_DATE` v `public/app.js`.

## Nasazení
Web hostuje **Cloudflare Workers** (statické soubory, viz `wrangler.jsonc`) napojený přímo na tento GitHub repozitář. Každý push do `main` se sám nasadí, žádné tokeny nejsou potřeba.
Nastavení v Cloudflare: Build command **prázdný**, Deploy command `npx wrangler deploy`.

GitHub Actions (`.github/workflows/check.yml`) u každého pushe a pull requestu zkontrolují syntaxi JS a seznam písniček.
