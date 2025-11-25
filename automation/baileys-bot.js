import express from "express";
import bodyParser from "body-parser";
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";

const PORT = process.env.PORT || 3333;
const ENDPOINT = "/send-whatsapp";

let sock;

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      qrcode.generate(qr, { small: true });
    }
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        startSocket();
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

function normalizeNumber(number) {
  return number.endsWith("@s.whatsapp.net") ? number : `${number}@s.whatsapp.net`;
}

function pdfFromBase64(base64) {
  if (!base64) return null;
  const clean = base64.split(",").pop();
  return Buffer.from(clean, "base64");
}

async function bootstrap() {
  await startSocket();

  const app = express();
  app.use(bodyParser.json({ limit: "25mb" }));

  app.post(ENDPOINT, async (req, res) => {
    try {
      const { to, message, pdfBase64 } = req.body;
      if (!to) {
        res.status(400).json({ error: "Campo 'to' é obrigatório" });
        return;
      }

      const jid = normalizeNumber(to.replace(/\s/g, ""));
      if (pdfBase64) {
        await sock.sendMessage(jid, {
          document: pdfFromBase64(pdfBase64),
          mimetype: "application/pdf",
          fileName: "relatorio-meufin.pdf",
          caption: message || "Relatório financeiro",
        });
      } else {
        await sock.sendMessage(jid, { text: message || "Mensagem vazia" });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error("Erro ao enviar WhatsApp", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.listen(PORT, () => console.log(`Webhook WhatsApp rodando em http://localhost:${PORT}${ENDPOINT}`));
}

bootstrap();
