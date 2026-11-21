import * as cheerio from "cheerio";

/**
 * @typedef {Object} Article
 * @property {string} link
 * @property {string} headline
 * @property {string} perex   může být prázdný řetězec
 */

const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

const HEADING = "h1, h2, h3, h4, h5, h6";
const PEREX = "p, [class*='perex'], [class*='Perex'], [class*='lead'], [class*='desc']";

/** Normalizuje URL článku: absolutní, bez #fragmentu a bez query stringu. */
export function normalizeUrl(href, base) {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    u.search = "";
    u.protocol = "https:";
    return u.toString();
  } catch {
    return null;
  }
}

const isArticle = (url, site) =>
  !!url && site.article.test(url) && !(site.exclude && site.exclude.test(url));

/** Titulek z odkazu a jeho okolí, s „důvěryhodností“ (vyšší = lepší). */
function headlineOf($, a) {
  const $a = $(a);
  const inner = clean($a.find(HEADING).first().text());
  if (inner) return { text: inner, score: 3 };
  const outer = clean($a.closest(HEADING).text());
  if (outer) return { text: outer, score: 3 };
  const own = clean($a.text());
  if (own) return { text: own, score: 1 };
  const attr = clean($a.attr("aria-label") || $a.attr("title") || $a.find("img").attr("alt"));
  if (attr) return { text: attr, score: 0 };
  return { text: "", score: -1 };
}

/**
 * Perex hledáme v nejbližším předkovi odkazu, který ještě obsahuje jen tenhle
 * článek (teaser). Jakmile předek obsahuje víc různých článků, jsme už v
 * seznamu a dál nehledáme.
 */
function perexOf($, a, url, headline, site, base) {
  let node = $(a);
  for (let depth = 0; depth < 6; depth++) {
    node = node.parent();
    if (!node.length || node.is("body")) break;
    const urls = new Set();
    node.find("a[href]").each((_, el) => {
      const u = normalizeUrl($(el).attr("href"), base);
      if (isArticle(u, site)) urls.add(u);
    });
    if (urls.size > 1) break;
    let found = "";
    node.find(PEREX).each((_, el) => {
      const $el = $(el);
      if ($el.find(HEADING).length || $el.is(HEADING)) return;
      const t = clean($el.text());
      if (t.length >= 40 && t !== headline && !headline.includes(t)) {
        found = t;
        return false;
      }
    });
    if (found) return found.length > 400 ? found.slice(0, 397) + "…" : found;
  }
  return "";
}

/**
 * Vytáhne z HTML titulní strany seznam článků v pořadí, v jakém jsou na stránce.
 * @param {string} html
 * @param {import("./sites.js").Site} site
 * @param {{limit?: number, baseUrl?: string}} [opts]
 * @returns {Article[]}
 */
export function extractArticles(html, site, opts = {}) {
  const { limit = 30, baseUrl = site.url } = opts;
  const $ = cheerio.load(html);
  $("script, style, noscript, template, svg, nav, footer, iframe").remove();
  const root = site.scope && $(site.scope).length ? $(site.scope) : $("body");

  /** @type {Map<string, {pos: number, headline: string, score: number, anchor: any}>} */
  const byUrl = new Map();
  let pos = 0;
  root.find("a[href]").each((_, a) => {
    const url = normalizeUrl($(a).attr("href"), baseUrl);
    if (!isArticle(url, site)) return;
    const h = headlineOf($, a);
    const ok = h.text.length >= 12 && h.text.length <= 300;
    const prev = byUrl.get(url);
    if (!prev) {
      byUrl.set(url, { pos: pos++, headline: ok ? h.text : "", score: ok ? h.score : -1, anchor: a });
    } else if (ok && h.score > prev.score) {
      prev.headline = h.text;
      prev.score = h.score;
      prev.anchor = a;
    }
  });

  return [...byUrl.entries()]
    .filter(([, v]) => v.headline)
    .sort((x, y) => x[1].pos - y[1].pos)
    .slice(0, limit)
    .map(([link, v]) => ({
      link,
      headline: v.headline,
      perex: perexOf($, v.anchor, link, v.headline, site, baseUrl),
    }));
}

/**
 * Vytáhne články z RSS kanálu (nejnovější první).
 * @param {string} xml
 * @param {import("./sites.js").Site} site
 * @returns {Article[]}
 */
export function extractFeed(xml, site, { limit = 30 } = {}) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const seen = new Set();
  const out = [];
  $("item").each((_, el) => {
    const $el = $(el);
    const link = normalizeUrl(clean($el.children("link").first().text()), site.url);
    if (!isArticle(link, site) || seen.has(link)) return;
    seen.add(link);
    const headline = clean($el.children("title").first().text());
    // popis bývá HTML uvnitř CDATA
    const perex = clean(cheerio.load(`<div>${$el.children("description").first().text()}</div>`)("div").text());
    if (headline) out.push({ link, headline, perex: perex.length > 400 ? perex.slice(0, 397) + "…" : perex });
  });
  return out.slice(0, limit);
}
