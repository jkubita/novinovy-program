# Novinový program (prototyp)

Každou hodinu stáhne titulní strany českých zpravodajských webů, uloží si, které články byly nahoře, a zobrazí to jako časovou osu: co bylo kdy na čele, jak dlouho tam vydrželo a jak se měnily titulky.

Sledované weby: **iDNES.cz, Novinky.cz, Hospodářské noviny, Seznam Zprávy, Deník N, Aktuálně.cz, iROZHLAS**.

Inspirováno projektem [Novinový program](https://www.novinovyprogram.cz/). Kód je napsaný nově.

## Jak to funguje

```
GitHub Actions (cron každou hodinu)
   └─ src/scrape.js ── stáhne HTML ─▶ src/extract.js ─▶ src/store.js ─▶ docs/data/YYYY-MM-DD/<web>.json
                                                                                  │
GitHub Pages (složka docs/) ◀──────────── docs/index.html + app.js čte JSONy ◀─────┘
```

- **Bez serveru a databáze.** Data jsou JSON soubory přímo v repozitáři, web je statický a běží zdarma na GitHub Pages.
- **Robustní parsování.** Místo CSS selektorů konkrétní šablony se články poznávají podle tvaru URL (např. `novinky.cz/clanek/…-40501234`). Titulek se bere z nadpisu v odkazu nebo kolem něj, perex z nejbližšího odstavce ve stejném „teaseru“. Pořadí na stránce odpovídá důležitosti. Při redesignu webu tak většinou stačí nic neměnit, nanejvýš upravit regex v `src/sites.js`.
- **Ochrana proti tichému rozbití.** Pokud parser najde méně než 3 články, snímek se neuloží a na webu se u daného média ukáže, že poslední stažení selhalo.

### Formát dat

`docs/data/2026-11-21/idnes.json` (dny podle pražského času):

```json
{
  "site": "idnes",
  "date": "2026-11-21",
  "articles": [
    { "link": "https://…", "headline": "…", "perex": "…", "firstSeen": 1763712000000, "lastSeen": 1763719200000,
      "history": [ { "time": 1763712000000, "headline": "původní titulek" }, { "time": 1763715600000, "headline": "nový titulek" } ] }
  ],
  "snapshots": [ { "time": 1763712000000, "top": [0, 3, 1, 2] } ]
}
```

`top` jsou indexy do `articles` v pořadí na stránce (ukládá se top 10). `docs/data/index.json` obsahuje seznam webů, dostupné dny a stav posledního stažení.

## Spuštění lokálně

Potřeba je Node.js 20+.

```bash
npm install
npm run check     # stáhne weby a vypíše, co našel (nic neukládá) – rychlá kontrola parserů
npm run scrape    # stáhne a uloží snímek do docs/data
npm run serve     # web na http://localhost:8080/
npm test          # testy
```

## Nasazení na GitHub

1. Pushněte repozitář na GitHub.
2. **Settings → Pages**: Source „Deploy from a branch“, větev `main`, složka `/docs`.
3. **Actions**: workflow „Stažení titulních stran“ se spouští sám každou hodinu (v xx:07). Poprvé ho můžete pustit ručně (Run workflow).

GitHub plánované běhy občas o pár minut zpozdí a v neaktivních repozitářích je po 60 dnech vypne. Každý snímek je jeden commit, takže historie repozitáře poroste (řádově 100 commitů denně). Pro prototyp to nevadí. Pro ostrý provoz by bylo lepší ukládat data mimo git (S3/R2 nebo databáze).

## Přidání dalšího webu

Do `src/sites.js` přidejte záznam s `id`, `name`, `url`, barvou a regexem `article`, který odpovídá URL článků daného webu. Ověřte to pomocí `node src/scrape.js <id> --dry-run`.

## Známá omezení

- Parsery jsou otestované na zjednodušených HTML vzorech (`test/`). Proti živým webům je ověřte přes `npm run check` nebo první běh v GitHub Actions.
- Weby Seznamu (Novinky, Seznam Zprávy) můžou návštěvníkům z EU zobrazovat souhlas s cookies místo obsahu. Pokud k tomu dojde, `check` vypíše přesměrování.
- Neukládají se celé HTML snímky stránek, jen extrahovaná data.
