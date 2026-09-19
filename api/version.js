// Endpoint de versão: informa a versão do deploy + changelog
const fs = require("fs");
const path = require("path");

let cachedVersion = null;
let cachedChangelog = null;

// Changelog embutido (para garantir que funcione no Vercel)
const EMBEDDED_CHANGELOG = [
  { type: "Correção", title: "Ver novidades abre o modal", description: "Correção do formato do changelog (array/objeto) e proteção contra modal vazio ao conferir novidades." },
  { type: "Melhoria", title: "Banner de atualização no mobile", description: "Banner empilhado com botões em altura de toque (44px), sem sobreposição entre Ver novidades e Atualizar." },
  { type: "Melhoria", title: "Atualizações sem hard refresh", description: "Arquivos com versão na URL (?v=) para o navegador buscar o JS/CSS novo a cada release." }
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