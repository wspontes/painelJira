// GET /api/duplicate-check — verifica tickets duplicados por ID de aposta/transação
const { getAuth, jiraFetch } = require("./_helpers");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });
    
    const cfg = getAuth(req);
    if (!cfg) return res.status(401).json({ error: "Credenciais Jira não configuradas." });
    
    // Pega apenas tickets N1 (usa JQL do ambiente)
    const jql = (process.env.JQL || "").trim();
    if (!jql) return res.status(400).json({ error: "JQL não configurada." });
    
    // Reutiliza cache da queue API se disponível
    // Como não temos acesso direto ao cache da queue, fazemos uma busca simplificada
    // Apenas 1 página (50 tickets) para evitar timeout
    const issues = await fetchIssues(cfg, jql, 1);
    
    // Mapa: UUID -> array de tickets que contêm esse ID
    const idToTickets = new Map();
    
    for (const issue of issues) {
      const f = issue.fields || {};
      const descText = f.description ? (typeof f.description === "string" ? f.description : JSON.stringify(f.description)) : "";
      const foundIds = extractAllIds(descText);
      
      if (foundIds.size > 0) {
        for (const id of foundIds) {
          if (!idToTickets.has(id)) idToTickets.set(id, []);
          idToTickets.get(id).push(issue.key);
        }
      }
    }
    
    // Filtra apenas IDs que aparecem em mais de 1 ticket
    const duplicates = {};
    for (const [id, tickets] of idToTickets.entries()) {
      if (tickets.length > 1) {
        duplicates[id] = tickets;
      }
    }
    
    return res.json({ cached: false, generatedAt: Date.now(), duplicates });
    
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

async function fetchIssues(cfg, jql, maxPages = 1) {
  const issues = [];
  let pageToken = "";
  for (let page = 0; page < maxPages; page++) {
    let path = `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,description`;
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

