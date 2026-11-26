const DATA = "data";
const SLOT = 60 * 60 * 1000; // interval stahování (viz .github/workflows/scrape.yml)
// Výška jedné hodiny na časové ose podle počtu článků. Na mobilu je sloupec užší
// a titulky se lámou do více řádků, proto potřebuje víc místa.
const HOUR_PX = { 1: 165, 3: 270, 5: 380 };
const HOUR_PX_MOBILE = { 1: 175, 3: 300, 5: 420 };

const $ = (id) => document.getElementById(id);
const els = { day: $("day"), prev: $("prev"), next: $("next"), depth: $("depth"), board: $("board"), picker: $("picker"), detail: $("detail"), body: $("detail-body") };

const fmtTime = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" });
const fmtDateTime = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDay = (d) => new Intl.DateTimeFormat("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const COLS = 6; // počet sloupců; čtenář si v každém vybírá médium
const STORE_KEY = "novinarna.sloupce";

let index = null;
let date = null;
let days = {}; // siteId -> denní záznam (nebo null) pro aktuální den
let cols = []; // id médií v jednotlivých sloupcích
// EXPERIMENT: jen jeden sloupec i na počítači; médium si čtenář vybírá v záhlaví.
// Pro návrat k šesti sloupcům na počítači stačí nastavit SINGLE_COLUMN = false.
const SINGLE_COLUMN = true;
const mobile = window.matchMedia("(max-width: 600px)");
const singleView = () => SINGLE_COLUMN || mobile.matches;
const markSingle = () => document.documentElement.classList.toggle("single", singleView());
markSingle();

/** Uložený výběr sloupců, doplněný a očištěný podle aktuálního seznamu webů. */
function loadCols() {
  const ids = index.sites.map((s) => s.id);
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch {}
  const out = [];
  for (const id of Array.isArray(saved) ? saved : []) if (ids.includes(id) && !out.includes(id)) out.push(id);
  for (const id of ids) if (out.length < Math.min(COLS, ids.length) && !out.includes(id)) out.push(id);
  return out.slice(0, COLS);
}
function saveCols() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(cols)); } catch {}
}
const siteById = (id) => index.sites.find((s) => s.id === id);

async function getJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** Titulek článku platný v čase `time` (zohlední pozdější úpravy titulku). */
function headlineAt(article, time) {
  let h = article.history.length ? article.history[0].headline : article.headline;
  for (const entry of article.history) if (entry.time <= time) h = entry.headline;
  return h;
}


const slotStart = (time) => Math.floor(time / SLOT) * SLOT;

/**
 * Rozdělí den jednoho webu na bloky: úseky, během kterých se nezměnilo
 * pořadí prvních `depth` článků. Každý blok trvá od prvního snímku do
 * dalšího odlišného snímku (výpadek stahování blok ukončí).
 */
function toBlocks(day, depth) {
  const blocks = [];
  let cur = null;
  for (const snap of day?.snapshots ?? []) {
    const top = snap.top.slice(0, depth);
    const key = top.join(",") + (snap.source ? `|${snap.source}` : "");
    const start = slotStart(snap.time);
    // Dva snímky ve stejné hodině (např. budík + ruční spuštění): platí ten pozdější,
    // jinak by z prvního zbyl blok nulové délky.
    if (cur && start === cur.start) {
      blocks.pop();
      cur = blocks[blocks.length - 1] ?? null;
    }
    if (cur && cur.key === key && start - cur.end < SLOT / 2) {
      cur.end = start + SLOT;
      continue;
    }
    if (cur && start < cur.end) cur.end = start;
    cur = { key, top, start, end: start + SLOT, time: snap.time, source: snap.source };
    blocks.push(cur);
  }
  return blocks;
}

function render() {
  const depth = Number(els.depth.value);
  const sites = (singleView() ? cols.slice(0, 1) : cols).map(siteById);
  const perSite = sites.map((s) => toBlocks(days[s.id], depth));
  const all = perSite.flat();

  // Bez dat zobrazíme aspoň záhlaví s výběrem médií, ať jde sloupec přepnout.
  const now = Date.now();
  const t0 = all.length ? Math.min(...all.map((b) => b.start)) : slotStart(now);
  const t1 = all.length ? Math.max(...all.map((b) => b.end)) : slotStart(now) + SLOT;
  const hourPx = (mobile.matches ? HOUR_PX_MOBILE : HOUR_PX)[depth] ?? 170;
  const y = (t) => ((t - t0) / 3600000) * hourPx;
  const height = y(t1);

  const html = [`<div class="timeline" style="--cols:${sites.length}">`];

  // Výběr média: v režimu jednoho sloupce uprostřed horní lišty,
  // jinak jako záhlaví sloupců (lepí se k hornímu okraji okna).
  const headHtml = (s, i) => {
    const opts = index.sites.map((o) => `<option value="${o.id}"${o.id === s.id ? " selected" : ""}>${esc(o.name)}</option>`).join("");
    return `<div class="head" style="--site:${s.color}">`
      + `<div class="row"><label class="pick"><span class="name">${esc(s.name)}</span><select data-col="${i}" aria-label="Vybrat médium">${opts}</select></label>`
      + `<a class="visit" href="${esc(s.url)}" target="_blank" rel="noopener" title="Otevřít ${esc(s.name)}" aria-label="Otevřít ${esc(s.name)}">↗</a></div></div>`;
  };
  if (singleView()) {
    els.picker.innerHTML = headHtml(sites[0], 0);
  } else {
    els.picker.innerHTML = "";
    html.push(`<div class="heads"><div class="corner"></div>${sites.map(headHtml).join("")}</div>`);
  }
  html.push(`<div class="lanes" style="height:${height}px">`);

  // Časová osa s hodinami.
  html.push(`<div class="axis">`);
  for (let t = t0; t < t1; t += 3600000) html.push(`<div class="tick" style="top:${y(t)}px">${fmtTime.format(t)}</div>`);
  html.push(`</div>`);

  sites.forEach((s, i) => {
    const day = days[s.id];
    html.push(`<div class="lane" style="--site:${s.color}">`);
    if (!perSite[i].length) {
      html.push(`<p class="lane-empty">Pro tento den zatím bez dat.</p></div>`);
      return;
    }
    let prevTop = [];
    for (const b of perSite[i]) {
      html.push(`<section class="block" style="top:${y(b.start)}px;height:${y(b.end) - y(b.start)}px"><div class="block-content">`);
      const src = b.source === "rss" ? ` · <span class="src" title="Titulní stranu nešlo stáhnout, články jsou z RSS kanálu seřazené podle času vydání, ne podle důležitosti.">nejnovější z RSS</span>` : "";
      html.push(`<div class="when">${fmtTime.format(b.start)}–${fmtTime.format(b.end)}${src}</div>`);
      b.top.forEach((idx, rank) => {
        const a = day.articles[idx];
        const fresh = !prevTop.includes(idx);
        const cls = ["item", `rank-${rank}`, fresh ? "new" : "same"].join(" ");
        html.push(`<button type="button" class="${cls}" data-site="${s.id}" data-idx="${idx}" data-key="${s.id}:${idx}">`);
        html.push(`<span class="headline">${esc(headlineAt(a, b.time))}</span>`);
        if (rank === 0 && a.perex) html.push(`<span class="perex">${esc(a.perex)}</span>`);
        html.push(`</button>`);
      });
      html.push(`</div></section>`);
      prevTop = b.top;
    }
    html.push(`</div>`);
  });

  html.push(`</div></div>`);
  els.board.innerHTML = html.join("");
}

function showDetail(siteId, idx) {
  const site = siteById(siteId);
  const day = days[siteId];
  const a = day.articles[idx];
  const depth = Number(els.depth.value);
  const onTop = day.snapshots.filter((s) => s.top.slice(0, depth).includes(idx));
  const best = Math.min(...day.snapshots.filter((s) => s.top.includes(idx)).map((s) => s.top.indexOf(idx)));
  const minutes = onTop.length * (SLOT / 60000);
  const dur = minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}` : `${minutes} min`;
  els.body.innerHTML = `
    <div class="site">${esc(site.name)}</div>
    <h2>${esc(a.headline)}</h2>
    ${a.perex ? `<p class="perex">${esc(a.perex)}</p>` : ""}
    <dl>
      <dt>Poprvé na titulce</dt><dd>${fmtDateTime.format(a.firstSeen)}</dd>
      <dt>Naposledy</dt><dd>${fmtDateTime.format(a.lastSeen)}</dd>
      <dt>Nejvyšší pozice</dt><dd>${best + 1}.</dd>
      <dt>${depth === 1 ? "Hlavním článkem" : `V top ${depth}`}</dt><dd>${onTop.length ? `asi ${dur}` : "ne"}</dd>
    </dl>
    ${a.history.length ? `<p><strong>Změny titulku</strong></p><ol>${a.history.map((h) => `<li>${fmtTime.format(h.time)}: ${esc(h.headline)}</li>`).join("")}</ol>` : ""}
    <a class="go" href="${esc(a.link)}" target="_blank" rel="noopener">Otevřít článek ↗</a>`;
  els.detail.showModal();
}

/** Načte data zobrazených médií, která pro aktuální den ještě nemáme. */
async function ensureLoaded() {
  const missing = cols.filter((id) => !(id in days));
  const loaded = await Promise.all(missing.map((id) => getJson(`${DATA}/${date}/${id}.json`).catch(() => null)));
  missing.forEach((id, i) => { days[id] = loaded[i]; });
}

async function loadDay(d) {
  els.board.innerHTML = `<p class="empty-state">Načítám…</p>`;
  date = d;
  days = {};
  await ensureLoaded();
  const i = index.days.indexOf(date);
  els.prev.disabled = i <= 0;
  els.next.disabled = i >= index.days.length - 1;
  els.day.value = date;
  render();
}

function currentDay() {
  const h = decodeURIComponent(location.hash.slice(1));
  return index.days.includes(h) ? h : index.days[index.days.length - 1];
}

async function init() {
  try {
    index = await getJson(`${DATA}/index.json`);
  } catch {
    els.board.innerHTML = `<p class="empty-state">Zatím žádná data. Spusťte <code>npm run scrape</code> nebo počkejte na první automatické stažení.</p>`;
    return;
  }
  cols = loadCols();
  els.day.innerHTML = [...index.days].reverse().map((d) => `<option value="${d}">${fmtDay(d)}</option>`).join("");
  const go = (d) => { location.hash = d; };
  els.day.addEventListener("change", () => go(els.day.value));
  els.prev.addEventListener("click", () => go(index.days[index.days.indexOf(els.day.value) - 1]));
  els.next.addEventListener("click", () => go(index.days[index.days.indexOf(els.day.value) + 1]));
  els.depth.addEventListener("change", render);
  window.addEventListener("hashchange", () => loadDay(currentDay()));

  els.board.addEventListener("click", (e) => {
    const b = e.target.closest(".item");
    if (b) showDetail(b.dataset.site, Number(b.dataset.idx));
  });
  let hl = null;
  els.board.addEventListener("mouseover", (e) => {
    const key = e.target.closest(".item")?.dataset.key ?? null;
    if (key === hl) return;
    els.board.querySelectorAll(".item.hl").forEach((n) => n.classList.remove("hl"));
    if (key) els.board.querySelectorAll(`.item[data-key="${CSS.escape(key)}"]`).forEach((n) => n.classList.add("hl"));
    hl = key;
  });
  mobile.addEventListener("change", () => { markSingle(); render(); });
  // Výběr média ve sloupci. Když už je médium v jiném sloupci, sloupce se prohodí.
  document.addEventListener("change", async (e) => {
    const sel = e.target.closest("select[data-col]");
    if (!sel) return;
    const col = Number(sel.dataset.col);
    const other = cols.indexOf(sel.value);
    if (other !== -1) cols[other] = cols[col];
    cols[col] = sel.value;
    saveCols();
    await ensureLoaded();
    render();
  });
  els.detail.addEventListener("click", (e) => { if (e.target === els.detail) els.detail.close(); });

  await loadDay(currentDay());
}

init();
