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
    } else if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem") {
      parts.push("\n");
    }
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

module.exports = { getAuth, jiraFetch, adfToText, isCustomer, isBot };