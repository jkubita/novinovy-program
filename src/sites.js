// Konfigurace sledovaných webů.
//
// Místo křehkých CSS selektorů (které se rozbijí s každým redesignem) poznáváme
// články podle tvaru jejich URL. Ten se mění mnohem méně často než HTML šablona.
// Pořadí odkazů v dokumentu pak odpovídá důležitosti na titulní straně.

/**
 * @typedef {Object} Site
 * @property {string} id          krátký klíč, použije se v názvech souborů
 * @property {string} name        zobrazovaný název
 * @property {string} url         titulní strana
 * @property {RegExp} article     odpovídá absolutní URL článku
 * @property {RegExp} [exclude]   URL, které článek nejsou, i když vypadají podobně
 * @property {string} [scope]     CSS selektor hlavního obsahu (zbytek stránky se ignoruje)
 * @property {string} [feed]      RSS kanál jako náhrada, když titulní stranu nejde stáhnout.
 *                                Pořadí je pak podle času vydání, ne podle důležitosti.
 * @property {string} color       barva sloupce ve frontendu
 */

/** @type {Site[]} */
export const SITES = [
  {
    id: "idnes",
    name: "iDNES.cz",
    url: "https://www.idnes.cz/",
    // https://www.idnes.cz/zpravy/domaci/nazev-clanku.A261121_093512_domaci_abc
    article: /^https?:\/\/([a-z0-9-]+\.)*idnes\.cz\/.*\.A\d{6}_\d{6}_[a-z0-9_-]+/i,
    exclude: /\/(foto|video|diskuse)(\/|$)|[?&]tema=/i,
    color: "#e30613",
  },
  {
    id: "novinky",
    name: "Novinky.cz",
    url: "https://www.novinky.cz/",
    // https://www.novinky.cz/clanek/domaci-nazev-clanku-40501234
    article: /^https?:\/\/(www\.)?novinky\.cz\/clanek\/[a-z0-9-]+-\d{6,}\/?$/i,
    color: "#c8102e",
  },
  {
    id: "hn",
    name: "Hospodářské noviny",
    url: "https://hn.cz/",
    // https://domaci.hn.cz/c1-67543210-nazev-clanku, https://archiv.hn.cz/c1-...
    article: /^https?:\/\/([a-z0-9-]+\.)*(hn|ihned)\.cz\/c1-\d{6,}-[a-z0-9-]+/i,
    color: "#1d4f91",
  },
  {
    id: "seznamzpravy",
    name: "Seznam Zprávy",
    url: "https://www.seznamzpravy.cz/",
    // https://www.seznamzpravy.cz/clanek/domaci-politika-nazev-clanku-271234
    article: /^https?:\/\/(www\.)?seznamzpravy\.cz\/clanek\/[a-z0-9-]+-\d{5,}\/?$/i,
    color: "#cc0000",
  },
  {
    id: "denikn",
    name: "Deník N",
    url: "https://denikn.cz/",
    // https://denikn.cz/1612345/nazev-clanku/
    article: /^https?:\/\/(www\.)?denikn\.cz\/\d{5,}\/[a-z0-9-]+\/?$/i,
    exclude: /denikn\.cz\/(minuta|autor|tag|cast)\//i,
    color: "#111111",
  },
  {
    id: "aktualne",
    name: "Aktuálně.cz",
    url: "https://www.aktualne.cz/",
    // https://zpravy.aktualne.cz/domaci/nazev-clanku/r~0123456789abcdef0123456789abcdef/
    // (l~… jsou online reportáže, ty bývají hlavním článkem taky)
    article: /^https?:\/\/([a-z0-9-]+\.)*aktualne\.cz\/.*\/[rl]~[0-9a-f]{20,}\/?$/i,
    color: "#ef7d00",
  },
];

export const getSite = (id) => SITES.find((s) => s.id === id);
