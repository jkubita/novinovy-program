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

test("Seznam Zprávy: menu a proužek doporučených článků před hlavním článkem se ignorují", () => {
  const html = `<body>
    <div class="ribbon"><ul class="ribbon-menu"><li class="ribbon-menu__item"><a href="https://www.seznamzpravy.cz/clanek/zdravi-plus-mapa-ortopedu-ordinace-praha-vsechny-kraje-301728">Mapa ortopedů v celé republice</a></li></ul></div>
    <div data-dot="ogm-horizontal-timeline"><a href="https://www.seznamzpravy.cz/clanek/zdravi-plus-prichazeji-leky-na-hubnuti-320820"><h3>Přicházejí léky na hubnutí v tabletách</h3></a></div>
    <div data-dot="ogm-top-story"><a href="https://www.seznamzpravy.cz/clanek/domaci-kutila-nastval-rohlik-321133"><h2>Kutila naštval Rohlík, aplikaci naprogramoval za dvě hodiny</h2></a></div>
  </body>`;
  const res = extractArticles(html, getSite("seznamzpravy"));
  assert.deepEqual(res.map((a) => a.headline), ["Kutila naštval Rohlík, aplikaci naprogramoval za dvě hodiny"]);
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

test("Blesk: titulek z atributu title (bez rubriky), placené články z Rádce se ignorují", () => {
  const html = `<body>
    <div class="graphic-banners"><a class="graphic-banner__graphic" href="https://www.blesk.cz/clanek/zpravy-politika/853166/mluvci-o-kabelkach.html" title="Mluvčí o drahých kabelkách: Nechte mě být!"><img alt=""></a></div>
    <a class="article-card" href="https://www.blesk.cz/clanek/zpravy-politika/853166/mluvci-o-kabelkach.html" aria-label="Mluvčí o drahých kabelkách: Nechte mě být!"><span>Politika</span><span>Mluvčí o drahých kabelkách: Nechte mě být!</span></a>
    <a class="article-card" href="https://www.blesk.cz/clanek/radce/852529/jak-mit-finance-pod-kontrolou.html" aria-label="Jak mít své finance pod kontrolou? Tohle by vás nenapadlo"><span>CNC Native</span></a>
    <a class="article-card" href="https://www.blesk.cz/clanek/zpravy-krimi/853213/zahadna-otrava.html" title="Záhadná otrava na slovenské základce"><span>Krimi</span><span>Záhadná otrava na slovenské základce</span></a>
  </body>`;
  const res = extractArticles(html, getSite("blesk"));
  assert.deepEqual(res.map((a) => a.headline), ["Mluvčí o drahých kabelkách: Nechte mě být!", "Záhadná otrava na slovenské základce"]);
});

test("ČT24: štítky Video/Živě se z titulku odstraní, videa mimo články se ignorují", () => {
  const html = `<body>
    <a href="/clanek/domaci/nedelni-debata-379830" class="wide-opener"><h3><span class="wc-prefix">Živě</span>Incident v Polsku je pokračováním ruských hrozeb</h3></a>
    <a href="/clanek/domaci/zachranari-vesty-379825"><h3 class="article-link__title"><span class="wc-prefix wc-prefix--blue">Video</span>Záchranáři se vybavují balistickými vestami</h3></a>
    <a href="/video/v-ostrave-se-sesli-krampusove-262156"><h3>V Ostravě se sešli Krampusové</h3></a>
  </body>`;
  const res = extractArticles(html, getSite("ct24"));
  assert.deepEqual(res.map((a) => a.headline), ["Incident v Polsku je pokračováním ruských hrozeb", "Záchranáři se vybavují balistickými vestami"]);
  assert.equal(res[0].link, "https://ct24.ceskatelevize.cz/clanek/domaci/nedelni-debata-379830");
});

test("RSS: titulky, odkazy bez utm a perex bez HTML z CDATA", () => {
  const site = { id: "test", name: "Test", url: "https://www.example.cz/", article: /^https:\/\/www\.example\.cz\/clanek\/\d+$/ };
  const xml = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>Test</title>
    <item><title>Sněmovna bude hlasovat o rozpočtu</title><link>https://www.example.cz/clanek/101?utm_source=rss</link>
      <description><![CDATA[<p>${PEREX}</p>]]></description></item>
    <item><title>Rubrika, ne článek</title><link>https://www.example.cz/rubrika</link></item>
    <item><title>Summit NATO skončil bez dohody</title><link>https://www.example.cz/clanek/102</link></item>
  </channel></rss>`;
  const res = extractFeed(xml, site);
  assert.deepEqual(res.map((a) => a.link), ["https://www.example.cz/clanek/101", "https://www.example.cz/clanek/102"]);
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
