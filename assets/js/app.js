import {
  initDB,
  saveTransaction,
  deleteTransaction,
  getAllTransactions,
  saveConfig,
  getConfig,
  listReports,
  clearStore,
} from "./db.js";
import { initDashboardCharts, updateDashboardCharts } from "./charts.js";
import { generateFinancialPdf, persistReport } from "./report.js";
import { sendEmailReport, flushEmailQueue } from "./email.js";
import { sendWhatsApp } from "./whatsapp.js";
import { getCurrentSession, logout, isAdmin } from "./auth.js";

const body = document.body;
const page = body.dataset.page;

// Session state
let currentSession = null;
const NOTIFY_KEY = "meufin_notify";

const defaultConfig = {
  key: "main",
  theme: "light",
  nomeUsuario: "",
  metaEconomia: 0,
  objetivoDescricao: "",
  objetivoValor: 0,
  categorias: [
    "Salário",
    "Investimentos",
    "Alimentação",
    "Moradia",
    "Transporte",
    "Lazer",
    "Saúde",
    "Educação",
    "Outros",
  ],
  emailService: "service_90wte0r",
  emailTemplate: "template_cyr3pt8",
  emailPublic: "8M3uFdjiAMS5gV30w",
  emailPrivate: "0X93fhrwEn9vVMMLvmur4",
  emailDestinatario: "",
  whatsNumero: "",
  whatsMetodo: "baileys",
  webhookUrl: "http://localhost:3333/send-whatsapp",
  objetivos: [],
  shareUrl: window.location.origin,
  notificarVencimentos: false,
  notificarObjetivos: false,
  lembreteHorario: "08:00",
};

let transactionFilter = "mes";

const state = {
  transactions: [],
  metrics: {
    entradas: 0,
    saidas: 0,
    saldo: 0,
    valorMes: 0,
    media3m: 0,
    tendencia: 0,
    saude: 0,
    historico: [],
  },
  config: { ...defaultConfig },
  reports: [],
};

function formatCurrency(value = 0) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function computeMetrics(transactions) {
  const entradas = transactions
    .filter((tx) => tx.tipo === "entrada")
    .reduce((acc, tx) => acc + parseNumber(tx.valor), 0);
  const saidas = transactions
    .filter((tx) => tx.tipo === "saida")
    .reduce((acc, tx) => acc + parseNumber(tx.valor), 0);

  const saldo = entradas - saidas;
  const referencia = new Date();
  const month = referencia.getMonth();
  const year = referencia.getFullYear();

  const valorMes = transactions
    .filter((tx) => {
      const data = new Date(tx.data);
      return tx.tipo === "saida" && data.getMonth() === month && data.getFullYear() === year;
    })
    .reduce((acc, tx) => acc + parseNumber(tx.valor), 0);

  const historico = [];
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const label = date.toLocaleDateString("pt-BR", { month: "short" });
    const totalMes = transactions
      .filter((tx) => {
        const d = new Date(tx.data);
        return d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();
      })
      .reduce((acc, tx) => acc + (tx.tipo === "entrada" ? tx.valor : -tx.valor), 0);
    historico.push({ label, valor: Number(totalMes.toFixed(2)) });
  }

  const ultimos3 = historico.slice(-3).map((h) => h.valor);
  const media3m =
    ultimos3.length > 0 ? ultimos3.reduce((acc, val) => acc + val, 0) / ultimos3.length : 0;

  const tendencia = historico.length >= 2 ? historico.at(-1).valor - historico.at(-2).valor : 0;
  
  // Saúde financeira: % de economia sobre as entradas
  // 100% = não gastou nada, 0% = gastou tudo, negativo = gastou mais do que ganhou
  let saude = 0;
  if (entradas > 0) {
    saude = ((entradas - saidas) / entradas) * 100;
  } else if (saidas > 0) {
    saude = -100; // Sem entradas mas com saídas = negativo
  } else {
    saude = 100; // Sem movimentação = neutro
  }

  return {
    entradas,
    saidas,
    saldo,
    valorMes,
    media3m,
    tendencia,
    saude,
    historico,
  };
}

function badgeByHealth(value) {
  // value = % de economia (quanto sobrou das entradas)
  // 50%+ = Excelente (economizou mais da metade)
  // 20-50% = Boa (economizou uma parte)
  // 0-20% = Alerta (gastou quase tudo)
  // <0% = Perigo (gastou mais do que ganhou)
  if (value >= 50) return { text: "Excelente", className: "badge success" };
  if (value >= 20) return { text: "Boa", className: "badge success" };
  if (value >= 0) return { text: "Alerta", className: "badge warning" };
  return { text: "Perigo", className: "badge danger" };
}

function updateDashboardUI() {
  const { entradas, saidas, saldo, saude, valorMes, tendencia, historico } = state.metrics;

  const saldoEl = document.querySelector("[data-value=saldo]");
  const entradasEl = document.querySelector("[data-value=entradas]");
  const saidasEl = document.querySelector("[data-value=saidas]");
  const saudeEl = document.querySelector("[data-value=saude]");
  const trendSaldo = document.querySelector("[data-trend=saldo]");

  if (saldoEl) saldoEl.textContent = formatCurrency(saldo);
  if (entradasEl) entradasEl.textContent = formatCurrency(entradas);
  if (saidasEl) saidasEl.textContent = formatCurrency(saidas);
  if (saudeEl) saudeEl.textContent = `${saude.toFixed(1)}%`;
  if (trendSaldo) {
    const direction = tendencia >= 0 ? "▲" : "▼";
    trendSaldo.textContent = `${direction} ${formatCurrency(Math.abs(tendencia))}`;
  }

  const badge = document.querySelector("[data-badge=saude]");
  if (badge) {
    const meta = badgeByHealth(saude);
    badge.textContent = meta.text;
    badge.className = meta.className;
  }

  const tabelaPagamentos = document.querySelector("[data-table=pagamentos]");
  if (tabelaPagamentos) {
    const month = new Date().getMonth();
    const year = new Date().getFullYear();
    const despesasMes = state.transactions.filter((tx) => {
      const data = new Date(tx.data);
      return tx.tipo === "saida" && data.getMonth() === month && data.getFullYear() === year;
    });

    tabelaPagamentos.innerHTML = despesasMes.length
      ? despesasMes
          .slice(0, 5)
          .map(
            (tx) => `
          <tr>
            <td>${tx.descricao}</td>
            <td>${tx.categoria}</td>
            <td>${new Date(tx.data).toLocaleDateString("pt-BR")}</td>
            <td>${formatCurrency(tx.valor)}</td>
            <td>${tx.fixo ? "Fixo" : "Único"}</td>
            <td>
              <button class="btn secondary" data-action="editar" data-id="${tx.id}">Editar</button>
              <button class="btn secondary" data-action="excluir" data-id="${tx.id}">Excluir</button>
            </td>
          </tr>
        `
          )
          .join("")
      : "<tr><td colspan=6>Nenhuma despesa neste mês.</td></tr>";
  }

  initDashboardCharts();
  updateDashboardCharts({
    entradas,
    saidas,
    historico,
    saude,
  });

  const projecaoEl = document.querySelector("[data-insight=projecao]");
  if (projecaoEl) {
    projecaoEl.textContent =
      mediaResumoText(state.metrics.media3m, state.metrics.tendencia);
  }

  const alertaEl = document.querySelector("[data-insight=alerta]");
  if (alertaEl) {
    if (saude < 0) {
      alertaEl.textContent = "⚠️ Perigo: você está gastando mais do que ganha! Reduza despesas urgentemente.";
    } else if (saude < 20) {
      alertaEl.textContent = "⚡ Alerta: economizando pouco. Revise seus gastos variáveis.";
    } else if (saude < 50) {
      alertaEl.textContent = "👍 Bom: você está economizando, mas pode melhorar.";
    } else {
      alertaEl.textContent = "🎉 Excelente! Você está economizando bem. Continue assim!";
    }
  }

  const objetivosEl = document.querySelector("[data-insight=objetivos]");
  if (objetivosEl) {
    const objetivoValor = parseNumber(state.config.objetivoValor);
    if (objetivoValor > 0) {
      const progresso = Math.min((saldo / objetivoValor) * 100, 100).toFixed(1);
      objetivosEl.textContent = `Progresso da meta: ${progresso}% de ${formatCurrency(
        objetivoValor
      )}`;
    } else {
      objetivosEl.textContent = "Defina uma meta em Configurações para acompanhar o progresso.";
    }
  }
}

function mediaResumoText(media, tendencia) {
  const tendenciaTexto = tendencia >= 0 ? "alta" : "queda";
  return `Média dos últimos 3 meses: ${formatCurrency(media)} • Tendência em ${tendenciaTexto} (${formatCurrency(
    Math.abs(tendencia)
  )})`;
}

function filterTransactions(transactions) {
  const now = new Date();
  if (transactionFilter === "mes") {
    return transactions.filter((tx) => {
      const data = new Date(tx.data);
      return data.getMonth() === now.getMonth() && data.getFullYear() === now.getFullYear();
    });
  }
  if (transactionFilter === "30dias") {
    const limite = new Date();
    limite.setDate(limite.getDate() - 30);
    return transactions.filter((tx) => new Date(tx.data) >= limite);
  }
  if (transactionFilter === "90dias") {
    const limite = new Date();
    limite.setDate(limite.getDate() - 90);
    return transactions.filter((tx) => new Date(tx.data) >= limite);
  }
  return transactions;
}

function updateTransactionsTable() {
  const table = document.querySelector("[data-table=transacoes]");
  if (!table) return;
  const filtradas = filterTransactions(state.transactions);
  table.innerHTML = filtradas.length
    ? filtradas
        .slice()
        .sort((a, b) => new Date(b.data) - new Date(a.data))
        .slice(0, 50)
        .map(
          (tx) => `
        <tr>
          <td>${tx.tipo}</td>
          <td>${tx.categoria}</td>
          <td>${tx.descricao}</td>
          <td>${new Date(tx.data).toLocaleDateString("pt-BR")}</td>
          <td>${formatCurrency(tx.valor)}</td>
          <td>${tx.fixo ? "Sim" : "Não"}</td>
          <td>
            <button class="btn secondary" data-action="excluir" data-id="${tx.id}">Excluir</button>
          </td>
        </tr>
      `
        )
        .join("")
    : "<tr><td colspan=7>Sem registros.</td></tr>";
}

function attachTransactionActions() {
  const form = document.getElementById("transactionForm");
  if (!form) return;

  const categoriaSelect = document.getElementById("categoria");
  categoriaSelect.innerHTML = state.config.categorias
    .map((cat) => `<option value="${cat}">${cat}</option>`)
    .join("");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    const parcelas = Number(payload.parcelas || 1);

    for (let i = 0; i < parcelas; i += 1) {
      const data = new Date(payload.data);
      data.setMonth(data.getMonth() + i);
      // eslint-disable-next-line no-await-in-loop
      await saveTransaction({
        tipo: payload.tipo,
        categoria: payload.categoria,
        descricao: payload.descricao,
        valor: parseNumber(payload.valor),
        data: data.toISOString(),
        fixo: payload.fixo === "true",
        anotacoes: payload.anotacoes || "",
        createdAt: new Date().toISOString(),
      });
    }

    form.reset();
    await refreshTransactions();
    alert("Transação salva com sucesso");
  });

  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action=excluir]");
    if (button) {
      await deleteTransaction(Number(button.dataset.id));
      refreshTransactions();
    }
  });

  document.querySelector("[data-action=limpar-form]")?.addEventListener("click", () => form.reset());
  document.querySelector("[data-action=exportar-json]")?.addEventListener("click", exportarJSON);
  document
    .querySelector("[data-action=importar-json]")
    ?.addEventListener("click", importarJSON);
  const filtro = document.querySelector("[data-filter=periodo]");
  if (filtro) {
    filtro.value = transactionFilter;
    filtro.addEventListener("change", () => {
      transactionFilter = filtro.value;
      updateTransactionsTable();
    });
  }
}

function exportarJSON() {
  const blob = new Blob([JSON.stringify(state.transactions)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `meufin-backup-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importarJSON() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    await Promise.all(data.map((tx) => saveTransaction(tx)));
    refreshTransactions();
  };
  input.click();
}

function exportarCSV() {
  const header = "tipo,categoria,descricao,data,valor,fixo\n";
  const rows = state.transactions
    .map((tx) =>
      [tx.tipo, tx.categoria, tx.descricao, tx.data, tx.valor, tx.fixo].join(",")
    )
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `meufin-${Date.now()}.csv`;
  link.click();
}

async function refreshTransactions() {
  state.transactions = await getAllTransactions();
  state.metrics = computeMetrics(state.transactions);
  updateDashboardUI();
  updateTransactionsTable();
  persistBackup();
  maybeNotifyUpcoming();
}

function initThemeToggle() {
  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;
  toggle.checked = state.config.theme === "dark";
  document.documentElement.dataset.theme = state.config.theme;
  toggle.addEventListener("change", async () => {
    state.config.theme = toggle.checked ? "dark" : "light";
    document.documentElement.dataset.theme = state.config.theme;
    await saveConfig(state.config);
  });
}

function fillConfigPage() {
  if (page !== "config") return;
  
  // Ocultar seção de integração EmailJS para não-admin
  // E mostrar link admin para administradores
  isAdmin().then((admin) => {
    const emailSection = document.getElementById("emailjs-section");
    const adminLinkSection = document.getElementById("admin-link-section");
    if (emailSection) {
      emailSection.classList.toggle("hidden", !admin);
    }
    if (adminLinkSection) {
      adminLinkSection.classList.toggle("hidden", !admin);
    }
  });
  
  const map = {
    nomeUsuario: "nomeUsuario",
    metaEconomia: "metaEconomia",
    objetivoDescricao: "objetivoDescricao",
    objetivoValor: "objetivoValor",
    emailService: "emailService",
    emailTemplate: "emailTemplate",
    emailPublic: "emailPublic",
    emailPrivate: "emailPrivate",
    emailDestinatario: "emailDestinatario",
    whatsNumero: "whatsNumero",
    whatsMetodo: "whatsMetodo",
    webhookUrl: "webhookUrl",
    notificarVencimentos: "notificarVencimentos",
    notificarObjetivos: "notificarObjetivos",
    lembreteHorario: "lembreteHorario",
  };

  Object.entries(map).forEach(([configKey, inputId]) => {
    const el = document.getElementById(inputId);
    if (el && state.config[configKey] !== undefined) {
      if (el.type === "checkbox") {
        el.checked = Boolean(state.config[configKey]);
      } else {
        el.value = state.config[configKey];
      }
    }
  });

  document
    .querySelector("[data-action=salvar-config]")
    ?.addEventListener("click", async () => {
      Object.entries(map).forEach(([configKey, inputId]) => {
        const el = document.getElementById(inputId);
        if (!el) return;
        state.config[configKey] = el.type === "checkbox" ? el.checked : el.value;
      });
      await saveConfig(state.config);
      alert("Configurações salvas");
    });

  document
    .querySelector("[data-action=resetar-config]")
    ?.addEventListener("click", async () => {
      state.config = { ...defaultConfig };
      await saveConfig(state.config);
      fillConfigPage();
    });

  document
    .querySelector("[data-action=testar-whatsapp]")
    ?.addEventListener("click", async () => {
      try {
        await sendWhatsApp({
          endpoint: document.getElementById("webhookUrl").value,
          numero: document.getElementById("whatsNumero").value,
          mensagem: "Teste de automação Meufin",
          pdfBase64: null,
        });
        alert("Mensagem enviada (verifique o bot)");
      } catch (error) {
        alert(error.message);
      }
    });

  document
    .querySelector("[data-action=baixar-bot]")
    ?.addEventListener("click", () => {
      window.open("docs/overview.md", "_blank");
    });

  document
    .querySelector("[data-action=ativar-notificacoes]")
    ?.addEventListener("click", enableNotifications);
}

async function handleRelatorioPage() {
  if (page !== "relatorio") return;
  await loadReports();

  // Initialize charts for report page
  initDashboardCharts();
  const { entradas, saidas, historico, saude } = calculateDashboardMetrics();
  updateDashboardCharts({
    entradas,
    saidas,
    historico,
    saude,
  });

  document
    .querySelector("[data-action=gerar-pdf]")
    ?.addEventListener("click", gerarPdfAtual);
  document
    .querySelector("[data-action=enviar-email]")
    ?.addEventListener("click", enviarEmailAtual);
  document
    .querySelector("[data-action=enviar-whatsapp]")
    ?.addEventListener("click", enviarWhatsAppAtual);
  document
    .querySelector("[data-action=limpar-relatorios]")
    ?.addEventListener("click", async () => {
      await clearStore("relatorios");
      await loadReports();
    });
}

async function loadReports() {
  state.reports = await listReports();
  const table = document.querySelector("[data-table=relatorios]");
  if (!table) return;
  table.innerHTML = state.reports.length
    ? state.reports
        .map(
          (report) => `
        <tr>
          <td>${new Date(report.createdAt).toLocaleString("pt-BR")}</td>
          <td>${report.periodo || "-"}</td>
          <td>${report.metrics?.saude?.toFixed?.(1) || "-"}%</td>
          <td>${report.status || "Gerado"}</td>
          <td>
            <button class="btn secondary" data-action="download-relatorio" data-id="${report.id}">Download</button>
          </td>
        </tr>
      `
        )
        .join("")
    : "<tr><td colspan=5>Nenhum relatório gerado ainda.</td></tr>";

  table.querySelectorAll("[data-action=download-relatorio]").forEach((btn) => {
    btn.addEventListener("click", () => downloadReport(btn.dataset.id));
  });
}

function downloadReport(id) {
  const report = state.reports.find((r) => String(r.id) === String(id));
  if (!report?.pdfBase64) return;
  const link = document.createElement("a");
  link.href = report.pdfBase64;
  link.download = `relatorio-meufin-${id}.pdf`;
  link.click();
}

async function gerarPdfAtual() {
  try {
    const periodo = buildPeriodo();
    const resumoCustom = document.getElementById("resumoCustom")?.value;
    const pdf = await generateFinancialPdf({
      metrics: state.metrics,
      transactions: state.transactions,
      config: state.config,
      periodo,
      resumoCustom,
    });
    await persistReport({
      pdfBase64: pdf.base64,
      periodo,
      metrics: state.metrics,
      resumo: resumoCustom,
    });
    await loadReports();
    renderPreview(pdf.base64);
    alert("PDF gerado com sucesso");
    return pdf;
  } catch (error) {
    alert(error.message);
    return null;
  }
}

function renderPreview(base64) {
  const preview = document.getElementById("relatorioPreview");
  if (!preview) return;
  if (base64) {
    preview.innerHTML = `<iframe title="Preview PDF" src="${base64}" style="width:100%;height:420px;border:none;border-radius:20px;"></iframe>`;
  }
}

async function enviarEmailAtual() {
  const pdf = await gerarPdfAtual();
  if (!pdf) return;
  const destinatario = state.config.emailDestinatario;
  if (!destinatario) {
    alert("Configure o e-mail destinatário em Configurações");
    return;
  }
  const payload = {
    to_email: destinatario,
    user: state.config.nomeUsuario || "Usuário",
    resumo: mediaResumoText(state.metrics.media3m, state.metrics.tendencia),
    pdf: pdf.base64,
  };
  const result = await sendEmailReport({
    serviceId: state.config.emailService,
    templateId: state.config.emailTemplate,
    publicKey: state.config.emailPublic,
    privateKey: state.config.emailPrivate,
    payload,
  });
  alert(result.queued ? "Sem conexão, e-mail enfileirado" : "E-mail enviado para " + destinatario);
}

async function enviarWhatsAppAtual() {
  const pdf = await gerarPdfAtual();
  if (!pdf) return;
  const numero = state.config.whatsNumero;
  if (!numero) {
    alert("Configure o número do WhatsApp em Configurações");
    return;
  }
  try {
    await sendWhatsApp({
      endpoint: state.config.webhookUrl,
      numero,
      mensagem: `Relatório financeiro ${buildPeriodo()}`,
      pdfBase64: pdf.base64,
    });
    alert("WhatsApp enviado para +55" + numero.replace(/\D/g, ""));
  } catch (error) {
    alert(error.message);
  }
}

function buildPeriodo() {
  const inicio = document.getElementById("periodoInicio")?.value;
  const fim = document.getElementById("periodoFim")?.value;
  if (!inicio || !fim) {
    return "Últimos 30 dias";
  }
  return `${new Date(inicio).toLocaleDateString("pt-BR")} - ${new Date(fim).toLocaleDateString(
    "pt-BR"
  )}`;
}

function registerGlobalActions() {
  document
    .querySelector("[data-action=gerar-relatorio]")
    ?.addEventListener("click", () => {
      window.location.href = "relatorio.html";
    });
  document
    .querySelector("[data-action=nova-transacao]")
    ?.addEventListener("click", () => {
      window.location.href = "entradas.html";
    });

  document
    .querySelector("[data-action=ver-todas]")
    ?.addEventListener("click", () => {
      window.location.href = "entradas.html#lista";
    });

  document
    .querySelectorAll("[data-action=exportar-csv]")
    .forEach((btn) => btn.addEventListener("click", exportarCSV));

  document
    .querySelector("[data-action=download-csv]")
    ?.addEventListener("click", exportarCSV);

  document
    .querySelector("[data-action=baixar-pdf]")
    ?.addEventListener("click", () => {
      const ultimo = state.reports.at(-1);
      if (ultimo?.pdfBase64) {
        const link = document.createElement("a");
        link.href = ultimo.pdfBase64;
        link.download = `relatorio-meufin-${ultimo.id}.pdf`;
        link.click();
      } else {
        alert("Gere um relatório primeiro");
      }
    });

  document.body.addEventListener("click", async (event) => {
    const excluirBtn = event.target.closest("[data-action=excluir]");
    if (excluirBtn) {
      await deleteTransaction(Number(excluirBtn.dataset.id));
      refreshTransactions();
    }
    const editarBtn = event.target.closest("[data-action=editar]");
    if (editarBtn) {
      window.location.href = "entradas.html";
    }
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) =>
      console.warn("SW falhou", error)
    );
  }
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    alert("Navegador sem suporte a notificações");
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    new Notification("Meufin", { body: "Notificações ativadas" });
  } else {
    alert("Permissão negada");
  }
}

function persistBackup() {
  localStorage.setItem(
    "meufin_auto_backup",
    JSON.stringify({ updatedAt: Date.now(), transactions: state.transactions })
  );
}

function shouldNotify(key) {
  const raw = localStorage.getItem(NOTIFY_KEY);
  const data = raw ? JSON.parse(raw) : {};
  const last = data[key] || 0;
  if (Date.now() - last < 1000 * 60 * 60) {
    return false;
  }
  data[key] = Date.now();
  localStorage.setItem(NOTIFY_KEY, JSON.stringify(data));
  return true;
}

function maybeNotifyUpcoming() {
  if (!("Notification" in window)) return;
  if (!state.config.notificarVencimentos && !state.config.notificarObjetivos) return;
  if (Notification.permission !== "granted") return;
  const now = new Date();
  const limite = new Date();
  limite.setDate(now.getDate() + 3);
  const proximas = state.transactions.filter((tx) => {
    if (tx.tipo !== "saida") return false;
    const data = new Date(tx.data);
    return data >= now && data <= limite;
  });
  if (proximas.length && shouldNotify("vencimentos")) {
    new Notification("Contas próximas", {
      body: `${proximas.length} conta(s) vencem até ${limite.toLocaleDateString("pt-BR")}`,
    });
  }

  if (state.config.notificarObjetivos && shouldNotify("objetivos")) {
    const objetivo = parseNumber(state.config.objetivoValor);
    if (objetivo > 0) {
      const progresso = Math.min((state.metrics.saldo / objetivo) * 100, 100).toFixed(1);
      new Notification("Meta financeira", { body: `Você atingiu ${progresso}% da meta.` });
    }
  }
}

async function bootstrap() {
  // Verificar autenticação
  currentSession = await getCurrentSession();
  if (!currentSession && page !== "login") {
    window.location.href = "login.html";
    return;
  }
  
  // Mostrar nome do usuário no header se existir
  const userDisplay = document.querySelector("[data-user-name]");
  if (userDisplay && currentSession) {
    userDisplay.textContent = currentSession.nome || currentSession.email;
  }
  
  // Botão de logout
  document.querySelector("[data-action=logout]")?.addEventListener("click", logout);
  
  await initDB();
  const configFromDb = await getConfig();
  state.config = { ...defaultConfig, ...(configFromDb || {}) };
  document.documentElement.dataset.theme = state.config.theme || "light";
  await refreshTransactions();
  await handleRelatorioPage();
  attachTransactionActions();
  fillConfigPage();
  initThemeToggle();
  registerGlobalActions();
  updateTransactionsTable();
  registerServiceWorker();
  if (navigator.onLine) {
    flushEmailQueue();
  }
}

bootstrap();

window.addEventListener("online", () => flushEmailQueue());
