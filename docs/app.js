const DATA = "data";
const SLOT = 60 * 60 * 1000; // interval stahování (viz .github/workflows/scrape.yml)

const $ = (id) => document.getElementById(id);
const els = { day: $("day"), prev: $("prev"), next: $("next"), depth: $("depth"), changes: $("changes"), board: $("board"), status: $("status"), detail: $("detail"), body: $("detail-body") };

const fmtTime = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" });
const fmtDateTime = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDay = (d) => new Intl.DateTimeFormat("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let index = null;
let days = {}; // siteId -> denní záznam (nebo null)

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

function renderStatus() {
  if (!index) return;
  const parts = [`Aktualizováno ${fmtDateTime.format(index.updated)}`];
  for (const site of index.sites) {
    const st = index.status?.[site.id];
    if (st && !st.ok) parts.push(`<span class="err" title="${esc(st.error)}">${esc(site.name)}: poslední stažení selhalo</span>`);
  }
  els.status.innerHTML = parts.join(" · ");
}

function render() {
  const depth = Number(els.depth.value);
  const onlyChanges = els.changes.checked;
  const sites = index.sites;

  // Pro každý web: slot -> poslední snímek v tom slotu.
  const bySite = sites.map((s) => {
    const day = days[s.id];
    const m = new Map();
    for (const snap of day?.snapshots ?? []) m.set(Math.floor(snap.time / SLOT), snap);
    return m;
  });
  const slots = [...new Set(bySite.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);

  if (!slots.length) {
    els.board.innerHTML = `<p class="empty-state">Pro tento den zatím nejsou žádná data.</p>`;
    return;
  }

  // Projdeme sloty od nejstaršího a u každé buňky si poznamenáme, co je nové.
  const prev = sites.map(() => null); // poslední známý snímek každého webu
  const rows = [];
  for (const slot of slots) {
    let changed = rows.length === 0;
    const cells = sites.map((site, i) => {
      const snap = bySite[i].get(slot);
      if (!snap) return null;
      const day = days[site.id];
      const before = prev[i];
      const beforeTop = before ? before.top.slice(0, depth) : [];
      const items = snap.top.slice(0, depth).map((idx, rank) => {
        const a = day.articles[idx];
        const headline = headlineAt(a, snap.time);
        const isNew = !beforeTop.includes(idx);
        const edited = !isNew && headlineAt(a, before.time) !== headline;
        const moved = !isNew && beforeTop.indexOf(idx) !== rank;
        if (isNew || edited || moved) changed = true;
        return { idx, rank, headline, isNew: isNew && !!before, edited };
      });
      if (!before) changed = true;
      prev[i] = snap;
      return items;
    });
    if (changed || !onlyChanges) rows.push({ slot, cells });
  }

  const html = [`<div class="grid" style="--cols:${sites.length}">`, `<div class="head time"></div>`];
  for (const s of sites) html.push(`<div class="head" style="--site:${s.color}"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a></div>`);
  for (const row of rows) {
    html.push(`<div class="time">${fmtTime.format(row.slot * SLOT)}</div>`);
    row.cells.forEach((items, i) => {
      const s = sites[i];
      if (!items) return html.push(`<div class="cell empty" style="--site:${s.color}" title="Žádný snímek"></div>`);
      html.push(`<div class="cell" style="--site:${s.color}"><ul class="items">`);
      for (const it of items) {
        const cls = ["item", `rank-${it.rank}`, it.isNew ? "new" : "same", it.edited ? "changed" : ""].join(" ");
        html.push(`<li><button type="button" class="${cls}" data-site="${s.id}" data-idx="${it.idx}" data-key="${s.id}:${it.idx}">${esc(it.headline)}</button></li>`);
      }
      html.push(`</ul></div>`);
    });
  }
  html.push(`</div>`);
  els.board.innerHTML = html.join("");
}

function showDetail(siteId, idx) {
  const site = index.sites.find((s) => s.id === siteId);
  const day = days[siteId];
  const a = day.articles[idx];
  const depth = Number(els.depth.value);
  const onTop = day.snapshots.filter((s) => s.top.slice(0, depth).includes(idx));
  const best = Math.min(...day.snapshots.filter((s) => s.top.includes(idx)).map((s) => s.top.indexOf(idx)));
  const minutes = onTop.length * (SLOT / 60000);
  const dur = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  els.body.innerHTML = `
    <div class="site">${esc(site.name)}</div>
    <h2>${esc(a.headline)}</h2>
    ${a.perex ? `<p class="perex">${esc(a.perex)}</p>` : ""}
    <dl>
      <dt>Poprvé na titulce</dt><dd>${fmtDateTime.format(a.firstSeen)}</dd>
      <dt>Naposledy</dt><dd>${fmtDateTime.format(a.lastSeen)}</dd>
      <dt>Nejvyšší pozice</dt><dd>${best + 1}.</dd>
      <dt>V top ${depth}</dt><dd>${onTop.length ? `asi ${dur}` : "ne"}</dd>
    </dl>
    ${a.history.length ? `<p><strong>Změny titulku</strong></p><ol>${a.history.map((h) => `<li>${fmtTime.format(h.time)}: ${esc(h.headline)}</li>`).join("")}</ol>` : ""}
    <a class="go" href="${esc(a.link)}" target="_blank" rel="noopener">Otevřít článek ↗</a>`;
  els.detail.showModal();
}

async function loadDay(date) {
  els.board.innerHTML = `<p class="empty-state">Načítám…</p>`;
  const loaded = await Promise.all(index.sites.map((s) => getJson(`${DATA}/${date}/${s.id}.json`).catch(() => null)));
  days = Object.fromEntries(index.sites.map((s, i) => [s.id, loaded[i]]));
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
  renderStatus();
  els.day.innerHTML = [...index.days].reverse().map((d) => `<option value="${d}">${fmtDay(d)}</option>`).join("");
  const go = (d) => { location.hash = d; };
  els.day.addEventListener("change", () => go(els.day.value));
  els.prev.addEventListener("click", () => go(index.days[index.days.indexOf(els.day.value) - 1]));
  els.next.addEventListener("click", () => go(index.days[index.days.indexOf(els.day.value) + 1]));
  els.depth.addEventListener("change", render);
  els.changes.addEventListener("change", render);
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
  els.detail.addEventListener("click", (e) => { if (e.target === els.detail) els.detail.close(); });

  await loadDay(currentDay());
}

init();
