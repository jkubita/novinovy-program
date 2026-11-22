#!/usr/bin/env node
// Jednoduchý statický server pro složku docs/ (frontend + data) na lokální vývoj.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.DOCS_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "docs");
const PORT = Number(process.env.PORT) || 8080;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, path.endsWith("/") ? path + "index.html" : path);
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": (TYPES[extname(file)] || "application/octet-stream") + "; charset=utf-8", "Cache-Control": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, () => console.log(`Novinárna běží na http://localhost:${PORT}/`));
