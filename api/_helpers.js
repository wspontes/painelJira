// Helpers compartilhados entre as funções serverless.

function getAuth(req) {
  const site = (req.headers["x-jira-site"] || process.env.JIRA_SITE || "").trim();
  const user = (req.headers["x-jira-user"] || process.env.JIRA_USER || "").trim();
  const token = req.headers["x-jira-token"] || process.env.JIRA_TOKEN || "";
  if (!site || !user || !token) return null;
  return { site, auth: "Basic " + Buffer.from(user + ":" + token).toString("base64") };
}

function jiraFetch(cfg, path) {
  return fetch(`https://${cfg.site}${path}`, {
    headers: { Authorization: cfg.auth, Accept: "application/json" },
  });
}

function adfToText(adf) {
  if (typeof adf === "string") return adf;
  if (!adf || !Array.isArray(adf.content)) return "";
  const parts = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === "text" || node.type === "mention" || node.type === "hardBreak" || node.type === "emoji") {
      parts.push(node.text || (node.type === "hardBreak" ? "\n" : "") || "");
    } else if (node.type === "inlineCard" || node.type === "blockCard") {
      if (node.attrs && node.attrs.url) parts.push(node.attrs.url);
    } else if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem") {
      parts.push("\n");
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  adf.content.forEach(walk);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

// Extrai TODAS as URLs do ADF (text marks link, inlineCard, blockCard)
function adfExtractUrls(adf) {
  if (typeof adf === "string") {
    const urls = adf.match(/https?:\/\/[^\s<>"'}]+/g);
    return urls || [];
  }
  if (!adf || !Array.isArray(adf.content)) return [];
  const urls = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === "text" && Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (mark && mark.type === "link" && mark.attrs && mark.attrs.href) {
          urls.push(mark.attrs.href);
        }
      }
    } else if (node.type === "inlineCard" || node.type === "blockCard") {
      if (node.attrs && node.attrs.url) urls.push(node.attrs.url);
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  adf.content.forEach(walk);
  return urls;
}

function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Converte ADF em HTML seguro, preservando links (mesmo os mascarados via mark "link").
function adfToHtml(adf) {
  if (typeof adf === "string") return escHtml(adf).replace(/\n/g, "<br>");
  if (!adf || !Array.isArray(adf.content)) return "";
  const parts = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === "hardBreak") { parts.push("<br>"); return; }
    if (node.type === "inlineCard" || node.type === "blockCard") {
      const href = node.attrs && node.attrs.url;
      if (href) parts.push(`<a href="${escHtml(href)}" target="_blank" rel="noopener">${escHtml(href)}</a>`);
      return;
    }
    if (node.type === "text" || node.type === "mention" || node.type === "emoji") {
      let text = node.text || "";
      if (node.type === "mention") text = "@" + text;
      const linkMark = Array.isArray(node.marks) && node.marks.find((m) => m && m.type === "link" && m.attrs && m.attrs.href);
      if (node.type === "text" && linkMark) {
        parts.push(`<a href="${escHtml(linkMark.attrs.href)}" target="_blank" rel="noopener">${escHtml(text)}</a>`);
      } else {
        parts.push(escHtml(text));
      }
      return;
    }
    if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem") parts.push("\n");
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  adf.content.forEach(walk);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

function isCustomer(user) {
  if (!user) return false;
  return user.accountType === "customer";
}

function isBot(user) {
  if (!user) return false;
  const n = (user.displayName || "").toLowerCase();
  return n.includes("automation") || n.includes("bot") || n.includes("slack") || user.accountType === "app";
}

// Extrai IDs de aposta/transação/rodada após rótulos como
// "Id da Aposta", "Id da Transação", "ID aposta", "bet id", "transaction id", etc.
// O ID pode ser UUID ou token alfanumérico com -/_ (ex: 15oced-1f1n4i5sj-2100930655247664129).
const BET_TX_LABEL_RE = /(?:id\s*(?:da|de|do)?\s*(?:aposta|transa[cç][aã]o|transation|transaction|bet|round|rodada)|bet\s*id|transaction\s*id|transation\s*id|round\s*id)\s*[:#\-]?\s*([A-Za-z0-9][A-Za-z0-9\-_]{4,80})/gi;

function cleanBetTxToken(tok) {
  return String(tok || "").replace(/[.,;)]+$/g, "").trim();
}

// Extrai UUIDs de "Id da Aposta" e "Id da Transação" do texto
// Padrão: "Id da Aposta<UUID>" ou "Id da Transação<UUID>" (com ou sem espaço/dois pontos)
function extractBetTransactionIds(text) {
  if (!text || typeof text !== "string") return [];
  const out = [];
  const seen = new Set();
  BET_TX_LABEL_RE.lastIndex = 0;
  let match;
  while ((match = BET_TX_LABEL_RE.exec(text)) !== null) {
    const raw = cleanBetTxToken(match[1]);
    if (!raw) continue;
    const id = raw.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const label = match[0].toLowerCase();
    const type = /transa|transation|transaction/.test(label) ? "transacao" : /round|rodada/.test(label) ? "round" : "aposta";
    out.push({ type, id });
  }
  return out;
}

// Extrai TODOS os UUIDs do tipo "Id da Aposta" e "Id da Transação" do texto
function extractAllIds(text) {
  if (!text || typeof text !== "string") return new Set();
  const uuids = new Set();
  BET_TX_LABEL_RE.lastIndex = 0;
  let match;
  while ((match = BET_TX_LABEL_RE.exec(text)) !== null) {
    const raw = cleanBetTxToken(match[1]);
    if (raw) uuids.add(raw.toLowerCase());
  }
  return uuids;
}

module.exports = { getAuth, jiraFetch, adfToText, adfToHtml, adfExtractUrls, extractBetTransactionIds, extractAllIds, isCustomer, isBot };