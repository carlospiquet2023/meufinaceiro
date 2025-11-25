import { saveReport } from "./db.js";

function getJsPDF() {
  // Tentar acessar jsPDF de diferentes formas
  const jspdfLib = window.jspdf || window.jsPDF;
  if (jspdfLib && jspdfLib.jsPDF) {
    return jspdfLib.jsPDF;
  }
  if (typeof jsPDF !== 'undefined') {
    return jsPDF;
  }
  throw new Error("jsPDF não encontrado. Recarregue a página ou verifique sua conexão.");
}

async function canvasToDataUrl(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  return canvas.toDataURL("image/png");
}

function buildQRCode(data) {
  if (!window.QRCode) return null;
  const temp = document.createElement("div");
  const qr = new QRCode(temp, {
    text: data,
    width: 120,
    height: 120,
  });
  const img = temp.querySelector("img") || temp.querySelector("canvas");
  const dataUrl = img?.src || img?.toDataURL?.("image/png");
  qr.clear();
  return dataUrl || null;
}

function formatCurrency(value = 0) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export async function generateFinancialPdf({
  metrics,
  transactions,
  config,
  periodo,
  resumoCustom,
}) {
  const JsPDF = getJsPDF();
  const doc = new JsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 40;
  let cursorY = margin;

  const addTitle = (text) => {
    doc.setFontSize(18);
    doc.setTextColor(15, 76, 117);
    doc.text(text, margin, cursorY);
    cursorY += 28;
  };

  const addParagraph = (text) => {
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    const splitted = doc.splitTextToSize(text, 520);
    doc.text(splitted, margin, cursorY);
    cursorY += splitted.length * 14 + 10;
  };

  addTitle("Meufin • Relatório Financeiro");
  doc.setFontSize(12);
  doc.text(`Período: ${periodo}`, margin, cursorY);
  cursorY += 20;
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, cursorY);
  cursorY += 20;

  addTitle("Resumo");
  addParagraph(
    `Saldo Atual: ${formatCurrency(metrics.saldo)} | Entradas: ${formatCurrency(
      metrics.entradas
    )} | Saídas: ${formatCurrency(metrics.saidas)} | Saúde Financeira: ${metrics.saude.toFixed(
      1
    )}%`
  );

  if (resumoCustom) {
    addTitle("Observações do usuário");
    addParagraph(resumoCustom);
  }

  doc.autoTable({
    startY: cursorY,
    head: [["Data", "Descrição", "Categoria", "Tipo", "Valor"]],
    body: transactions.map((tx) => [
      new Date(tx.data).toLocaleDateString("pt-BR"),
      tx.descricao,
      tx.categoria,
      tx.tipo,
      formatCurrency(tx.valor),
    ]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [15, 76, 117] },
  });
  cursorY = doc.lastAutoTable.finalY + 20;

  addTitle("Gráficos");
  const charts = ["chartEntradasSaidas", "chartHistorico", "chartSaude"];
  for (const id of charts) {
    // eslint-disable-next-line no-await-in-loop
    const dataUrl = await canvasToDataUrl(id);
    if (dataUrl) {
      doc.addImage(dataUrl, "PNG", margin, cursorY, 240, 180);
      cursorY += 190;
    }
  }

  const qrData = buildQRCode(config?.shareUrl || window.location.href);
  if (qrData) {
    doc.addImage(qrData, "PNG", margin, cursorY, 100, 100);
    doc.text("Acesse o painel digital", margin + 120, cursorY + 50);
  }

  const blob = doc.output("blob");
  const base64 = doc.output("datauristring");
  const fileName = `relatorio-meufin-${Date.now()}.pdf`;

  return { blob, base64, fileName };
}

export async function persistReport({ pdfBase64, periodo, metrics, resumo }) {
  return saveReport({ periodo, metrics, resumo, pdfBase64 });
}
