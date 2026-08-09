// GET /api/comments?key=SUP-123
const { getAuth, adfToText, adfToHtml, isCustomer } = require("./_helpers");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  try {
    const key = (req.query.key || "").trim();
    if (!key) return res.status(400).json({ error: "Parâmetro key é obrigatório" });

    const cfg = getAuth(req);
    if (!cfg) {
      return res.status(401).json({ error: "Credenciais Jira não configuradas (env JIRA_SITE/JIRA_USER/JIRA_TOKEN)." });
    }

    const r = await fetch(`https://${cfg.site}/rest/api/3/issue/${encodeURIComponent(key)}?fields=comment,reporter`, {
      headers: { Authorization: cfg.auth, Accept: "application/json" },
    });
    if (!r.ok) {
      const txt = await r.text();
      return res.status(r.status).json({ error: "Jira " + r.status + ": " + txt.slice(0, 300) });
    }
    const body = await r.json();
    const reporterAccountId = (body.fields.reporter || {}).accountId;
    const comments = ((body.fields.comment || {}).comments || []).map((c) => {
      const author = c.author || {};
      const isCustomerUser = isCustomer(author) || (author.accountId && author.accountId === reporterAccountId);
      return {
        id: c.id,
        author: author.displayName || "(automático)",
        email: author.emailAddress || null,
        created: c.created ? new Date(c.created).getTime() : null,
        body: adfToText(c.body),
        bodyHtml: adfToHtml(c.body),
        isCustomer: isCustomerUser,
        isPublic: c.jsdPublic === true, // false = observação interna
      };
    });

    return res.json({ key, comments });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};