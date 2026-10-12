# Hádačka – česká písnička dne

Poznej české písničky z první vteřiny. Každý den 5 nových, předchozí dny se dají dohrát v archivu (⟲).

## Spuštění
Stačí otevřít `public/index.html` v prohlížeči. Ukázky se stahují z Deezeru (30 s preview), takže je potřeba internet.

## Úprava písniček
Písničky jsou v `public/songs.js`. Novou přidáš takhle:
1. Najdi ji na https://www.deezer.com a otevři stránku skladby.
2. Z adresy `deezer.com/track/123456` zkopíruj číslo.
3. Přidej řádek **na konec** seznamu `SONGS`: `{ id: 123456, artist: "Interpret", title: "Název" },`

Den #1 hraje písničky 1–5, den #2 písničky 6–10 atd. Počet za den je `SONGS_PER_DAY` v `public/app.js`. Až seznam dojde, jede se znovu od začátku.
Datum dne #1 je `START_DATE` v `public/app.js`.

## Nasazení (CI/CD)
Každý push do větve `main` spustí GitHub Actions (`.github/workflows/deploy.yml`):
1. **check**: zkontroluje syntaxi JS a seznam písniček (duplicitní ID atd.),
2. **deploy**: nahraje složku `public/` na Cloudflare Pages (projekt `hej-ousko`).

V repozitáři na GitHubu je potřeba mít secrets `CLOUDFLARE_API_TOKEN` a `CLOUDFLARE_ACCOUNT_ID`.
