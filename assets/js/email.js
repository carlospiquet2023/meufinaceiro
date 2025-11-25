const QUEUE_KEY = "meufin_email_queue";
let initialized = false;

function getEmailJS() {
  const emailjs = window.emailjs;
  if (!emailjs) {
    throw new Error("EmailJS SDK não carregado");
  }
  return emailjs;
}

function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function readQueue() {
  const raw = localStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function initEmailJS(publicKey) {
  if (!publicKey || initialized) return;
  try {
    getEmailJS().init(publicKey);
    initialized = true;
  } catch (error) {
    console.warn("EmailJS init falhou", error);
  }
}

export async function sendEmailReport({ serviceId, templateId, publicKey, privateKey, payload }) {
  if (!serviceId || !templateId) {
    throw new Error("Configure Service ID e Template ID");
  }

  if (!initialized && publicKey) {
    initEmailJS(publicKey);
  }

  const job = { serviceId, templateId, publicKey, privateKey, payload };

  try {
    const emailjs = getEmailJS();
    await emailjs.send(serviceId, templateId, payload, publicKey);
    return { queued: false };
  } catch (error) {
    const queue = readQueue();
    queue.push(job);
    saveQueue(queue);
    return { queued: true, error };
  }
}

export async function flushEmailQueue() {
  const queue = readQueue();
  if (!queue.length) return 0;
  if (!window.emailjs) {
    return 0;
  }

  let sent = 0;
  const remaining = [];
  for (const job of queue) {
    try {
      if (!initialized && job.publicKey) {
        initEmailJS(job.publicKey);
      }
      const emailjs = getEmailJS();
      // eslint-disable-next-line no-await-in-loop
      await emailjs.send(job.serviceId, job.templateId, job.payload, job.privateKey);
      sent += 1;
    } catch (error) {
      remaining.push(job);
      console.warn("Falha ao reenviar email", error);
    }
  }

  saveQueue(remaining);
  return sent;
}
