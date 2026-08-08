// GET /api/queue — visão consolidada da fila (count, resumo, tempo sem resposta).
const { getAuth, jiraFetch, adfToText, isCustomer, isBot } = require("./_helpers");

let memoryCache = null;
const CACHE_TTL_MS = 15000;

function buildTicket(issue, comments) {
  const f = issue.fields || {};
  const reporter = f.reporter || {};
  const created = new Date(f.created).getTime();
  const now = Date.now();

  let lastCustomerActivity = null; // última resposta pública do cliente
  let lastTeamPublicReply = null;  // última RESPOSTA AO CLIENTE da equipe (jsdPublic=true)
  let lastAny = null;              // último comentário (qualquer)

  for (const c of comments || []) {
    const t = new Date(c.created).getTime();
    const author = c.author || {};
    const text = adfToText(c.body);
    const isPublic = c.jsdPublic === true; // false = observação interna
    const isBotC = isBot(author);
    const isCust = isCustomer(author) || (reporter.accountId && author.accountId === reporter.accountId);

    lastAny = {
      ms: t,
      by: author.displayName || "Desconhecido",
      text,
      type: isBotC ? "auto" : isPublic ? "reply" : "note",
      isCustomer: isCust,
    };
    if (isBotC) continue;
    if (isPublic) {
      if (isCust) lastCustomerActivity = t;
      else lastTeamPublicReply = t;
    }
  }

  if (!lastCustomerActivity) lastCustomerActivity = created;

  // "Equipe respondeu por último" conta SOMENTE respostas ao cliente (jsdPublic=true),
  // observações internas não interrompem a espera.
  const waitingSince =
    lastTeamPublicReply && lastTeamPublicReply > lastCustomerActivity ? null : lastCustomerActivity || created;

  const waitingMs = waitingSince ? now - waitingSince : 0;

  return {
    key: issue.key,
    site: process.env.JIRA_SITE || "",
    summary: f.summary || "",
    priority: f.priority ? f.priority.name : null,
    status: f.status ? f.status.name : null,
    statusCategory: f.status && f.status.statusCategory ? f.status.statusCategory.name : null,
    reporter: reporter.displayName || "(automático)",
    assignee: f.assignee ? f.assignee.displayName : null,
    created,
    updated: new Date(f.updated).getTime(),
    ageMs: now - created,
    waitMs: Math.max(waitingMs, 0),
    waitingForTeam: !!waitingSince,
    lastActivityMs: lastAny ? lastAny.ms : null,
    lastActivityBy: lastAny ? lastAny.by : null,
    lastActivityType: lastAny ? lastAny.type : null, // reply | note | auto
    lastActivityIsCustomer: lastAny ? lastAny.isCustomer : false,
    lastActivityText: lastAny && lastAny.text ? lastAny.text.slice(0, 400) : "",
  };
}

function computeSummary(tickets) {
  const waiting = tickets.filter((t) => t.waitingForTeam && t.waitMs > 0);
  const totalWaited = waiting.reduce((a, t) => a + t.waitMs, 0);
  const byPriority = {};
  const byStatus = {};
  tickets.forEach((t) => {
    if (t.priority) byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    if (t.status) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  });
  return {
    total: tickets.length,
    waitingForTeam: waiting.length,
    averageWaitMs: waiting.length ? Math.floor(totalWaited / waiting.length) : 0,
    maxWaitMs: waiting.length ? Math.max(...waiting.map((t) => t.waitMs)) : 0,
    critical: waiting.filter((t) => t.priority === "Highest" || t.priority === "High").length,
    priorityCounts: byPriority,
    statusCounts: byStatus,
  };
}

async function fetchIssues(cfg, jql) {
  const issues = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    let path = `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,priority,reporter,assignee,created,updated,status,labels`;
    if (pageToken) path += `&nextPageToken=${encodeURIComponent(pageToken)}`;
    const res = await jiraFetch(cfg, path);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error("Jira search " + res.status + ": " + txt.slice(0, 300));
    }
    const body = await res.json();
    issues.push(...(body.issues || []));
    if (body.isLast || !body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return issues;
}

async function fetchComments(cfg, key, max = 100) {
  const res = await jiraFetch(cfg, `/rest/api/3/issue/${key}/comment?maxResults=${max}&orderBy=created`);
  if (!res.ok) return [];
  const body = await res.json();
  return (body.comments || []).sort((a, b) => new Date(a.created) - new Date(b.created));
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

    const cfg = getAuth(req);
    if (!cfg) return res.status(401).json({ error: "Credenciais Jira não configuradas (env JIRA_SITE/JIRA_USER/JIRA_TOKEN)." });

    const jql = (req.query.jql || process.env.JQL || "").trim();
    if (!jql) return res.status(400).json({ error: "JQL vazio. Defina a env JQL." });

    const now = Date.now();
    if (memoryCache && now - memoryCache.at < CACHE_TTL_MS && memoryCache.jql === jql) {
      return res.json({ cached: true, generatedAt: memoryCache.at, queue: memoryCache.queue });
    }

    const issues = await fetchIssues(cfg, jql);
    const tickets = await Promise.all(
      issues.map(async (iss) => {
        try {
          const com = await fetchComments(cfg, iss.key);
          return buildTicket(iss, com);
        } catch {
          return buildTicket(iss, []);
        }
      })
    );

    const sorted = tickets
      .slice()
      .sort((a, b) => b.waitMs - a.waitMs)
      .sort((a, b) => (a.priority === "Highest" ? -1 : 1));

    const queue = { generatedAt: now, summary: computeSummary(sorted), tickets: sorted };
    memoryCache = { at: now, jql, queue };
    return res.json({ cached: false, generatedAt: now, queue });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};