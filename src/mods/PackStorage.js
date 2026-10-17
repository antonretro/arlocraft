/**
 * Tiny IndexedDB store for user-installed texture packs and mods, so they
 * survive reloads. Values are { name, blob } records keyed by id.
 */
const DB_NAME = 'arlocraft-content';
const STORE = 'files';

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined')
      return reject(new Error('no IndexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const PackStorage = {
  get: (key) => run('readonly', (s) => s.get(key)).catch(() => undefined),
  set: (key, value) => run('readwrite', (s) => s.put(value, key)),
  delete: (key) => run('readwrite', (s) => s.delete(key)),
  keys: () => run('readonly', (s) => s.getAllKeys()).catch(() => []),
};
