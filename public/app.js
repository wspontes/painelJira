// Monitor da Fila N1 — Jira (client-side)
(() => {
  "use strict";

  const REFRESH = parseInt(localStorage.getItem("refresh") || "30000", 10);

  const state = {
    queue: null,
    filter: "all",
    sort: "wait",
    search: "",
    group: null, // { type: "org" | "assignee", value: string }
    paused: false,
    lastSeen: {},
    notifyEnabled: "Notification" in window && Notification.permission === "granted",
    version: null,
    soundId: "default", // som selecionado
    theme: "dark", // "dark" | "light"
    refreshCountdown: REFRESH,
    upgradeChangelog: null,
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Escapa e transforma URLs (http/https) em links clicáveis
  const linkify = (s) =>
    esc(s).replace(/(https?:\/\/[^\s<"')}\]]+)/g, '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>');

  const fmtAgo = (ts) => {
    if (!ts) return "—";
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return "agora";
    if (m < 60) return m + "min";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h" + (m % 60 ? " " + (m % 60) + "min" : "");
    const d = Math.floor(h / 24);
    return d + "d " + (h % 24) + "h";
  };
  const fmtDur = (ms) => {
    if (!ms || ms < 0) return "0min";
    const m = Math.floor(ms / 60000);
    if (m < 60) return m + "min";
    const h = Math.floor(m / 60);
    if (h < 48) return h + "h " + (m % 60) + "min";
    const d = Math.floor(h / 24);
    if (d < 30) return d + "d " + (h % 24) + "h";
    return d + "d";
  };
  const fmtDate = (ts) => new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const PRIO = { Highest: 0, High: 1, Medium: 2, Low: 3, Lowest: 4 };

  // Links rapidos (configuraveis) — editar aqui
  const LINKS = [
    { label: "Sportsbook", url: "https://sdk.sandbox-ngx.bet/", icon: "\u26BD", mobile: true },
    { label: "Alpha", url: "https://cloudwatch.amazonaws.com/dashboard.html?dashboard=ALPHA_2025&context=eyJSIjoidXMtZWFzdC0xIiwiRCI6ImN3LWRiLTAxMDc5NzEzNTY4NSIsIlUiOiJ1cy1lYXN0LTFfUjZ6QXhXeEpUIiwiQyI6IjFrNTc3MmVkdnFhY3ZhOWE4aHM4MDFhOG5mIiwiSSI6InVzLWVhc3QtMTo2OTllYTNjYy1iNGY3LTQ2MWItODQxZC1lNjM2ZDZjYmJkOTgiLCJNIjoiUHVibGljIn0%3D&start=PT1H&end=null&autoRefresh=60", icon: "\u26A1" },
    { label: "Delta", url: "https://cloudwatch.amazonaws.com/dashboard.html?dashboard=DELTA&context=eyJSIjoidXMtZWFzdC0xIiwiRCI6ImN3LWRiLTAxMDc5NzEzNTY4NSIsIlUiOiJ1cy1lYXN0LTFfUjZ6QXhXeEpUIiwiQyI6IjFrNTc3MmVkdnFhY3ZhOWE4aHM4MDFhOG5mIiwiSSI6InVzLWVhc3QtMTpjYjhmYzU4My1mZWY1LTQzMmUtOTlkNS1lNGE1ZTdiMzk0ZDMiLCJPIjoiYXJuOmF3czppYW06OjAxMDc5NzEzNTY4NTpyb2xlL3NlcnZpY2Utcm9sZS9DV0RCU2hhcmluZy1QdWJsaWNSZWFkT25seUFjY2Vzcy1MUDNIMzJBTCIsIk0iOiJQdWJsaWMifQ%3D%3D&start=PT1H&end=null&autoRefresh=60", icon: "\uD83D\uDD3A" },
    { label: "Vip 1", url: "https://cloudwatch.amazonaws.com/dashboard.html?dashboard=VIP1&context=eyJSIjoidXMtZWFzdC0xIiwiRCI6ImN3LWRiLTAxMDc5NzEzNTY4NSIsIlUiOiJ1cy1lYXN0LTFfUjZ6QXhXeEpUIiwiQyI6IjFrNTc3MmVkdnFhY3ZhOWE4aHM4MDFhOG5mIiwiSSI6InVzLWVhc3QtMTo3NmQ1M2JlOS1jZGZiLTQzYzItYmEwYS1hYWJhNjUyNDViM2QiLCJNIjoiUHVibGljIn0%3D&start=PT1H&end=null&autoRefresh=60", icon: "\uD83D\uDC8E" },
    { label: "Loterias", url: "https://cloudwatch.amazonaws.com/dashboard.html?dashboard=LOTERIAS&context=eyJSIjoidXMtZWFzdC0xIiwiRCI6ImN3LWRiLTAxMDc5NzEzNTY4NSIsIlUiOiJ1cy1lYXN0LTFfUjZ6QXhXeEpUIiwiQyI6IjFrNTc3MmVkdnFhY3ZhOWE4aHM4MDFhOG5mIiwiSSI6InVzLWVhc3QtMToyZDBjYWYyMC1lNTZlLTRiMWMtOGFiYS0wN2U0ODg2MjdlMDAiLCJNIjoiUHVibGljIn0%3D&autoRefresh=60&start=PT1H&end=null", icon: "\uD83C\uDFB0" },
    { label: "Comtele", url: "https://portal.comtele.com.br/reports?sendMessages=true", icon: "\uD83D\uDCF1", mobile: true },
  ];

  function setStatus(text, kind) {
    const el = $("#statusText");
    if (el) el.textContent = text;
    const dot = $("#status-dot");
    if (dot) dot.className = "dot " + (kind || "");
  }

  function updateCountdown() {
    if (state.paused) return;
    const el = $("#refreshCountdown");
    if (el) {
      const sec = Math.ceil(state.refreshCountdown / 1000);
      el.textContent = `↻ ${sec}s`;
    }
  }

  function startCountdown() {
    if (state.countdownInterval) clearInterval(state.countdownInterval);
    state.refreshCountdown = REFRESH;
    updateCountdown();
    state.countdownInterval = setInterval(() => {
      if (state.paused) return;
      state.refreshCountdown -= 1000;
      if (state.refreshCountdown <= 0) {
        state.refreshCountdown = REFRESH;
      }
      updateCountdown();
    }, 1000);
  }

  function toast(html, kind) {
    // Mostra apenas a notificação nova (limpa as anteriores)
    const box = $("#toasts");
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.innerHTML = html;
    box.appendChild(el);
    setTimeout(() => el.remove(), 12000);
  }

  function playSound() {
    const opt = SOUND_OPTIONS.find(s => s.id === state.soundId) || SOUND_OPTIONS[0];
    if (opt.type === "builtin") {
      opt.play();
    } else if (opt.type === "file") {
      playCustomSound();
    }
  }

  // Som específico para "Jira fora do ar" — NÃO configurável pelo usuário
  function playJiraDownSound() {
    // Sequência grave e repetida para chamar atenção: tom baixo repetido 4x
    playBuiltinSound([220, 220, 220, 220], [0.3, 0.3, 0.3, 0.3], 0.4);
  }

  function playBuiltinSound(freqs, durations, gainVal) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + (i * 0.2);
        const dur = durations[i] || 0.2;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(gainVal, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.start(t);
        osc.stop(t + dur);
      });
    } catch (e) { /* navegador sem áudio */ }
  }

  function playCustomSound() {
    const audio = new Audio("sounds/bora-trabalhar_notification.mp3");
    audio.volume = 0.5;
    audio.play().catch(() => { /* autoplay bloqueado */ });
  }

  // Opções de som: 3 built-in (Web Audio) + 1 custom MP3
  const SOUND_OPTIONS = [
    { id: "default", label: "Padrão (bipe duplo)", type: "builtin", play: playDefaultSound },
    { id: "alert", label: "Alerta (3 tons)", type: "builtin", play: playAlertSound },
    { id: "soft", label: "Suave (tom único)", type: "builtin", play: playSoftSound },
    { id: "custom", label: "Personalizado (Bora Trabalhar)", type: "file", src: "sounds/bora-trabalhar_notification.mp3" },
  ];

  function playDefaultSound() {
    playBuiltinSound([880, 1174], [0.18, 0.18], 0.25);
  }
  function playAlertSound() {
    playBuiltinSound([660, 880, 1100], [0.15, 0.15, 0.2], 0.3);
  }
  function playSoftSound() {
    playBuiltinSound([523], [0.4], 0.2);
  }

  function playCustomSound() {
    const audio = new Audio("sounds/bora-trabalhar_notification.mp3");
    audio.volume = 0.5;
    audio.play().catch(() => { /* autoplay bloqueado */ });
  }

  function playSound() {
    const opt = SOUND_OPTIONS.find(s => s.id === state.soundId) || SOUND_OPTIONS[0];
    if (opt.type === "builtin") {
      opt.play();
    } else if (opt.type === "file") {
      playCustomSound();
    }
  }

  // Som específico para "Jira fora do ar" — NÃO configurável pelo usuário
  function playJiraDownSound() {
    // Sequência grave e repetida para chamar atenção: tom baixo repetido 4x
    playBuiltinSound([220, 220, 220, 220], [0.3, 0.3, 0.3, 0.3], 0.4);
  }

  async function enableNotifications() {
    if (!("Notification" in window)) { toast("Seu navegador não suporta notificações.", "err"); return; }
    const perm = await Notification.requestPermission();
    state.notifyEnabled = perm === "granted";
    $("#btnNotify").classList.toggle("on", perm === "granted");
    toast(perm === "granted" ? "Notificações ativadas ✔" : "Permissão negada.", perm === "granted" ? "" : "warn");
  }

  // level: "" | "warn" | "err"; t: ticket opcional (abre detalhe ao clicar)
  function notify(title, body, level, t) {
    playSound();
    if (state.notifyEnabled && "Notification" in window && Notification.permission === "granted") {
      try {
        const n = new Notification(title, { body, tag: t ? t.key : "jira-monitor" });
        n.onclick = () => {
          window.focus();
          if (t) showDetail(t);
          n.close();
        };
      } catch (e) {}
    }
    toast(`<b>${esc(title)}</b> — ${esc(body)}`, level);
  }

  // ---------- Render ----------
  function renderSummary(q) {
    const s = q.summary;
    const box = $("#summaryCards");
    box.innerHTML = "";
    const add = (label, value, hint, cls) => {
      box.insertAdjacentHTML("beforeend",
        `<div class="card ${cls || ""}"><div class="label">${label}</div><div class="value">${value}</div>${hint ? `<div class="hint">${hint}</div>` : ""}</div>`);
    };
    add("Tickets abertos", s.total, "na fila N1", "total");
    add("Aguardando resposta", s.waitingForTeam, "cliente aguardando equipe", "waiting");
    add("Críticas/Altas", s.critical, "prioridade alta", "critical");
    add("Espera média", fmtDur(s.averageWaitMs), "pior: " + fmtDur(s.maxWaitMs), "avg");
  }

  const waitPct = (m) => {
    if (!m) return 0;
    const h = m / 3600000;
    if (h <= 4) return (h / 4) * 30;
    if (h <= 12) return 30 + ((h - 4) / 8) * 40;
    return 70 + Math.min(30, ((h - 12) / 12) * 30);
  };
  const waitBarCls = (m) => (m >= 12 * 3600000 ? "wb-crit" : m >= 4 * 3600000 ? "wb-warn" : "wb-ok");
  const waitStateCls = (m) => (m >= 12 * 3600000 ? "w-crit" : m >= 4 * 3600000 ? "w-wait" : "w-okay");

  function renderTickets() {
    const q = state.queue;
    if (!q) return;
    let list = q.tickets.slice();
    const term = state.search.trim().toLowerCase();
    if (term) {
      list = list.filter((t) =>
        [t.key, t.summary, t.description, t.commentsText, ...(t.descriptionUrls || [])].some((v) => (v || "").toLowerCase().includes(term)));
    }
    switch (state.filter) {
      case "waiting": list = list.filter((t) => t.waitingForTeam); break;
      case "critical": list = list.filter((t) => t.priority === "Highest" || t.priority === "High"); break;
    }
    if (state.group) {
      const { type, value } = state.group;
      list = list.filter((t) => {
        if (type === "org") {
          const orgs = t.organizations || [];
          return value === "(sem organização)" ? !orgs.length : orgs.includes(value);
        }
        const name = (t.assignee && t.assignee.trim()) || "(sem responsável)";
        return value === "(sem responsável)" ? name === "(sem responsável)" : name === value;
      });
    }
    switch (state.sort) {
      case "wait": list.sort((a, b) => b.waitMs - a.waitMs); break;
      case "priority": list.sort((a, b) => (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9)); break;
      case "newest": list.sort((a, b) => b.created - a.created); break;
      case "oldest": list.sort((a, b) => a.created - b.created); break;
      case "activity": list.sort((a, b) => (a.lastActivityMs || 0) - (b.lastActivityMs || 0)); break;
    }

    const wrap = $("#tickets");
    if (!list.length) { wrap.innerHTML = `<div class="empty">Nenhum ticket encontrado.</div>`; return; }

    // Mapa id de aposta/transação -> tickets (usa a fila completa, não só o filtro atual)
    const dupMap = {};
    for (const t of q.tickets) {
      const ids = Array.isArray(t.betTransactionIds) ? t.betTransactionIds : [];
      for (const e of ids) {
        const id = (e && e.id ? e.id : e);
        if (!id) continue;
        const k = String(id).toLowerCase();
        if (!dupMap[k]) dupMap[k] = [];
        if (!dupMap[k].includes(t.key)) dupMap[k].push(t.key);
      }
    }

    wrap.innerHTML = list.map((t) => {
      const bord = t.waitMs >= 12 * 3600000 ? "hot" : t.waitMs >= 4 * 3600000 ? "warm" : "cool";
      // Tipos de última atividade
      const isNote = t.lastActivityType === "note";      // observação interna
      const isReply = t.lastActivityType === "reply";    // responder ao cliente
      const isAuto = t.lastActivityType === "auto";      // bot/automação
      const lastBadge = isNote
        ? `<span class="tick-type note" title="Observação interna (não conta como resposta ao cliente)">📝 Observação interna</span>`
        : isReply
          ? t.lastActivityIsCustomer
            ? `<span class="tick-type reply cust" title="Cliente respondeu (não há resposta ao cliente depois)">💬 Cliente respondeu</span>`
            : `<span class="tick-type reply" title="Resposta ao cliente (equipe respondeu por último)">💬 Resposta ao cliente</span>`
          : isAuto
            ? `<span class="tick-type auto" title="Automação">🤖 Automação</span>`
            : "";
      const ids = Array.isArray(t.betTransactionIds) ? t.betTransactionIds : [];
      const dupKeys = [];
      for (const e of ids) {
        const id = (e && e.id ? e.id : e);
        if (!id) continue;
        const others = (dupMap[String(id).toLowerCase()] || []).filter((k) => k !== t.key);
        for (const k of others) if (!dupKeys.includes(k)) dupKeys.push(k);
      }
      const dupBanner = dupKeys.length
        ? `<div class="tick-dup" title="Mesma rodada/transação em análise em outro ticket">⚠️ Atenção: rodada/transação em análise também em: ${dupKeys.map((k) => esc(k)).join(", ")}</div>`
        : "";
      return `
      <div class="ticket ${bord}${isNote ? " last-note" : ""}${isReply ? (t.lastActivityIsCustomer ? " last-cust" : " last-reply") : ""}" data-key="${esc(t.key)}">
        <div class="tick-head">
          <span class="priority p-${esc(t.priority || "None")}">${esc(t.priority || "—")}</span>
          <span class="trip-key">${esc(t.key)}</span>
          <span class="status">${esc(t.status || "")}</span>
          ${lastBadge}
        </div>
        ${t.organizations && t.organizations.length ? `<div class="tick-org">🏢 ${esc(t.organizations.join(", "))}</div>` : ""}
        ${dupBanner}
        <div class="tick-title" title="${esc(t.summary)}">${esc(t.summary)}</div>
        <div class="tick-body">
          ${t.assignee ? `<span class="tick-assignee" title="Responsável">👨‍💻 ${esc(t.assignee)}</span>` : `<span class="tick-assignee empty" title="Sem responsável">👨‍💻 —</span>`}
        </div>
        <div class="tick-body">
          <span class="tick-cliente" title="Reportado por">👤 ${esc(t.reporter || "—")}</span>
          <span class="tick-age" title="Criado há">🕐 ${fmtAgo(t.created)}</span>
        </div>
        ${t.lastInternalNoteMs ? `<div class="tick-lastint">Última interação em nota interna há ${fmtAgo(t.lastInternalNoteMs)}</div>` : ""}
        <div class="wait ${waitStateCls(t.waitMs)}">
          <div class="waitbar"><div class="${waitBarCls(t.waitMs)}" style="width:${waitPct(t.waitMs)}%"></div></div>
          <div class="tick-wait">${t.waitingForTeam ? "⏳ Sem resposta ao cliente há " + fmtDur(t.waitMs) : "✔ Última resposta ao cliente há " + (t.lastTeamPublicReplyMs ? fmtAgo(t.lastTeamPublicReplyMs) : "—")}</div>
        </div>
        ${t.lastActivityText ? `<div class="tick-last"><span class="who">${esc(t.lastActivityBy || "")}</span><span class="txt">${linkify(t.lastActivityText)}</span></div>` : ""}
      </div>`;
    }).join("");

    wrap.querySelectorAll(".ticket").forEach((el) => {
      el.addEventListener("click", () => {
        const key = el.dataset.key;
        const t = state.queue.tickets.find((x) => x.key === key);
        if (t) showDetail(t);
      });
    });
  }

  // ---------- Detalhe ----------
  async function showDetail(t) {
    const dlg = $("#tickDetail");
    dlg.classList.remove("hidden");
    dlg.innerHTML = `
      <div class="panel">
        <div class="detail-head">
          <div>
            <h2>${esc(t.summary)}</h2>
            <div class="dp-meta">
              <span><b>Ticket:</b> ${esc(t.key)}</span>
              <span><b>Status:</b> ${esc(t.status || "—")}</span>
              <span><b>Prioridade:</b> ${esc(t.priority || "—")}</span>
              <span><b>Atendente:</b> ${esc(t.assignee || "—")}</span>
              <span><b>Cliente:</b> ${esc(t.reporter || "—")}</span>
              <span><b>Espera:</b> ${fmtDur(t.waitMs)}</span>
            </div>
          </div>
          <button class="btn-ghost" data-close>✕</button>
        </div>
        <div class="dp-actions">
          <a class="btn-ghost" target="_blank" rel="noopener" href="https://${esc(t.site || "sup-ngx.atlassian.net")}/browse/${esc(t.key)}">Abrir no Jira ↗</a>
          <button class="btn-ghost" data-close>Fechar</button>
        </div>
        <div class="dp-comments"><h3>Comentários de ${esc(t.key)}</h3><div id="dlgComments"><i>Carregando…</i></div></div>
      </div>`;
    dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.classList.add("hidden")));
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.classList.add("hidden"); });
    try {
      const res = await fetch("/api/comments?key=" + encodeURIComponent(t.key), { cache: "no-store" });
      const data = await res.json();
      const box = $("#dlgComments");
      if (data.error) { box.innerHTML = `<div class="comment-item">Erro: ${esc(data.error)}</div>`; return; }
      const list = data.comments || [];
      box.innerHTML = list.length
        ? list.map((c) => `<div class="comment-item ${c.isPublic ? "public" : "internal"} ${c.isCustomer ? "customer" : ""}">
            <span class="tag-${c.isPublic ? "public" : "internal"}">${c.isPublic ? "💬 Resposta ao cliente" : "📝 Observação interna"}</span>
            <span class="ca">${esc(c.author)}</span> <span class="ct">· ${fmtDate(c.created)}</span>
            <div class="cb${c.bodyHtml ? " rich" : ""}">${c.bodyHtml ? c.bodyHtml : linkify(c.body)}</div></div>`).join("")
        : `<div class="comment-item">Sem comentários.</div>`;
    } catch (e) {
      $("#dlgComments").innerHTML = `<div class="comment-item" style="color:var(--red)">Erro: ${esc(e.message)}</div>`;
    }
  }

  // ---------- Painel por atendente / organização ----------
  // key: "assignee" | "organizations"
  function showGroupBy(key) {
    const q = state.queue;
    if (!q) return;
    const p = $("#staffPanel");
    p.classList.remove("hidden");

    const byOrg = key === "organizations";
    const counts = {};
    for (const t of q.tickets) {
      const groups = byOrg
        ? (t.organizations && t.organizations.length ? t.organizations : ["(sem organização)"])
        : [(t.assignee && t.assignee.trim()) || "(sem responsável)"];
      for (const name of groups) {
        if (!counts[name]) counts[name] = { total: 0, waiting: 0, critical: 0 };
        counts[name].total++;
        if (t.waitingForTeam) counts[name].waiting++;
        if (t.priority === "Highest" || t.priority === "High") counts[name].critical++;
      }
    }
    const rows = Object.entries(counts)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, c]) => `
        <div class="staff-row" data-name="${esc(name)}">
          <span class="staff-name">${esc(name)}</span>
          <span class="staff-n" title="Total">${c.total} tickets</span>
          <span class="staff-w" title="Aguardando equipe">${c.waiting ? "⏳ " + c.waiting : ""}</span>
          <span class="staff-c" title="Críticos/Altos">${c.critical ? "🔴 " + c.critical : ""}</span>
        </div>`).join("");

    p.innerHTML = `
      <div class="panel">
        <div class="detail-head">
          <h2>${byOrg ? "🏢 Tickets por organização" : "👥 Tickets por atendente"}</h2>
          <button class="btn-ghost" data-close>✕</button>
        </div>
        <div class="staff-list">${rows || `<div class="empty">Nenhum ticket.</div>`}</div>
        <div class="dp-actions"><button class="btn-ghost" data-close>Fechar</button></div>
      </div>`;
    p.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => p.classList.add("hidden")));
    p.addEventListener("click", (e) => { if (e.target === p) p.classList.add("hidden"); });

    p.querySelectorAll(".staff-row").forEach((row) => {
      row.addEventListener("click", () => {
        const name = row.dataset.name;
        p.classList.add("hidden");
        state.group = { type: byOrg ? "org" : "assignee", value: name };
        renderTickets();
        renderGroupChip();
      });
    });
  }

  // Chip ativo do filtro por atendente/organização
  function renderGroupChip() {
    const strip = $("#groupFilterStrip");
    if (!strip) return;
    if (!state.group) { strip.innerHTML = ""; return; }
    const icon = state.group.type === "org" ? "🏢" : "👥";
    strip.innerHTML = `<button class="chip active" data-clear-group>${icon} ${esc(state.group.value)} ✕</button>`;
    strip.querySelector("[data-clear-group]").addEventListener("click", () => {
      state.group = null;
      renderTickets();
      renderGroupChip();
    });
  }

  // ---------- Painel de links ----------
  function showLinks() {
    const p = $("#linksPanel");
    p.classList.remove("hidden");
    p.innerHTML = `
      <div class="panel">
        <div class="detail-head">
          <div><h2>🔗 Links — Sistemas</h2><div class="dp-meta"><span><b>Atalhos</b> para os ambientes da equipe</span></div></div>
          <button class="btn-ghost" data-close>✕</button>
        </div>
        <div class="links-list">${LINKS.map((l) => `
          <div class="link-row" role="link" tabindex="0" data-url="${esc(l.url)}" data-label="${esc(l.label)}" data-mobile="${l.mobile ? "1" : "0"}">
            <span class="link-icon">${l.icon}</span>
            <span class="link-label">${esc(l.label)}</span>
            <span class="link-go">↗</span>
          </div>`).join("")}</div>
        <div class="dp-actions"><button class="btn-ghost" data-close>Fechar</button></div>
      </div>`;
    p.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => p.classList.add("hidden")));
    p.addEventListener("click", (e) => { if (e.target === p) p.classList.add("hidden"); });
    p.querySelectorAll(".link-row").forEach((row) => {
      const url = row.dataset.url;
      const label = row.dataset.label;
      const isMobile = row.dataset.mobile === "1";
      const open = () => openLinkViewer(url, label, isMobile);
      row.addEventListener("click", open);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });
  }

  // ---------- Painel Atendentes (tickets N2/N3 que passaram por cada um) ----------
  async function showAgentsPanel() {
    const p = $("#agentsPanel");
    p.classList.remove("hidden");
    p.innerHTML = `<div class="panel"><div class="detail-head"><h2>📈 Tickets escalados por atendente</h2><div class="dp-meta"><span><b>N2/N3</b> dos últimos 60 dias que cada atendente já atendeu</span></div><button class="btn-ghost" data-close>✕</button></div><div class="agents-list"><i>Carregando…</i></div><div class="dp-actions"><button class="btn-ghost" data-close>Fechar</button></div></div>`;
    p.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => p.classList.add("hidden")));
    p.addEventListener("click", (e) => { if (e.target === p) p.classList.add("hidden"); });

    try {
      const res = await fetch("/api/agent-view", { cache: "no-store" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      renderAgentsList(data.agents);
    } catch (e) {
      $(".agents-list").innerHTML = `<div class="empty" style="color:var(--red)">Erro: ${esc(e.message)}</div>`;
    }
  }

  function renderAgentsList(agents) {
    const box = $(".agents-list");
    if (!agents.length) { box.innerHTML = `<div class="empty">Nenhum atendente com tickets N2/N3.</div>`; return; }
    box.innerHTML = agents.map((a) => `
      <div class="agent-row" data-account="${esc(a.accountId)}" tabindex="0" role="button">
        <span class="agent-name">${esc(a.displayName || "—")}</span>
        <span class="agent-count">${a.tickets.length} tickets</span>
        <span class="agent-types">${a.tickets.filter(t => t.tipoSuporte === "N2").length} N2 · ${a.tickets.filter(t => t.tipoSuporte === "N3").length} N3</span>
        <span class="agent-go">↗</span>
      </div>`).join("");
    box.querySelectorAll(".agent-row").forEach((row) => {
      row.addEventListener("click", () => {
        const acc = row.dataset.account;
        const agent = agents.find(x => x.accountId === acc);
        if (agent) renderAgentTickets(agent);
      });
      row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.click(); } });
    });
  }

  function renderAgentTickets(agent) {
    const p = $("#agentsPanel");
    p.innerHTML = `
      <div class="panel">
        <div class="detail-head">
          <h2>📈 ${esc(agent.displayName || "—")} — ${agent.tickets.length} tickets N2/N3</h2>
          <button class="btn-ghost" data-back>← Voltar</button>
        </div>
        <div class="tickets" id="agentTickets">${renderAgentTicketCards(agent.tickets)}</div>
        <div class="dp-actions"><button class="btn-ghost" data-back>Fechar</button></div>
      </div>`;
    p.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", showAgentsPanel));
    p.querySelectorAll(".ticket").forEach((el) => {
      el.addEventListener("click", () => {
        const key = el.dataset.key;
        if (key && state.queue) {
          const t = state.queue.tickets.find((x) => x.key === key);
          if (t) showDetail(t);
        }
      });
    });
  }

  function renderAgentTicketCards(tickets) {
    if (!tickets.length) return `<div class="empty">Nenhum ticket.</div>`;
    return tickets.map((t) => {
      const bord = t.tipoSuporte === "N3" ? "hot" : "warm";
      return `
      <div class="ticket ${bord}" data-key="${esc(t.key)}">
        <div class="tick-head">
          <span class="trip-key">${esc(t.key)}</span>
          <span class="status">${esc(t.status || "")}</span>
          <span class="priority p-${esc(t.tipoSuporte)}">${esc(t.tipoSuporte)}</span>
        </div>
        <div class="tick-title" title="${esc(t.summary)}">${esc(t.summary)}</div>
        <div class="tick-body">
          <span class="tick-cliente" title="Responsável atual">👤 ${esc(t.currentAssignee || "—")}</span>
        </div>
      </div>`;
    }).join("");
  }

  // ---------- Painel de Som ----------
  function showSoundPanel() {
    const p = $("#soundPanel");
    p.classList.remove("hidden");
    const current = state.soundId;
    p.innerHTML = `
      <div class="panel">
        <div class="detail-head">
          <h2>🔊 Escolher som de notificação</h2>
          <button class="btn-ghost" data-close>✕</button>
        </div>
        <div class="sound-list">
          ${SOUND_OPTIONS.map((s) => `
            <div class="sound-row ${s.id === current ? "active" : ""}" data-id="${s.id}" tabindex="0" role="button">
              <span class="sound-label">${esc(s.label)}</span>
              <button class="btn-ghost sound-test" data-test="${s.id}" title="Testar">▶ Testar</button>
            </div>`).join("")}
        </div>
        <div class="dp-actions"><button class="btn-ghost" data-close>Fechar</button></div>
      </div>`;
    p.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => p.classList.add("hidden")));
    p.addEventListener("click", (e) => { if (e.target === p) p.classList.add("hidden"); });

    p.querySelectorAll(".sound-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.classList.contains("sound-test")) return;
        const id = row.dataset.id;
        state.soundId = id;
        try { localStorage.setItem("notifySound", id); } catch (e) {}
        p.querySelectorAll(".sound-row").forEach(r => r.classList.toggle("active", r.dataset.id === id));
      });
    });
    p.querySelectorAll(".sound-test").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.test;
        const opt = SOUND_OPTIONS.find(s => s.id === id);
        if (opt) {
          if (opt.type === "builtin") opt.play();
          else playCustomSound();
        }
      });
    });
  }

  // ---------- Visualizador de links (tela cheia) ----------
  // CloudWatch (Alpha/Delta/Vip 1/Loterias) nao tem layout mobile:
  // renderizamos em largura desktop e escalamos para caber na tela.
  const DESK = 1280;
  let curMobile = false;
  function fitFrame() {
    const stage = $("#lvStage");
    const frame = $("#lvFrame");
    if (!stage || !frame || !frame.src || frame.src === "about:blank") return;
    const avail = stage.clientWidth;
    if (avail < 1) return;
    // Mobile nativo: usa 100% da largura, sem escala desktop
    if (curMobile || avail >= DESK) {
      frame.style.width = "100%";
      frame.style.height = "100%";
      frame.style.transform = "none";
      return;
    }
    const scale = avail / DESK;
    frame.style.width = DESK + "px";
    frame.style.height = stage.clientHeight / scale + "px";
    frame.style.transform = `scale(${scale})`;
  }
  function openLinkViewer(url, label, isMobile) {
    const v = $("#linkViewer");
    v.classList.remove("hidden");
    curMobile = !!isMobile;
    $("#lvTitle").textContent = label || "—";
    $("#lvFrame").src = url;
    $("#lvExt").onclick = () => { window.open(url, "_blank", "noopener"); };
    window.addEventListener("resize", fitFrame);
    setTimeout(fitFrame, 30);
    setTimeout(fitFrame, 600);
  }
  function closeLinkViewer() {
    const v = $("#linkViewer");
    v.classList.add("hidden");
    setTimeout(() => { $("#lvFrame").src = "about:blank"; }, 250);
    window.removeEventListener("resize", fitFrame);
  }

  // ---------- Detecção de mudanças ----------
  // Notifica APENAS quando um ticket NOVO sem resposta da equipe entra na fila.
  function seed(q) {
    // Popula o estado inicial SEM notificar (evita "novo" para tickets já conhecidos)
    state.lastSeen = {};
    for (const t of q.tickets) {
      state.lastSeen[t.key] = { lastActivityMs: t.lastActivityMs, waitMs: t.waitMs, created: t.created };
    }
    saveLastSeen();
  }

  function saveLastSeen() {
    try { localStorage.setItem("lastSeen", JSON.stringify(state.lastSeen)); } catch (e) {}
  }

  function loadLastSeen() {
    try {
      const raw = localStorage.getItem("lastSeen");
      if (raw) state.lastSeen = JSON.parse(raw) || {};
    } catch (e) { state.lastSeen = {}; }
  }

  function diff(q) {
    const prev = state.lastSeen;
    const nowMap = {};
    let changed = false;
    for (const t of q.tickets) {
      nowMap[t.key] = {
        lastActivityMs: t.lastActivityMs,
        waitMs: t.waitMs,
        created: t.created,
        lastActivityIsCustomer: t.lastActivityIsCustomer,
        lastActivityType: t.lastActivityType,
        lastActivityBy: t.lastActivityBy,
      };
      const p = prev[t.key];
      if (!p && t.waitingForTeam && t.waitMs > 0) {
        // Um ticket realmente NOVO (nunca visto nesta máquina) aguardando resposta
        notify("Novo ticket sem resposta", `${t.key} — ${t.summary.slice(0, 90)}`, "", t);
        changed = true;
        continue;
      }
      if (p && t.lastActivityMs && t.lastActivityMs !== p.lastActivityMs && t.lastActivityIsCustomer) {
        // Cliente retornou no ticket (novo comentário público do cliente)
        const who = t.lastActivityBy || "Cliente";
        const snippet = (t.lastActivityText || "").slice(0, 90);
        notify("Cliente adicionou novas informações", `${t.key} — ${t.summary.slice(0, 60)}${snippet ? " — " + snippet : ""}`, "", t);
        changed = true;
      }
    }
    state.lastSeen = nowMap;
    if (changed) saveLastSeen();
  }

  // ---------- Carga ----------
  async function checkVersion() {
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      const data = await res.json();
      if (!data.version) return;
      if (state.version === null) { state.version = data.version; return; }
      if (data.version !== state.version && !state.upgradeShown) {
        state.upgradeShown = true;
        // Busca changelog se disponível (aceita array ou objeto {changelog:[...]})
        const cl = Array.isArray(data.changelog) ? data.changelog : (data.changelog && data.changelog.changelog);
        if (cl) {
          state.upgradeChangelog = cl;
        }
        const banner = $("#upgradeBanner");
        if (banner) {
          banner.classList.remove("hidden");
          // Atualiza o banner com changelog se disponível
          const txt = banner.querySelector(".ub-txt");
          if (txt && state.upgradeChangelog) {
            txt.innerHTML = `🆕 Nova versão disponível <button class="ub-details">Ver novidades</button>`;
            banner.querySelector(".ub-details").addEventListener("click", showUpgradeDetails);
          }
        }
        if (state.notifyEnabled && "Notification" in window && Notification.permission === "granted") {
          try {
            const n = new Notification("Nova versão do painel", { body: "Atualize para ver a versão mais recente.", tag: "jira-upgrade" });
            n.onclick = () => { window.focus(); doUpgrade(); n.close(); };
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  function showUpgradeDetails() {
    const items = Array.isArray(state.upgradeChangelog)
      ? state.upgradeChangelog
      : (state.upgradeChangelog && state.upgradeChangelog.changelog) || [];
    if (!items.length) return;
    const p = $("#linksPanel"); // reusa o painel
    p.classList.remove("hidden");
    p.innerHTML = `
      <div class="panel">
        <div class="detail-head">
          <h2>📋 Novidades da versão</h2>
          <button class="btn-ghost" data-close>✕</button>
        </div>
        <div class="changelog" style="max-height:60vh;overflow:auto;padding:8px 0;">
          ${state.upgradeChangelog.map((item, i) => `
            <div style="margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border);">
              <div style="font-weight:600;color:var(--accent);">${esc(item.type)}: ${esc(item.title)}</div>
              <div style="font-size:13px;color:var(--muted);margin-top:4px;">${esc(item.description)}</div>
            </div>
          `).join("")}
        </div>
        <div class="dp-actions">
          <button class="btn-ghost" data-close>Fechar</button>
          <button class="btn-ghost" id="ubUpdateNow">Atualizar agora</button>
        </div>`;
    p.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => p.classList.add("hidden")));
    p.addEventListener("click", (e) => { if (e.target === p) p.classList.add("hidden"); });
    $("#ubUpdateNow").addEventListener("click", doUpgrade);
  }
  function doUpgrade() {
    try { localStorage.removeItem("lastSeen"); } catch (e) {}
    location.reload();
  }
  $("#ubUpdate").addEventListener("click", doUpgrade);

  async function refresh() {
    if (state.paused) return;
    try {
      const res = await fetch("/api/queue", { cache: "no-cache" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const had = !!state.queue;
      state.queue = data.queue;
      if (had) diff(data.queue);
      else seed(data.queue);
      renderSummary(data.queue);
      renderTickets();
      setStatus("✓ atualizado " + new Date(data.generatedAt).toLocaleTimeString(), "ok");
      state.refreshCountdown = REFRESH;
      updateCountdown();
    } catch (e) {
      setStatus("Erro: " + e.message, "err");
    }
  }

  // ---------- Eventos ----------
  $("#btnNotify").addEventListener("click", enableNotifications);
  $("#btnStaff").addEventListener("click", () => showGroupBy("assignee"));
  $("#btnOrg").addEventListener("click", () => showGroupBy("organizations"));
  $("#btnLinks").addEventListener("click", showLinks);
  $("#btnAgents").addEventListener("click", showAgentsPanel);
  $("#btnSound").addEventListener("click", showSoundPanel);
  $("#lvClose").addEventListener("click", closeLinkViewer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const v = $("#linkViewer");
      if (v && !v.classList.contains("hidden")) { closeLinkViewer(); return; }
      if ($("#linksPanel") && !$("#linksPanel").classList.contains("hidden")) { $("#linksPanel").classList.add("hidden"); return; }
      if ($("#agentsPanel") && !$("#agentsPanel").classList.contains("hidden")) { $("#agentsPanel").classList.add("hidden"); return; }
      if ($("#soundPanel") && !$("#soundPanel").classList.contains("hidden")) { $("#soundPanel").classList.add("hidden"); return; }
      if ($("#staffPanel") && !$("#staffPanel").classList.contains("hidden")) { $("#staffPanel").classList.add("hidden"); return; }
      if ($("#tickDetail") && !$("#tickDetail").classList.contains("hidden")) { $("#tickDetail").classList.add("hidden"); return; }
      if ($("#upgradeBanner") && !$("#upgradeBanner").classList.contains("hidden")) { $("#upgradeBanner").classList.add("hidden"); return; }
    }
  });
  $("#btnPause").addEventListener("click", () => {
    state.paused = !state.paused;
    $("#btnPause").classList.toggle("on", state.paused);
    $("#btnPause").textContent = state.paused ? "▶ Retomar" : "⏸ Pausar";
    if (!state.paused) refresh();
  });
  $$(".chip").forEach((c) => c.addEventListener("click", () => {
    $$(".chip").forEach((x) => x.classList.remove("active"));
    c.classList.add("active");
    state.filter = c.dataset.filter;
    if (c.dataset.filter === "all") {
      state.group = null;
      renderGroupChip();
    }
    renderTickets();
  }));
  $("#sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; renderTickets(); });
  $("#search").addEventListener("input", (e) => { state.search = e.target.value; renderTickets(); });

  if ("Notification" in window && Notification.permission === "granted") $("#btnNotify").classList.add("on");
  // Carrega preferência de som
  try { const saved = localStorage.getItem("notifySound"); if (saved) state.soundId = saved; } catch (e) {}
  // Carrega preferência de tema
  try { const savedTheme = localStorage.getItem("theme"); if (savedTheme) { state.theme = savedTheme; document.documentElement.setAttribute("data-theme", savedTheme); $("#btnTheme").setAttribute("data-theme", savedTheme); } } catch (e) {}
  loadLastSeen();
  refresh();
  checkVersion();
  renderGroupChip();
  startCountdown();
  // Debug QA: ?banner=1 força o banner de upgrade (para testar layout/toque no mobile)
  try {
    if (new URLSearchParams(location.search).get("banner") === "1") {
      fetch("/api/version", { cache: "no-store" }).then((r) => r.json()).then((d) => {
        const cl = Array.isArray(d.changelog) ? d.changelog : (d.changelog && d.changelog.changelog);
        if (cl) state.upgradeChangelog = cl;
        state.upgradeShown = true;
        const b = $("#upgradeBanner");
        if (b) {
          b.classList.remove("hidden");
          const txt = b.querySelector(".ub-txt");
          if (txt) {
            txt.innerHTML = '🆕 Nova versão disponível <button class="ub-details">Ver novidades</button>';
            b.querySelector(".ub-details").addEventListener("click", showUpgradeDetails);
          }
        }
      }).catch(() => {});
    }
  } catch (e) {}
  // Theme toggle
  $("#btnTheme").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", state.theme);
    localStorage.setItem("theme", state.theme);
    $("#btnTheme").textContent = state.theme === "dark" ? "🌙 Tema" : "☀️ Tema";
    // Update mobile icon via data-theme attribute
    $("#btnTheme").setAttribute("data-theme", state.theme);
  });
  setInterval(refresh, REFRESH);
  setInterval(checkVersion, Math.max(REFRESH * 2, 60000));
})();
