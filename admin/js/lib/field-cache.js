import * as api from './api.js';
import { localAccount, accessDenied } from './field-identity.js';
import { request, transaction } from './field-storage.js';

export const MAX_JOBS = 20;
export const OFFLINE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 10 * 1024 * 1024;
const DB = 'ns-field-work';
function store(mode, work) {
  return transaction(DB, 1, db => {
    db.createObjectStore('accounts', { keyPath: 'id' });
    db.createObjectStore('drafts', { keyPath: 'key' });
  }, ['accounts', 'drafts'], mode, work);
}

async function accountId(expected) {
  const id = await localAccount();
  if (!id) throw new Error('Sign in online before saving work on this device.');
  if (expected && id !== expected) throw new Error('Account changed. This draft belongs to the previous account.');
  return id;
}

export async function snapshot() {
  const id = await localAccount();
  return id ? store('readonly', tx => request(tx.objectStore('accounts').get(id))) : null;
}

export async function forget(id = null) {
  id ||= await localAccount();
  if (id) await store('readwrite', tx => request(tx.objectStore('accounts').delete(id)));
  // Drafts and queued writes are retained for their original account.
}

export async function usableSnapshot() {
  const data = await snapshot();
  const age = Date.now() - data?.savedAt;
  if (!data || data.version !== 1 || !Number.isFinite(age) || age < 0 || age > OFFLINE_AGE_MS) return null;
  return data;
}

export async function prepareWork(today, upcoming) {
  if (!navigator.onLine) throw new Error('Reconnect before saving fresh work.');
  const id = await accountId();
  const selected = [...new Map([...today, ...upcoming].map(job => [job.id, job])).values()].slice(0, MAX_JOBS);
  const refs = Object.fromEntries(await Promise.all([
    ['services', 'listServices'], ['modifiers', 'listModifiers'], ['siteFactors', 'listSiteFactors'],
    ['flags', 'listInspectionFlags'], ['flagMap', 'listServiceFlagMap'], ['settings', 'getSettings']
  ].map(async ([key, method]) => [key, await api[method]()])));
  const jobs = {};
  // At most one job's reads in flight; never unbounded fan-out over the office.
  for (const job of selected) {
    try {
      const [detail, sections, measurements, notes, attachments, quotes] = await Promise.all([
        api.getJob(job.id), api.listSections(job.id), api.listMeasurements(job.id),
        api.listNotes(job.id), api.listAttachments(job.id), api.listQuotes(job.id)
      ]);
      if (!detail || detail.id !== job.id) throw new Error('The visit is no longer accessible.');
      jobs[job.id] = { job: detail, sections, measurements, notes, attachments, quotes };
    } catch (error) {
      if (accessDenied(error)) await forget(id);
      throw error; // An incomplete preparation never replaces a good snapshot.
    }
  }
  const result = { id, version: 1, savedAt: Date.now(), refs, jobs,
    today: today.filter(job => jobs[job.id]), upcoming: upcoming.filter(job => jobs[job.id]) };
  if (new Blob([JSON.stringify(result)]).size > MAX_BYTES) throw new Error('Work exceeds the 10 MB offline limit. Reduce the selected schedule.');
  if (await localAccount() !== id) throw new Error('Account changed while saving work. Retry after signing in.');
  await store('readwrite', async tx => {
    const accounts = tx.objectStore('accounts');
    const others = (await request(accounts.getAll())).filter(item => item.id !== id).sort((a,b) => b.savedAt-a.savedAt);
    let bytes = new Blob([JSON.stringify(result)]).size;
    for (const item of others) {
      bytes += new Blob([JSON.stringify(item)]).size;
      if (bytes > MAX_BYTES) accounts.delete(item.id);
    }
    return request(accounts.put(result));
  });
  const persistent = await navigator.storage?.persist?.().catch(() => false);
  return { count: selected.length, truncated: today.length + upcoming.length > MAX_JOBS, persistent: !!persistent };
}

export async function readDraft(jobId, name) {
  const id = await accountId();
  return store('readonly', tx => request(tx.objectStore('drafts').get([id, jobId, name])));
}

export async function writeDraft(jobId, name, value, expectedOwner) {
  const id = await accountId(expectedOwner);
  if (new Blob([JSON.stringify(value)]).size > 100000) throw new Error('Draft exceeds the 100 KB limit.');
  await store('readwrite', async tx => {
    const drafts = tx.objectStore('drafts');
    const key = [id, jobId, name];
    if (await request(drafts.count()) >= 200 && !await request(drafts.get(key)))
      throw new Error('Device draft storage is full. Review existing drafts before adding more.');
    return request(drafts.put({ key, value, savedAt: Date.now() }));
  });
}

export async function deleteDraft(jobId, name, expectedOwner) {
  const id = await accountId(expectedOwner);
  await store('readwrite', tx => request(tx.objectStore('drafts').delete([id, jobId, name])));
}

// Preserve unsubmitted notes without adding a fifth outbox write type.
export async function retainNoteDraft(jobId, input, visibility, status) {
  const owner = await accountId();
  const existing = await readDraft(jobId, 'note');
  if (existing && !input.value) {
    input.value = existing.value.body;
    visibility.value = existing.value.visibility;
    status.textContent = 'Draft restored from this device. It has not been sent.';
  }
  let chain = Promise.resolve();
  const save = () => {
    const value = { body: input.value, visibility: visibility.value };
    chain = chain.catch(() => {}).then(() => writeDraft(jobId, 'note', value, owner));
    chain.then(() => { if (input.isConnected) status.textContent = 'Draft saved on this device — not sent.'; },
      error => { if (input.isConnected) status.textContent = `Draft not saved: ${error.message}`; });
  };
  input.addEventListener('input', save);
  visibility.addEventListener('change', save);
  return async () => { await chain; await deleteDraft(jobId, 'note', owner); };
}
