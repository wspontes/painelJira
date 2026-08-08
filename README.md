# 🔥 Monitor da Fila N1 — Jira

Dashboard que investiga a fila **N1 | Bugs | Todos os tickets abertos** (queue 23 do projeto SUP) e mostra:
- Quantidade de tickets abertos e agrupamentos por prioridade/status
- Resumo rápido de cada ticket (cliente, atendente, há quanto tempo, último comentário)
- **Tempo sem resposta da equipe** (quando o cliente fez a última atividade e a equipe ainda não respondeu)
- **Notificações** do navegador quando entra um ticket novo ou o cliente comenta
- Pesquisa, filtros e ordenação; clique no ticket para ver histórico de comentários

## Arquitetura

```
jira-queue-monitor/
├── api/
│   ├── _helpers.js    → auth + utilitários (ADF → texto, isCustomer, isBot)
│   ├── queue.js       → GET /api/queue    (lista + resumo + espera)
│   └── comments.js    → GET /api/comments (histórico de um ticket)
├── public/            → frontend estático (enviado pelo Vercel)
├── server.js          → servidor local SEM dependências (dev)
├── vercel.json        → config de deploy
└── .env.local         → credenciais LOCAIS (nunca versionado!)
```

- **Vercel**: a pasta `api/` gera Functions serverless e `public/` é servida como site estático. O token do Jira fica como variável de ambiente no Vercel (nunca exposto).
- **Local**: `server.js` lê `.env.local`, serve o frontend e as 2 APIs.

## Rodar localmente

1. Preencha `.env.local` (use `.env.example` como molde):
   - `JIRA_SITE`, `JIRA_USER` (email) e `JIRA_TOKEN` (API token Atlassian)
   - `JQL` da fila que deseja monitorar
2. `node server.js` (ou `npm run dev`)
3. Abra `http://localhost:3001`

> Dica: altere `localStorage.refresh` no console do navegador para mudar o intervalo (ms, padrão 30000).

## Deploy no Vercel

1. Instale a CLI: `npm i -g vercel`
2. Na pasta do projeto: `vercel login` e `vercel`
3. Configure as variáveis de ambiente no painel (Settings → Environment Variables):
   - `JIRA_SITE`, `JIRA_USER`, `JIRA_TOKEN`, `JQL`
4. `vercel --prod` para publicar. A equipe acessa o URL gerado em cada máquina.

**Segurança:** o token fica apenas no servidor (Vercel). Ninguém da equipe precisa ver a credencial. Rotacione o token se ele for exposto em repositório ou chat.

## Nota sobre o "tempo sem resposta"

O sistema considera que o cliente está **aguardando a equipe** quando o cliente fez a última atividade (comentário ou criação do ticket) e nenhum colega da equipe respondeu depois. Comentários de automação (bots) são ignorados para essa conta. Serviços de automação ("Automation for Jira", etc.) não contam como resposta humana.