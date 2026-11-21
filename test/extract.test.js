// Testy extrakce na zjednodušených HTML, která napodobují strukturu jednotlivých webů.
// Nenahrazují kontrolu proti živým stránkám (`npm run check`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractArticles, extractFeed, normalizeUrl } from "../src/extract.js";
import { detectCharset, decode } from "../src/fetch.js";
import { getSite, SITES } from "../src/sites.js";

const PEREX = "Vláda na mimořádném jednání schválila balík opatření, který má zmírnit dopady zdražování energií.";

test("normalizeUrl odstraní query a fragment a vyřeší relativní odkaz", () => {
  assert.equal(normalizeUrl("/clanek/domaci-x-40500001?utm_source=hp#diskuse", "https://www.novinky.cz/"), "https://www.novinky.cz/clanek/domaci-x-40500001");
  assert.equal(normalizeUrl("javascript:void(0)", "https://x.cz/"), null);
});

test("iDNES: titulek z h3, perex z p, obrázkový odkaz se nezdvojí, menu a foto se ignorují", () => {
  const html = `<body>
    <nav><a href="https://www.idnes.cz/zpravy/domaci/menu.A261121_000000_domaci_x">Menu odkaz s dlouhým textem</a></nav>
    <div class="art">
      <a class="art-link" href="https://www.idnes.cz/zpravy/domaci/vlada-energie.A261121_093512_domaci_kop"><img alt="foto"></a>
      <a href="https://www.idnes.cz/zpravy/domaci/vlada-energie.A261121_093512_domaci_kop"><h3>Vláda schválila balík proti drahým energiím</h3></a>
      <p class="perex">${PEREX}</p>
    </div>
    <div class="art">
      <a href="https://www.idnes.cz/zpravy/foto/galerie.A261121_100000_foto_x"><h3>Fotogalerie ze summitu v Bruselu</h3></a>
    </div>
    <div class="art">
      <a href="https://sport.idnes.cz/fotbal/sparta-vyhrala.A261121_081500_fotbal_rou"><h3>Sparta vyhrála derby po penaltách</h3></a>
    </div>
    <div class="art"><a href="https://www.idnes.cz/zpravy/zahranicni/usa-volby.A261120_221000_zahranicni_ane?utm=1"><h3>Volby v USA: sečteno je 90 procent hlasů</h3></a></div>
  </body>`;
  const res = extractArticles(html, getSite("idnes"));
  assert.deepEqual(res.map((a) => a.headline), [
    "Vláda schválila balík proti drahým energiím",
    "Sparta vyhrála derby po penaltách",
    "Volby v USA: sečteno je 90 procent hlasů",
  ]);
  assert.equal(res[0].perex, PEREX);
  assert.equal(res[2].link, "https://www.idnes.cz/zpravy/zahranicni/usa-volby.A261120_221000_zahranicni_ane");
});

test("perex se nepřebírá ze sousedního článku v seznamu", () => {
  const html = `<body><ul>
    <li><a href="https://www.novinky.cz/clanek/domaci-a-40500001"><h3>První článek se zajímavým titulkem</h3></a></li>
    <li><a href="https://www.novinky.cz/clanek/domaci-b-40500002"><h3>Druhý článek se zajímavým titulkem</h3></a><p>${PEREX}</p></li>
  </ul></body>`;
  const [a, b] = extractArticles(html, getSite("novinky"));
  assert.equal(a.perex, "");
  assert.equal(b.perex, PEREX);
});

test("Novinky: relativní odkazy, titulek uvnitř odkazu bez nadpisu", () => {
  const html = `<body><main>
    <article><a href="/clanek/domaci-snezeni-ochromilo-dopravu-40501234"><span>Sněžení ochromilo dopravu na D1</span></a></article>
    <a href="/sekce/domaci">Domácí zprávy ze všech koutů republiky</a>
    <article><a href="/clanek/zahranicni-summit-nato-40501235"><h2>Summit NATO skončil bez dohody</h2></a><div class="perex">${PEREX}</div></article>
  </main></body>`;
  const res = extractArticles(html, getSite("novinky"));
  assert.equal(res.length, 2);
  assert.equal(res[0].link, "https://www.novinky.cz/clanek/domaci-snezeni-ochromilo-dopravu-40501234");
  assert.equal(res[1].perex, PEREX);
});

test("HN: články ze subdomén, odkaz uvnitř nadpisu", () => {
  const html = `<body>
    <div class="article"><h2><a href="https://domaci.hn.cz/c1-67543210-cnb-snizila-sazby">ČNB nečekaně snížila úrokové sazby</a></h2><p>${PEREX}</p></div>
    <div class="article"><h3><a href="https://byznys.hn.cz/c1-67543211-cez-zisk">ČEZ zvýšil zisk o čtvrtinu</a></h3></div>
    <a href="https://predplatne.hn.cz/">Předplatné Hospodářských novin za akční cenu</a>
  </body>`;
  const res = extractArticles(html, getSite("hn"));
  assert.deepEqual(res.map((a) => a.headline), ["ČNB nečekaně snížila úrokové sazby", "ČEZ zvýšil zisk o čtvrtinu"]);
  assert.equal(res[0].perex, PEREX);
});

test("Seznam Zprávy: nadpis vedle odkazu s aria-label", () => {
  const html = `<body><div>
    <div data-dot="tile"><a href="https://www.seznamzpravy.cz/clanek/domaci-politika-snemovna-rozpocet-271234" aria-label="Sněmovna schválila rozpočet na příští rok"></a></div>
    <div data-dot="tile"><a href="https://www.seznamzpravy.cz/clanek/zahranicni-valka-ukrajina-271235"><h3>Ukrajina hlásí průlom na jihu fronty</h3></a></div>
    <a href="https://www.seznamzpravy.cz/sekce/domaci-13">Domácí zpravodajství Seznam Zpráv</a>
  </div></body>`;
  const res = extractArticles(html, getSite("seznamzpravy"));
  assert.deepEqual(res.map((a) => a.headline), ["Sněmovna schválila rozpočet na příští rok", "Ukrajina hlásí průlom na jihu fronty"]);
});

test("Deník N: ignoruje Minutu, autory a tagy", () => {
  const html = `<body>
    <a href="https://denikn.cz/minuta/1612000/">Minuta: krátká zpráva z minutového zpravodajství</a>
    <article><a href="https://denikn.cz/1612345/jak-se-meni-ceska-skola/"><h3>Jak se mění česká škola</h3></a><p>${PEREX}</p><a href="https://denikn.cz/autor/jan-novak/">Jan Novák, redaktor Deníku N</a></article>
    <article><a href="https://denikn.cz/1612346/rozhovor-s-ministrem/?ref=hp"><h3>Rozhovor s ministrem financí</h3></a></article>
  </body>`;
  const res = extractArticles(html, getSite("denikn"));
  assert.deepEqual(res.map((a) => a.link), ["https://denikn.cz/1612345/jak-se-meni-ceska-skola/", "https://denikn.cz/1612346/rozhovor-s-ministrem/"]);
  assert.equal(res[0].perex, PEREX);
});

test("Aktuálně: články ze subdomén a online reportáže, rubriky se ignorují", () => {
  const html = `<body>
    <a href="https://zpravy.aktualne.cz/domaci/">Domácí zprávy z celé republiky</a>
    <div class="swift-box"><a href="https://zpravy.aktualne.cz/domaci/vlada-schvalila-rozpocet/r~0123456789abcdef0123456789abcdef/"><h2>Vláda schválila rozpočet na příští rok</h2></a><p>${PEREX}</p></div>
    <div class="swift-box"><a href="https://zpravy.aktualne.cz/zahranici/online-valka/l~fedcba9876543210fedcba9876543210/?utm=x"><h3>ONLINE: Válka na Ukrajině, vývoj situace</h3></a></div>
    <div class="swift-box"><a href="https://sport.aktualne.cz/fotbal/sparta-vyhrala/r~aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/">Sparta vyhrála derby po penaltách</a></div>
  </body>`;
  const res = extractArticles(html, getSite("aktualne"));
  assert.deepEqual(res.map((a) => a.headline), ["Vláda schválila rozpočet na příští rok", "ONLINE: Válka na Ukrajině, vývoj situace", "Sparta vyhrála derby po penaltách"]);
  assert.equal(res[0].perex, PEREX);
  assert.equal(res[1].link, "https://zpravy.aktualne.cz/zahranici/online-valka/l~fedcba9876543210fedcba9876543210/");
});

test("iROZHLAS: relativní odkazy s datem v URL, sekce se ignorují", () => {
  const html = `<body>
    <a href="/zpravy-domov">Zprávy z domova a další rubriky</a>
    <article><h3><a href="/zpravy-domov/snemovna-rozpocet-hlasovani_2611211234_ako">Sněmovna bude hlasovat o rozpočtu</a></h3><p>${PEREX}</p></article>
    <article><a href="https://www.irozhlas.cz/zpravy-svet/nato-summit_2611210915_jgr"><h3>Summit NATO skončil bez dohody</h3></a></article>
  </body>`;
  const res = extractArticles(html, getSite("irozhlas"));
  assert.deepEqual(res.map((a) => a.link), ["https://www.irozhlas.cz/zpravy-domov/snemovna-rozpocet-hlasovani_2611211234_ako", "https://www.irozhlas.cz/zpravy-svet/nato-summit_2611210915_jgr"]);
  assert.equal(res[0].perex, PEREX);
});

test("RSS: titulky, odkazy bez utm a perex bez HTML z CDATA", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>iROZHLAS</title>
    <item><title>Sněmovna bude hlasovat o rozpočtu</title><link>https://www.irozhlas.cz/zpravy-domov/snemovna-rozpocet_2611211234_ako?utm_source=rss</link>
      <description><![CDATA[<p>${PEREX}</p>]]></description></item>
    <item><title>Rubrika, ne článek</title><link>https://www.irozhlas.cz/zpravy-domov</link></item>
    <item><title>Summit NATO skončil bez dohody</title><link>https://www.irozhlas.cz/zpravy-svet/nato_2611210915_jgr</link></item>
  </channel></rss>`;
  const res = extractFeed(xml, getSite("irozhlas"));
  assert.deepEqual(res.map((a) => a.link), ["https://www.irozhlas.cz/zpravy-domov/snemovna-rozpocet_2611211234_ako", "https://www.irozhlas.cz/zpravy-svet/nato_2611210915_jgr"]);
  assert.equal(res[0].headline, "Sněmovna bude hlasovat o rozpočtu");
  assert.equal(res[0].perex, PEREX);
});

test("kódování windows-1250 se rozpozná z meta tagu", () => {
  const bytes = new Uint8Array([...Buffer.from('<meta charset="windows-1250"><h3>'), 0x8a, 0x9e, 0xe8, ...Buffer.from("</h3>")]);
  const cs = detectCharset("text/html", bytes);
  assert.equal(cs, "windows-1250");
  assert.match(decode(bytes, cs), /Ššč|Šžč/);
});

test("všechny weby mají unikátní id a platnou titulní URL", () => {
  assert.equal(new Set(SITES.map((s) => s.id)).size, SITES.length);
  for (const s of SITES) assert.ok(new URL(s.url));
});
