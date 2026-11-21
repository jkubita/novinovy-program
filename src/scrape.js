#!/usr/bin/env node
// Stáhne titulní strany všech webů a uloží snímek do docs/data.
//
//   npm run scrape                 všechny weby, uloží data
//   npm run check                  jen vypíše, co by se uložilo (nic nezapisuje)
//   node src/scrape.js idnes hn    jen vybrané weby
//
// Skončí s nenulovým kódem, pokud se nepodařilo stáhnout žádný web.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SITES } from "./sites.js";
import { fetchPage } from "./fetch.js";
import { extractArticles, extractFeed } from "./extract.js";
import { saveSnapshot, updateIndex, pragueDate } from "./store.js";

const DATA_DIR = process.env.DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "data");
const MIN_ARTICLES = 3; // méně článků = parser je nejspíš rozbitý, snímek neukládáme

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.filter((a) => !a.startsWith("--"));
const sites = only.length ? SITES.filter((s) => only.includes(s.id)) : SITES;

const time = Date.now();
const status = {};

const results = await Promise.all(
  sites.map(async (site) => {
    let homepageError = null;
    try {
      const { html, finalUrl } = await fetchPage(site.url);
      const articles = extractArticles(html, site, { baseUrl: finalUrl });
      if (articles.length < MIN_ARTICLES) {
        throw new Error(`nalezeno jen ${articles.length} článků (změnil se web? přesměrování na ${finalUrl})`);
      }
      if (!dryRun) await saveSnapshot(DATA_DIR, site.id, articles, time);
      status[site.id] = { time, ok: true, count: articles.length };
      return { site, articles };
    } catch (e) {
      homepageError = e;
    }
    if (site.feed) {
      try {
        const { html: xml } = await fetchPage(site.feed);
        const articles = extractFeed(xml, site);
        if (articles.length < MIN_ARTICLES) throw new Error(`RSS: nalezeno jen ${articles.length} článků`);
        if (!dryRun) await saveSnapshot(DATA_DIR, site.id, articles, time, "rss");
        status[site.id] = { time, ok: true, count: articles.length, source: "rss", homepageError: String(homepageError.message || homepageError) };
        return { site, articles, source: "rss", homepageError };
      } catch (e) {
        homepageError = new Error(`${homepageError.message}; RSS: ${e.message || e}`);
      }
    }
    status[site.id] = { time, ok: false, error: String(homepageError.message || homepageError) };
    return { site, error: homepageError };
  }),
);

for (const { site, articles, error, source, homepageError } of results) {
  if (error) {
    console.log(`✗ ${site.name}: ${error.message || error}`);
    continue;
  }
  console.log(`✓ ${site.name}: ${articles.length} článků${source ? ` z ${source.toUpperCase()} (titulní strana: ${homepageError.message})` : ""}`);
  for (const a of articles.slice(0, dryRun ? 10 : 3)) {
    console.log(`    ${a.headline}`);
    if (dryRun) console.log(`      ${a.link}${a.perex ? `\n      „${a.perex.slice(0, 100)}“` : ""}`);
  }
}

if (!dryRun) await updateIndex(DATA_DIR, SITES, pragueDate(time), status);

const okCount = results.filter((r) => !r.error).length;
console.log(`\n${okCount}/${results.length} webů v pořádku${dryRun ? " (dry run, nic neuloženo)" : ""}`);
if (okCount === 0) process.exit(1);
