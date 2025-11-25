import express from "express";
import bodyParser from "body-parser";
import venom from "venom-bot";

const PORT = process.env.PORT || 3334;
const ENDPOINT = "/send-whatsapp";
let client;

function normalize(number) {
  const digits = number.replace(/\D/g, "");
  return number.endsWith("@c.us") ? number : `${digits}@c.us`;
}

async function initClient() {
  client = await venom.create({ session: "meufin" });
}

async function startServer() {
  await initClient();
  const app = express();
  app.use(bodyParser.json({ limit: "25mb" }));

  app.post(ENDPOINT, async (req, res) => {
    try {
      if (!client) {
        res.status(503).json({ error: "Venom não inicializado" });
        return;
      }
      const { to, message, pdfBase64 } = req.body;
      const jid = normalize(to);
      if (pdfBase64) {
        await client.sendFileFromBase64(jid, pdfBase64, "relatorio-meufin.pdf", message || "Relatório");
      } else {
        await client.sendText(jid, message || "Mensagem vazia");
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("Erro Venom", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.listen(PORT, () => console.log(`Venom webhook em http://localhost:${PORT}${ENDPOINT}`));
}

startServer();
