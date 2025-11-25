# Meufin

Aplicativo financeiro PWA, offline-first, com IndexedDB, relatórios PDF, EmailJS e automação WhatsApp.

## Recursos

- Dashboard responsivo com KPIs, gráficos Chart.js e insights automáticos.
- CRUD de transações com categorias, recorrência e filtros rápidos.
- Armazenamento em IndexedDB (stores `transacoes`, `config`, `relatorios`).
- Relatórios profissionais via jsPDF + autoTable + QRCode, exportação CSV/JSON.
- Envio imediato por EmailJS (com fila offline) e webhook para bots WhatsApp (Baileys/Venom/WPPConnect).
- PWA completo (manifest + service worker), notificações locais e backup automático em `localStorage`.

## Estrutura

```text
assets/
  css/style.css          // UI moderna (tema claro/escuro)
  js/
    app.js               // entrada principal (estado, UI, cálculos, eventos)
    db.js                // wrapper IndexedDB
    charts.js            // instâncias Chart.js
    report.js            // geração + persistência de PDF
    email.js             // EmailJS + fila offline
    whatsapp.js          // fachada para automação
automation/
  baileys-bot.js         // exemplo Node com Baileys
  venom-bot.js           // exemplo Node com Venom
  package.json           // dependências para bots
config.html, index.html, entradas.html, relatorio.html
manifest.webmanifest, service-worker.js
```

## Uso rápido

1. Abra `index.html` (pode usar Live Server ou `npx serve .`).
2. Cadastre categorias/configurações em `config.html`.
3. Registre entradas/saídas em `entradas.html`.
4. Gere PDFs e compartilhe em `relatorio.html`.

### EmailJS

- Crie um serviço + template em <https://www.emailjs.com/>.
- No `config.html`, informe Service ID, Template ID e chaves (padrão preenchido com valores de teste fornecidos pelo usuário). As chaves ficam só no IndexedDB deste dispositivo.
- `email.js` mantém fila local caso esteja offline; assim que voltar a ficar online, tenta reenviar.

### WhatsApp Automation

- Scripts de apoio em `automation/` (Node 18+).
- Ajuste `automation/package.json`, instale dependências (`cd automation && npm install`).
- Execute `node baileys-bot.js` ou `node venom-bot.js`, faça o scan QR uma vez.
- Atualize `Webhook URL` em `config.html` para combinar com a porta usada (padrão `http://localhost:3333/send-whatsapp`).
- O front envia `{ to, message, pdfBase64 }` ao webhook; personalize o bot para anexar o PDF e imagens.

### Notificações & PWA

- Clique em "Ativar notificações" em `config.html` para permitir alertas locais (contas próximas e progresso de metas).
- Instale como PWA: o navegador mostrará o prompt após o primeiro carregamento com o SW registrado.

## Scripts auxiliares

```text
automation/
  package.json      // scripts: npm run baileys | npm run venom
```

Execute `npm run baileys` para subir o bot Baileys com watchers.

## QA / Testes sugeridos

- Testar IndexedDB em navegadores Chromium + Firefox (incluir cases de upgrade).
- Garantir que `generateFinancialPdf` funcione quando os canvases não estiverem disponíveis (relatório independente do dashboard).
- Verificar fallback de EmailJS (fila) ficando offline antes de enviar.
- Validar `sendWhatsApp` com endpoints inexistentes (mensagens de erro claras).
- Lighthouse PWA score > 90 (offline, installable, performance) e contraste AA.

## Segurança

- Nunca commitar chaves reais; use `.env.local` ou injete via CI/CD.
- Os scripts WhatsApp usam APIs não oficiais: risco de ban se fizer spam.
- `assets/img/icon-*.png` são placeholders; substitua por ícones reais antes de produção.
