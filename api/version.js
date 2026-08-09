// Endpoint de versão: informa o SHA do commit atual (para detectar novo deploy em máquinas abertas)
module.exports = (req, res) => {
  res.status(200).json({
    version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.SOURCE_VERSION || "local",
    generatedAt: Date.now(),
  });
};