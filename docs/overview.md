# Meufin PWA Overview

## Fluxograma (alto nível)

1. **Dashboard (`index.html`)**
   - Carrega métricas do `appState`.
   - Disponibiliza ações: Nova Transação, Relatório, Configurações.
2. **Formulário de Transação (`entradas.html`)**
   - Campos: tipo, categoria, descrição, data, valor, repetição, flag fixo.
   - Validações + normalização (prefixo monetário, máscara data).
   - Dispara `db.saveTransaction()` e agenda lançamentos recorrentes.
3. **Cálculos Automáticos (`app.js`)**
   - Watcher recalcula saldo, entradas, saídas, valor a pagar no mês, projeção (média móvel 3m) e saúde financeira.
   - Resultado persiste em `appState.metrics` e `db.upsertConfig()`.
4. **Dashboard Atualiza**
   - Cartões e gráficos Chart.js consomem `appState.metrics`.
   - Indicadores de tendência exibem setas/cores.
5. **Relatório PDF (`relatorio.html`)**
   - Coleta dados agregados + snapshots dos canvases.
   - `report.js` gera PDF (jsPDF + autoTable + QRCode) e salva em `relatorios`.
6. **Distribuição**
   - `email.js` envia via EmailJS.
   - `whatsapp.js` chama bot local (Baileys/Venom) para disparar PDF/imagens.
   - Download local/CSV/backup também disponíveis.

## Arquitetura

```
/assets
  /css
    style.css
  /js
    app.js
    db.js
    report.js
    email.js
    whatsapp.js
    charts.js
  /img
    (logos, ícones)
/automation
  whatsapp-bot.js
  venom-bot.js
/backup
  (saídas CSV/JSON geradas em runtime)
/docs
  overview.md
index.html
entradas.html
relatorio.html
config.html
manifest.webmanifest
service-worker.js
README.md
```

- `app.js`: inicializa páginas, gerencia estado global (Proxy), cálculos, notificações.
- `db.js`: wrapper IndexedDB (stores `transacoes`, `config`, `relatorios`).
- `report.js`: composição PDF (jsPDF, autoTable, html2canvas) + QRCode.
- `email.js`: integra EmailJS (envio imediato + fila offline).
- `whatsapp.js`: fornece façade para backends (Baileys/Venom) e máscara +55.
- `charts.js`: encapsula instâncias Chart.js para dashboard/relatório.
- `service-worker.js`: cache app shell, dados estáticos e fallback offline.

## QA Considerations

- **IndexedDB migrations**: testes para version bump e atomicidade.
- **Cálculos**: suites unitárias para média móvel, saúde financeira e valor a pagar no mês.
- **PDF**: garantir conversão de canvas funciona offline (usar `await html2canvas`).
- **EmailJS**: mockar SDK para ambientes de teste; nunca commitar chaves reais.
- **WhatsApp automation**: scripts Node isolados, logs de envio, tratamento de throttle.
- **PWA**: valida manifest + Lighthouse (offline ok, install prompt).
- **Accessibility**: contraste paleta, foco visível, labels associados.
