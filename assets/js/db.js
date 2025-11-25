const DB_NAME = "meufin-db";
const DB_VERSION = 1;
const STORES = {
  transacoes: "transacoes",
  config: "config",
  relatorios: "relatorios",
};

let dbInstance;

function openDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.transacoes)) {
        const store = db.createObjectStore(STORES.transacoes, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by_date", "data", { unique: false });
        store.createIndex("by_tipo", "tipo", { unique: false });
        store.createIndex("by_fixo", "fixo", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.config)) {
        db.createObjectStore(STORES.config, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(STORES.relatorios)) {
        db.createObjectStore(STORES.relatorios, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

function withStore(storeName, mode, callback) {
  return openDB().then((db) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = callback(store);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function initDB() {
  return openDB();
}

export function saveTransaction(transacao) {
  return withStore(STORES.transacoes, "readwrite", (store) => store.put(transacao));
}

export function deleteTransaction(id) {
  return withStore(STORES.transacoes, "readwrite", (store) => store.delete(id));
}

export function getAllTransactions() {
  return withStore(STORES.transacoes, "readonly", (store) => store.getAll());
}

export function bulkInsertTransactions(lista) {
  return openDB().then((db) => {
    const tx = db.transaction(STORES.transacoes, "readwrite");
    const store = tx.objectStore(STORES.transacoes);
    lista.forEach((item) => store.put(item));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  });
}

export function saveConfig(config) {
  return withStore(STORES.config, "readwrite", (store) =>
    store.put({ key: "main", ...config })
  );
}

export function getConfig() {
  return withStore(STORES.config, "readonly", (store) => store.get("main"));
}

export function saveReport(report) {
  const payload = { createdAt: new Date().toISOString(), ...report };
  return withStore(STORES.relatorios, "readwrite", (store) => store.put(payload));
}

export function listReports() {
  return withStore(STORES.relatorios, "readonly", (store) => store.getAll());
}

export function deleteReport(id) {
  return withStore(STORES.relatorios, "readwrite", (store) => store.delete(id));
}

export function clearStore(storeName) {
  if (!Object.values(STORES).includes(storeName)) {
    throw new Error(`Store desconhecida: ${storeName}`);
  }
  return withStore(storeName, "readwrite", (store) => store.clear());
}
