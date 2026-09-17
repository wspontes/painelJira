// Endpoint de versão: informa a versão do deploy + changelog
const fs = require("fs");
const path = require("path");

let cachedVersion = null;
let cachedChangelog = null;

// Changelog embutido (para garantir que funcione no Vercel)
const EMBEDDED_CHANGELOG = [
  { type: "Nova funcionalidade", title: "Contador regressivo do auto-refresh", description: "Contador regressivo no chip de status mostrando o tempo até a próxima atualização automática (ex: \"↻ 25s\"). Reinicia a cada refresh." },
  { type: "Nova funcionalidade", title: "ESC fecha qualquer modal", description: "A tecla ESC agora fecha qualquer modal/painel aberto: visualizador de links, painel de links, painel de escalados, painel de som, painel de atendente/organização, detalhe do ticket e banner de atualização." },
  { type: "Nova funcionalidade", title: "Tema claro/escuro", description: "Toggle de tema no header (botão 🌙/☀️). Salva a preferência no localStorage e aplica automaticamente ao carregar. Tema escuro é o padrão." },
  { type: "Melhoria", title: "Banner de nova versão com changelog", description: "O banner de nova versão agora mostra um botão \"Ver novidades\" que abre um modal com o changelog detalhado da nova versão antes de atualizar." },
  { type: "Melhoria", title: "Banner de Jira fora do ar", description: "Detecção automática de queda do Jira com banner pulsante, som específico, notificação persistente e log de tempo de indisponibilidade (ex: \"fora de 12:00 às 13:00\")." },
  { type: "Correção", title: "Linha de status do ticket", description: "Correção na exibição do tempo da última resposta ao cliente (usa lastTeamPublicReplyMs) e separação da última nota interna." }
];

function getVersion() {
  if (cachedVersion) return cachedVersion;
  
  // 1. Vercel Git commit SHA
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    cachedVersion = process.env.VERCEL_GIT_COMMIT_SHA;
    return cachedVersion;
  }
  
  // 2. Source version (outros CI/CD)
  if (process.env.SOURCE_VERSION) {
    cachedVersion = process.env.SOURCE_VERSION;
    return cachedVersion;
  }
  
  // 3. Arquivo version.txt gerado no build
  try {
    const versionPath = path.join(__dirname, "..", "version.txt");
    if (fs.existsSync(versionPath)) {
      cachedVersion = fs.readFileSync(versionPath, "utf8").trim();
      if (cachedVersion) return cachedVersion;
    }
  } catch (e) {}
  
  // 4. Fallback
  cachedVersion = "local";
  return cachedVersion;
}

function getChangelog() {
  if (cachedChangelog) return cachedChangelog;
  // Tenta ler do arquivo primeiro (se disponível no build local)
  try {
    const changelogPath = path.join(__dirname, "..", "CHANGELOG.json");
    if (fs.existsSync(changelogPath)) {
      const content = fs.readFileSync(changelogPath, "utf8");
      cachedChangelog = JSON.parse(content);
      return cachedChangelog;
    }
  } catch (e) {}
  // Fallback para changelog embutido
  cachedChangelog = EMBEDDED_CHANGELOG;
  return cachedChangelog;
}

module.exports = (req, res) => {
  res.status(200).json({
    version: getVersion(),
    changelog: getChangelog(),
    generatedAt: Date.now(),
  });
};