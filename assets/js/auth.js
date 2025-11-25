// Auth module - Sistema de autenticação local com IndexedDB
const DB_NAME = "meufin-auth";
const DB_VERSION = 1;
const STORE_USERS = "users";
const STORE_SESSIONS = "sessions";

let authDb = null;

function openAuthDB() {
  return new Promise((resolve, reject) => {
    if (authDb) return resolve(authDb);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      authDb = request.result;
      resolve(authDb);
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        const users = db.createObjectStore(STORE_USERS, { keyPath: "email" });
        users.createIndex("email", "email", { unique: true });
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
      }
    };
  });
}

// Hash simples para senha (em produção use bcrypt no backend)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "meufin_salt_2024");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Gerar código de recuperação
function generateRecoveryCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Salvar usuário
export async function registerUser(nome, email, senha) {
  const db = await openAuthDB();
  return new Promise(async (resolve, reject) => {
    const tx = db.transaction(STORE_USERS, "readwrite");
    const store = tx.objectStore(STORE_USERS);
    
    // Verificar se já existe
    const existing = store.get(email);
    existing.onsuccess = async () => {
      if (existing.result) {
        reject(new Error("E-mail já cadastrado"));
        return;
      }
      
      const hashedPassword = await hashPassword(senha);
      const user = {
        email,
        nome,
        senha: hashedPassword,
        isAdmin: false, // Primeiro usuário pode ser admin
        createdAt: new Date().toISOString(),
        recoveryCode: null,
        recoveryExpires: null,
      };
      
      const addRequest = store.add(user);
      addRequest.onsuccess = () => resolve(user);
      addRequest.onerror = () => reject(addRequest.error);
    };
  });
}

// Login
export async function loginUser(email, senha) {
  const db = await openAuthDB();
  return new Promise(async (resolve, reject) => {
    const tx = db.transaction(STORE_USERS, "readonly");
    const store = tx.objectStore(STORE_USERS);
    const request = store.get(email);
    
    request.onsuccess = async () => {
      const user = request.result;
      if (!user) {
        reject(new Error("Usuário não encontrado"));
        return;
      }
      
      const hashedPassword = await hashPassword(senha);
      if (user.senha !== hashedPassword) {
        reject(new Error("Senha incorreta"));
        return;
      }
      
      // Criar sessão
      const session = {
        id: "current",
        email: user.email,
        nome: user.nome,
        isAdmin: user.isAdmin,
        loginAt: new Date().toISOString(),
      };
      
      const sessionTx = db.transaction(STORE_SESSIONS, "readwrite");
      const sessionStore = sessionTx.objectStore(STORE_SESSIONS);
      sessionStore.put(session);
      
      // Salvar no localStorage para acesso rápido
      localStorage.setItem("meufin_session", JSON.stringify(session));
      
      resolve(session);
    };
    
    request.onerror = () => reject(request.error);
  });
}

// Verificar sessão atual
export async function getCurrentSession() {
  // Primeiro tentar localStorage (mais rápido)
  const cached = localStorage.getItem("meufin_session");
  if (cached) {
    return JSON.parse(cached);
  }
  
  const db = await openAuthDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_SESSIONS, "readonly");
    const store = tx.objectStore(STORE_SESSIONS);
    const request = store.get("current");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

// Logout
export async function logout() {
  localStorage.removeItem("meufin_session");
  const db = await openAuthDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_SESSIONS, "readwrite");
    const store = tx.objectStore(STORE_SESSIONS);
    store.delete("current");
    tx.oncomplete = () => {
      window.location.href = "login.html";
      resolve();
    };
  });
}

// Solicitar recuperação de senha
export async function requestPasswordReset(email) {
  const db = await openAuthDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_USERS, "readwrite");
    const store = tx.objectStore(STORE_USERS);
    const request = store.get(email);
    
    request.onsuccess = () => {
      const user = request.result;
      if (!user) {
        reject(new Error("E-mail não encontrado"));
        return;
      }
      
      const code = generateRecoveryCode();
      user.recoveryCode = code;
      user.recoveryExpires = Date.now() + 15 * 60 * 1000; // 15 minutos
      
      store.put(user);
      
      // Em produção, enviaria por email. Aqui mostramos o código
      console.log("Código de recuperação:", code);
      resolve(code);
    };
    
    request.onerror = () => reject(request.error);
  });
}

// Resetar senha com código
export async function resetPassword(email, code, novaSenha) {
  const db = await openAuthDB();
  return new Promise(async (resolve, reject) => {
    const tx = db.transaction(STORE_USERS, "readwrite");
    const store = tx.objectStore(STORE_USERS);
    const request = store.get(email);
    
    request.onsuccess = async () => {
      const user = request.result;
      if (!user) {
        reject(new Error("Usuário não encontrado"));
        return;
      }
      
      if (user.recoveryCode !== code) {
        reject(new Error("Código inválido"));
        return;
      }
      
      if (Date.now() > user.recoveryExpires) {
        reject(new Error("Código expirado"));
        return;
      }
      
      user.senha = await hashPassword(novaSenha);
      user.recoveryCode = null;
      user.recoveryExpires = null;
      
      store.put(user);
      resolve(true);
    };
    
    request.onerror = () => reject(request.error);
  });
}

// Verificar se é admin
export async function isAdmin() {
  const session = await getCurrentSession();
  return session?.isAdmin === true;
}

// Tornar usuário admin (para primeiro uso)
export async function makeAdmin(email) {
  const db = await openAuthDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_USERS, "readwrite");
    const store = tx.objectStore(STORE_USERS);
    const request = store.get(email);
    
    request.onsuccess = () => {
      const user = request.result;
      if (!user) {
        reject(new Error("Usuário não encontrado"));
        return;
      }
      user.isAdmin = true;
      store.put(user);
      
      // Atualizar sessão se estiver logado
      const session = localStorage.getItem("meufin_session");
      if (session) {
        const parsed = JSON.parse(session);
        if (parsed.email === email) {
          parsed.isAdmin = true;
          localStorage.setItem("meufin_session", JSON.stringify(parsed));
        }
      }
      
      resolve(true);
    };
    
    request.onerror = () => reject(request.error);
  });
}

// Listar todos os usuários (apenas admin)
export async function listUsers() {
  const db = await openAuthDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_USERS, "readonly");
    const store = tx.objectStore(STORE_USERS);
    const request = store.getAll();
    request.onsuccess = () => {
      const users = request.result.map((u) => ({
        email: u.email,
        nome: u.nome,
        isAdmin: u.isAdmin,
        createdAt: u.createdAt,
      }));
      resolve(users);
    };
    request.onerror = () => reject(request.error);
  });
}

// Verificar se precisa redirecionar para login
export async function requireAuth() {
  const session = await getCurrentSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

// ===========================================
// LÓGICA DA PÁGINA DE LOGIN
// ===========================================

if (document.body.dataset.page === "login") {
  initLoginPage();
}

function initLoginPage() {
  // Tabs
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".login-tabs button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
      
      btn.classList.add("active");
      document.getElementById(`tab-${tab}`)?.classList.add("active");
    });
  });

  // Login form
  document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const senha = document.getElementById("loginSenha").value;
    const errorEl = document.getElementById("loginError");
    
    try {
      await loginUser(email, senha);
      window.location.href = "index.html";
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = "block";
    }
  });

  // Cadastro form
  document.getElementById("cadastroForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = document.getElementById("cadNome").value;
    const email = document.getElementById("cadEmail").value;
    const senha = document.getElementById("cadSenha").value;
    const confirma = document.getElementById("cadConfirma").value;
    const errorEl = document.getElementById("cadError");
    const successEl = document.getElementById("cadSuccess");
    
    errorEl.style.display = "none";
    successEl.style.display = "none";
    
    if (senha !== confirma) {
      errorEl.textContent = "As senhas não coincidem";
      errorEl.style.display = "block";
      return;
    }
    
    try {
      await registerUser(nome, email, senha);
      successEl.textContent = "Conta criada! Faça login.";
      successEl.style.display = "block";
      document.getElementById("cadastroForm").reset();
      
      // Mudar para aba de login após 1.5s
      setTimeout(() => {
        document.querySelector("[data-tab=login]").click();
      }, 1500);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = "block";
    }
  });

  // Recuperar form
  let recoveryEmail = "";
  document.getElementById("recuperarForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("recEmail").value;
    const errorEl = document.getElementById("recError");
    const successEl = document.getElementById("recSuccess");
    
    errorEl.style.display = "none";
    successEl.style.display = "none";
    
    try {
      const code = await requestPasswordReset(email);
      recoveryEmail = email;
      successEl.innerHTML = `Código enviado! <strong style="user-select:all">${code}</strong><br><small>(Em produção seria enviado por e-mail)</small>`;
      successEl.style.display = "block";
      document.getElementById("resetSenhaForm").classList.add("visible");
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = "block";
    }
  });

  // Reset senha form
  document.getElementById("resetSenhaForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo = document.getElementById("recCodigo").value;
    const novaSenha = document.getElementById("recNovaSenha").value;
    const errorEl = document.getElementById("resetError");
    const successEl = document.getElementById("resetSuccess");
    
    errorEl.style.display = "none";
    successEl.style.display = "none";
    
    try {
      await resetPassword(recoveryEmail, codigo, novaSenha);
      successEl.textContent = "Senha redefinida! Faça login.";
      successEl.style.display = "block";
      
      setTimeout(() => {
        document.querySelector("[data-tab=login]").click();
      }, 1500);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = "block";
    }
  });

  // Verificar se já está logado
  getCurrentSession().then((session) => {
    if (session) {
      window.location.href = "index.html";
    }
  });
}
