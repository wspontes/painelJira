// Endpoint de versão: informa a versão do deploy + changelog
const fs = require("fs");
const path = require("path");

let cachedVersion = null;
let cachedChangelog = null;

// Changelog embutido (para garantir que funcione no Vercel)
const EMBEDDED_CHANGELOG = [
  { type: "Nova funcionalidade", title: "Notificação para tickets com rodadas duplicadas", description: "Alerta no card quando a mesma rodada/transação (Id da Aposta / Id da Transação) aparece em mais de um ticket da fila." },
  { type: "Nova funcionalidade", title: "Campo de busca por informações dentro do ticket", description: "A busca agora encontra palavras da descrição, dos comentários (notas internas e respostas) e de links/URLs do ticket." },
  { type: "Em desenvolvimento", title: "Tema light/dark", description: "Tema claro/escuro em desenvolvimento: ajustes de cabeçalho e botões no mobile." }
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