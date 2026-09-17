// GET /api/agent-view — tickets por atendente (passaram pelo assignee) dos últimos 60d
const { getAuth, jiraFetch } = require("./_helpers");

let memoryCache = null;
const CACHE_TTL_MS = 60000; // 60s — histórico é mais pesado

// Atendentes alvo (parte do email antes de @ngx.bet) + variações de displayName conhecidas
const TARGET_AGENTS = new Set([
  "alvaro.silva",
  "daniel.silva",
  "elnatan.alves",
  "fabyny.costa",
  "fabyny.vinicius",    // displayName: Fabyny Vinícius
  "keli.martins",
  "rafael.freitas",
  "renata.mendes",      // displayName: Renata Mendes (era renata.duarte)
  "vitoria.odaci",      // displayName: Vitoria Odací Souza Ramos
  "vitoria.ramos",      // sobrenome Ramos está no displayName
  "wesley.silva",
  "weslley.silva",      // displayName: Weslley Silva Pontes (double L)
]);

function normalizeName(str) {
  return str.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]/g, " "); // substitui não-alfanum por espaço
}

function matchesTargetAgent(displayName) {
  if (!displayName) return false;
  const normalized = normalizeName(displayName);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const firstName = words[0];
  const otherWords = words.slice(1);
  
  for (const target of TARGET_AGENTS) {
    const [targetFirst, targetLast] = target.split(".").filter(Boolean);
    // Match primeiro nome (prefixo tolera weslley/wesley)
    const firstMatch = firstName.startsWith(targetFirst) || targetFirst.startsWith(firstName);
    // Match sobrenome: targetLast deve ser prefixo de ALGUMA das outras palavras
    const lastMatch = !targetLast || otherWords.some(w => w.startsWith(targetLast) || targetLast.startsWith(w));
    if (firstMatch && lastMatch) return true;
  }
  return false;
}

function parseChangelogForAssignees(changelog) {
  const assigneeIds = new Set();
  for (const h of changelog?.histories || []) {
    for (const item of h.items || []) {
      if (item.field === "assignee" && item.to) {
        assigneeIds.add(item.to); // accountId do novo assignee
      }
    }
  }
  return assigneeIds;
}

async function fetchIssuesWithChangelog(cfg, jql) {
  const issues = [];
  let pageToken = "";
  for (let page = 0; page < 20; page++) { // max 1000 issues (50*20)
    let path = `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=50&fields=key,summary,status,customfield_10072,assignee,created,updated&expand=changelog`;
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

function isClosedStatus(statusName) {
  if (!statusName) return false;
  const closed = ["fechado", "cancelada", "resolvido", "concluída", "concluida", "recusada", "failed", "done", "closed", "resolved", "cancelled"];
  return closed.some(c => statusName.toLowerCase().includes(c));
}

function buildAgentMap(issues) {
  const agentMap = {}; // accountId -> { name, tickets: [] }
  
  for (const issue of issues) {
    const f = issue.fields || {};
    const assignee = f.assignee;
    const currentTipo = f.customfield_10072?.value || "N1";
    const changelog = issue.changelog;
    
    const assigneeIds = parseChangelogForAssignees(changelog);
    // também inclui assignee atual
    if (assignee?.accountId) assigneeIds.add(assignee.accountId);
    
    // info base do ticket
    const ticketInfo = {
      key: issue.key,
      summary: f.summary || "",
      status: f.status?.name || "",
      tipoSuporte: currentTipo,
      currentAssignee: assignee?.displayName || null,
      updated: f.updated ? new Date(f.updated).getTime() : null,
    };
    
    for (const accId of assigneeIds) {
      if (!agentMap[accId]) {
        agentMap[accId] = { accountId: accId, displayName: "", tickets: [] };
      }
      agentMap[accId].tickets.push(ticketInfo);
    }
  }
  
  // Preenche displayName de cada agente (pega do primeiro ticket onde é assignee atual OU do changelog)
  for (const issue of issues) {
    // 1. Assignee atual
    const a = issue.fields?.assignee;
    if (a?.accountId && agentMap[a.accountId] && !agentMap[a.accountId].displayName) {
      agentMap[a.accountId].displayName = a.displayName;
    }
    // 2. Changelog - pega author das mudanças de assignee
    for (const h of issue.changelog?.histories || []) {
      for (const item of h.items || []) {
        if (item.field === "assignee" && item.to && h.author?.displayName) {
          if (agentMap[item.to] && !agentMap[item.to].displayName) {
            agentMap[item.to].displayName = h.author.displayName;
          }
        }
      }
    }
  }
  
  return agentMap;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });
    
    const cfg = getAuth(req);
    if (!cfg) return res.status(401).json({ error: "Credenciais Jira não configuradas." });
    
    const now = Date.now();
    if (memoryCache && now - memoryCache.at < CACHE_TTL_MS) {
      return res.json({ cached: true, generatedAt: memoryCache.at, agents: memoryCache.agents });
    }
    
    // JQL: projeto SUP, atualizados últimos 60 dias, exclui status fechados
    const jql = 'project = SUP AND updated >= -60d AND status not in (Fechado, Cancelada, Resolvido, Concluída, Recusada, Failed) ORDER BY updated DESC';
    
    const issues = await fetchIssuesWithChangelog(cfg, jql);
    
    // Filtra issues com status fechado (segurança extra além do JQL)
    const openIssues = issues.filter(issue => !isClosedStatus(issue.fields?.status?.name));
    
    const agentMap = buildAgentMap(openIssues);
    
    // Merge agentes com mesmo displayName (ex: mesma pessoa com 2 accountIds no Jira)
    const mergedMap = {};
    for (const agent of Object.values(agentMap)) {
      const key = normalizeName(agent.displayName);
      if (!mergedMap[key]) {
        mergedMap[key] = { ...agent, tickets: [] };
      }
      // Dedup tickets por key
      for (const t of agent.tickets) {
        if (!mergedMap[key].tickets.some(x => x.key === t.key)) {
          mergedMap[key].tickets.push(t);
        }
      }
    }
    
    // Converte para array, ordena por nome, FILTRA SÓ OS 9 ATENDENTES ALVO
    const agents = Object.values(mergedMap)
      .filter(a => matchesTargetAgent(a.displayName))
      .filter(a => a.tickets.some(t => t.tipoSuporte === "N2" || t.tipoSuporte === "N3"))
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
    
    // Para cada agente, filtra SÓ tickets N2/N3 abertos
    for (const agent of agents) {
      agent.tickets = agent.tickets
        .filter(t => t.tipoSuporte === "N2" || t.tipoSuporte === "N3")
        .filter(t => !isClosedStatus(t.status))
        .sort((x, y) => {
          const px = (x.tipoSuporte === "N2" ? 0 : 1);
          const py = (y.tipoSuporte === "N2" ? 0 : 1);
          if (px !== py) return px - py;
          return (y.updated || 0) - (x.updated || 0);
        });
      // Mantém só campos necessários no frontend
      agent.tickets = agent.tickets.map(t => ({
        key: t.key,
        summary: t.summary,
        status: t.status,
        tipoSuporte: t.tipoSuporte,
        currentAssignee: t.currentAssignee,
      }));
    }
    
    memoryCache = { at: now, agents };
    return res.json({ cached: false, generatedAt: now, agents });
    
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};