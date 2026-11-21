import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addSnapshot, pragueDate, saveSnapshot, updateIndex, TOP_N } from "../src/store.js";

const art = (n, headline = `Titulek ${n}`) => ({ link: `https://x.cz/${n}`, headline, perex: "" });
const empty = () => ({ site: "x", date: "2026-11-21", articles: [], snapshots: [] });

test("pragueDate respektuje pražskou časovou zónu", () => {
  assert.equal(pragueDate(Date.UTC(2026, 10, 20, 23, 30)), "2026-11-21"); // 00:30 SEČ
  assert.equal(pragueDate(Date.UTC(2026, 6, 20, 22, 30)), "2026-07-21"); // 00:30 SELČ
  assert.equal(pragueDate(Date.UTC(2026, 6, 20, 21, 30)), "2026-07-20");
});

test("addSnapshot znovu použije existující články a zaznamená změnu titulku", () => {
  const day = empty();
  addSnapshot(day, [art(1), art(2)], 1000);
  addSnapshot(day, [art(3), art(1, "Nový titulek 1")], 2000);
  assert.equal(day.articles.length, 3);
  assert.deepEqual(day.snapshots, [{ time: 1000, top: [0, 1] }, { time: 2000, top: [2, 0] }]);
  const a1 = day.articles[0];
  assert.equal(a1.headline, "Nový titulek 1");
  assert.equal(a1.lastSeen, 2000);
  assert.deepEqual(a1.history, [{ time: 1000, headline: "Titulek 1" }, { time: 2000, headline: "Nový titulek 1" }]);
  assert.equal(day.articles[1].lastSeen, 1000);
});

test("addSnapshot zaznamená zdroj snímku jen když není z titulní strany", () => {
  const day = empty();
  addSnapshot(day, [art(1)], 1);
  addSnapshot(day, [art(1)], 2, "rss");
  assert.deepEqual(day.snapshots, [{ time: 1, top: [0] }, { time: 2, top: [0], source: "rss" }]);
});

test("addSnapshot ukládá nejvýš TOP_N článků", () => {
  const day = addSnapshot(empty(), Array.from({ length: 25 }, (_, i) => art(i)), 1);
  assert.equal(day.snapshots[0].top.length, TOP_N);
  assert.equal(day.articles.length, TOP_N);
});

test("saveSnapshot a updateIndex zapisují soubory podle dne", async () => {
  const dir = await mkdtemp(join(tmpdir(), "np-"));
  const t = Date.UTC(2026, 10, 21, 9, 0);
  await saveSnapshot(dir, "idnes", [art(1)], t);
  await saveSnapshot(dir, "idnes", [art(1), art(2)], t + 900000);
  await updateIndex(dir, [{ id: "idnes", name: "iDNES", color: "#f00", url: "https://www.idnes.cz/" }], "2026-11-21", { idnes: { ok: true } });
  const day = JSON.parse(await readFile(join(dir, "2026-11-21", "idnes.json"), "utf8"));
  assert.equal(day.snapshots.length, 2);
  const index = JSON.parse(await readFile(join(dir, "index.json"), "utf8"));
  assert.deepEqual(index.days, ["2026-11-21"]);
  assert.equal(index.sites[0].id, "idnes");
});
