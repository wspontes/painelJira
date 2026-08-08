// Servidor local de desenvolvimento (sem dependências).
// Roda o dashboard em http://localhost:3001 e as APIs em /api/*.
const http = require("http");
const fs = require("fs");
const path = require("path");

// Carrega .env.local para o process.env (igual ao Vercel)
try {
  const env = fs.readFileSync(path.join(__dirname, ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const PORT = Number(process.env.PORT || 3001);
const PUBLIC_DIR = path.join(__dirname, "public");
const routes = {
  "/api/queue": require("./api/queue"),
  "/api/comments": require("./api/comments"),
};

function makeReq(req, urlObj) {
  return { method: req.method, query: Object.fromEntries(urlObj.searchParams), headers: req.headers, url: req.url };
}

function makeRes(res) {
  return {
    _code: 200,
    status(c) { this._code = c; return this; },
    setHeader(k, v) { res.setHeader(k, v); },
    json(obj) {
      const code = this._code || 200;
      res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(obj));
    },
  };
}

function sendText(res, code, text) {
  res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, "http://localhost");

    if (urlObj.pathname.startsWith("/api/")) {
      const fn = routes[urlObj.pathname];
      if (!fn) return sendText(res, 404, "API não encontrada: " + urlObj.pathname);
      return await fn(makeReq(req, urlObj), makeRes(res));
    }

    // Arquivos estáticos (frontend)
    let rel = urlObj.pathname === "/" ? "index.html" : urlObj.pathname.slice(1);
    rel = path.normalize(rel).replace(/^([.][.][/\\])+/, "");
    const full = path.join(PUBLIC_DIR, rel);
    if (!full.startsWith(PUBLIC_DIR)) return sendText(res, 403, "Forbidden");
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) return sendText(res, 404, "Não encontrado");
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(fs.readFileSync(full));
  } catch (e) {
    sendText(res, 500, e.message + "\n" + (e.stack || ""));
  }
});

server.listen(PORT, () => {
  console.log("Monitor Jira rodando em http://localhost:" + PORT);
  console.log("Fila: " + (process.env.JQL || "(env JQL vazia!)"));
});