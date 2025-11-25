const charts = {};

export function initDashboardCharts() {
  const ChartJS = window.Chart;
  if (!ChartJS) return;
  const entradasSaidasCtx = document.getElementById("chartEntradasSaidas");
  const historicoCtx = document.getElementById("chartHistorico");
  const saudeCtx = document.getElementById("chartSaude");

  if (entradasSaidasCtx && !charts.entradasSaidas) {
    charts.entradasSaidas = new ChartJS(entradasSaidasCtx, {
      type: "doughnut",
      data: {
        labels: ["Entradas", "Saídas"],
        datasets: [
          {
            data: [0, 0],
            backgroundColor: ["#3282B8", "#FFC300"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        cutout: "65%",
        plugins: { legend: { position: "bottom" } },
      },
    });
  }

  if (historicoCtx && !charts.historico) {
    charts.historico = new ChartJS(historicoCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Saldo",
            data: [],
            fill: false,
            borderColor: "#0F4C75",
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: "#3282B8",
          },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { callback: (value) => `R$ ${value}` } },
        },
      },
    });
  }

  if (saudeCtx && !charts.saude) {
    charts.saude = new ChartJS(saudeCtx, {
      type: "doughnut",
      data: {
        labels: ["Saúde", "Risco"],
        datasets: [
          {
            data: [0, 100],
            backgroundColor: ["#4CAF50", "#E53935"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        cutout: "70%",
        plugins: { legend: { display: false } },
      },
    });
  }
}

export function updateDashboardCharts({ entradas, saidas, historico = [], saude }) {
  if (charts.entradasSaidas) {
    charts.entradasSaidas.data.datasets[0].data = [entradas, saidas];
    charts.entradasSaidas.update();
  }

  if (charts.historico) {
    charts.historico.data.labels = historico.map((item) => item.label);
    charts.historico.data.datasets[0].data = historico.map((item) => item.valor);
    charts.historico.update();
  }

  if (charts.saude) {
    const safeValue = Math.min(Math.max(saude, 0), 200);
    charts.saude.data.datasets[0].data = [safeValue, Math.max(200 - safeValue, 0)];
    charts.saude.update();
  }
}
