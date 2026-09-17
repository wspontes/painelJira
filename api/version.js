// Endpoint de versão: informa a versão do deploy
// Prioridade: 1) VERCEL_GIT_COMMIT_SHA (Vercel), 2) SOURCE_VERSION (outros), 3) arquivo version.txt (build), 4) "local"
const fs = require("fs");
const path = require("path");

let cachedVersion = null;

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
      return cachedVersion;
    }
  } catch (e) {}
  
  // 4. Fallback
  cachedVersion = "local";
  return cachedVersion;
}

module.exports = (req, res) => {
  res.status(200).json({
    version: getVersion(),
    generatedAt: Date.now(),
  });
};