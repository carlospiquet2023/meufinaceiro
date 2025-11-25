function normalizePhone(number) {
  if (!number) throw new Error("Informe um número");
  const digits = number.replace(/\D/g, "");
  if (digits.length < 10) {
    throw new Error("Número inválido. Use DDD + telefone");
  }
  return `+55${digits}`;
}

export async function sendWhatsApp({ endpoint, numero, mensagem, pdfBase64 }) {
  if (!endpoint) {
    throw new Error("Configure o endpoint local do bot (ex.: http://localhost:3333/send-whatsapp)");
  }

  const body = {
    to: normalizePhone(numero),
    message: mensagem,
    pdfBase64,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha no envio WhatsApp: ${errorText}`);
  }

  return response.json();
}
