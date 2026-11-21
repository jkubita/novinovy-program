import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join, dirname } from "node:path";

// Formát dat (jeden soubor na web a den, dny podle času v Praze):
//
// data/2026-11-21/idnes.json
// {
//   "site": "idnes", "date": "2026-11-21",
//   "articles": [ { link, headline, perex, firstSeen, lastSeen, history: [{time, headline}] } ],
//   "snapshots": [ { time, top: [indexy do articles, v pořadí na stránce] } ]
// }
//
// `history` obsahuje jen pozdější změny titulku. Původní titulek je
// v `history[0]`, pokud se titulek měnil, jinak je history prázdné.

export const TOP_N = 10;

/** Datum ve tvaru YYYY-MM-DD v časové zóně Europe/Prague. */
export function pragueDate(time) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  await writeFile(tmp, JSON.stringify(data) + "\n");
  await rename(tmp, path);
}

/**
 * Přidá jeden snímek titulní strany do denního souboru (čistá funkce).
 * @param {object} day  existující denní záznam
 * @param {import("./extract.js").Article[]} articles  články v pořadí na stránce
 * @param {number} time  ms od epochy
 */
export function addSnapshot(day, articles, time) {
  const index = new Map(day.articles.map((a, i) => [a.link, i]));
  const top = [];
  for (const a of articles.slice(0, TOP_N)) {
    let i = index.get(a.link);
    if (i === undefined) {
      i = day.articles.length;
      day.articles.push({ link: a.link, headline: a.headline, perex: a.perex, firstSeen: time, lastSeen: time, history: [] });
      index.set(a.link, i);
    } else {
      const rec = day.articles[i];
      rec.lastSeen = time;
      if (!rec.perex && a.perex) rec.perex = a.perex;
      if (a.headline !== rec.headline) {
        if (rec.history.length === 0) rec.history.push({ time: rec.firstSeen, headline: rec.headline });
        rec.history.push({ time, headline: a.headline });
        rec.headline = a.headline;
      }
    }
    if (!top.includes(i)) top.push(i);
  }
  day.snapshots.push({ time, top });
  return day;
}

export async function saveSnapshot(dataDir, siteId, articles, time) {
  const date = pragueDate(time);
  const path = join(dataDir, date, `${siteId}.json`);
  const day = await readJson(path, { site: siteId, date, articles: [], snapshots: [] });
  addSnapshot(day, articles, time);
  await writeJson(path, day);
  return { date, path };
}

/** Aktualizuje data/index.json: seznam webů, dostupné dny a stav posledního běhu. */
export async function updateIndex(dataDir, sites, date, status) {
  const path = join(dataDir, "index.json");
  const index = await readJson(path, { sites: [], days: [], status: {} });
  index.sites = sites.map(({ id, name, color, url }) => ({ id, name, color, url }));
  if (!index.days.includes(date)) index.days.push(date);
  index.days.sort();
  index.status = { ...index.status, ...status };
  index.updated = Date.now();
  await writeJson(path, index);
}
