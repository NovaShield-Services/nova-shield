// Resolve only after COMMIT: a request's success is not durable success.
export function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function transaction(name, version, upgrade, stores, mode, work) {
  const db = await new Promise((resolve, reject) => {
    let blocked = false;
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => upgrade(req.result, req.transaction);
    req.onsuccess = () => { if (blocked) req.result.close(); else resolve(req.result); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => { blocked = true; reject(new Error('Close other app tabs, then retry device storage.')); };
  });
  db.onversionchange = () => db.close();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result;
      let workError;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(workError || tx.error || new Error('Device storage transaction failed.'));
      try {
        result = work(tx);
        if (result?.then) result.catch(error => { workError = error; try { tx.abort(); } catch {} });
      } catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
}
