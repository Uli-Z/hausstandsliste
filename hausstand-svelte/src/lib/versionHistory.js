// Portable project history. The current project stays readable at the JSON root;
// only previously saved complete states are compressed into the trailing archive.
import { requireProjectFile } from './domain.js';

const FORMAT = 'portable-v1';
const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

const copy = value => typeof structuredClone === 'function'
  ? structuredClone(value) : JSON.parse(JSON.stringify(value));

export function withoutHistory(project) {
  const snapshot = copy(project);
  delete snapshot.versionHistory;
  return snapshot;
}

function businessData(project) {
  const data = withoutHistory(project);
  delete data.humanReadableSnapshot; // Generated export view, not a business edit.
  delete data.lastSavedAt;
  return data;
}

export function hasProjectChanges(project, savedProject) {
  return savedProject == null || JSON.stringify(businessData(project)) !== JSON.stringify(businessData(savedProject));
}

export function getVersionEntries(project) {
  const history = project?.versionHistory;
  if (history == null) return [];
  if (history.format !== FORMAT || !Array.isArray(history.entries)) {
    throw new Error('Unbekanntes oder beschädigtes Versionsarchiv. Die Datei wurde nicht verändert.');
  }
  return history.entries;
}

function base64(bytes) {
  let output = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    output += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(output);
}

function fromBase64(str) {
  if (typeof str !== 'string' || str.length > MAX_SNAPSHOT_BYTES * 3) {
    throw new Error('Versionsdaten sind ungültig oder zu groß.');
  }
  const raw = atob(str);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function digest(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), v => v.toString(16).padStart(2, '0')).join('');
}

async function compress(bytes) {
  if (typeof CompressionStream !== 'function') {
    throw new Error('Der Browser unterstützt die benötigte gzip-Komprimierung nicht.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return { encoding: 'gzip-base64', bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
}

async function decompress(bytes, encoding) {
  if (encoding !== 'gzip-base64' || typeof DecompressionStream !== 'function') {
    throw new Error('Diese Version kann in diesem Browser nicht entpackt werden.');
  }
  // Stream in bounded chunks; never expand a corrupted archive without a limit.
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SNAPSHOT_BYTES) {
        await reader.cancel();
        throw new Error('Entpackte Version ist zu groß.');
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let at = 0;
  for (const part of parts) { result.set(part, at); at += part.length; }
  return result;
}

async function archiveEntry(project, savedAt) {
  const snapshot = withoutHistory(project);
  const bytes = textEncoder.encode(JSON.stringify(snapshot));
  if (bytes.length > MAX_SNAPSHOT_BYTES) {
    throw new Error('Die bisherige Projektversion ist zu groß für das Versionsarchiv.');
  }
  const compressed = await compress(bytes);
  return {
    id: crypto.randomUUID(),
    savedAt,
    encoding: compressed.encoding,
    sha256: await digest(bytes),
    data: base64(compressed.bytes)
  };
}

// Call only after explicit Save, before downloading/uploading.
// A first save has no previously confirmed version to archive.
export async function createPortableSave(project, previousSaved, savedAt = new Date().toISOString()) {
  const current = copy(project);
  const entries = [...getVersionEntries(current)];
  const baseline = previousSaved ? getVersionEntries(previousSaved) : [];
  // Refuse to save if an existing in-file archive has been truncated.
  if (baseline.some(entry => !entries.some(currentEntry => currentEntry.id === entry.id))) {
    throw new Error('Das Versionsarchiv ist unvollständig. Speichern wurde abgebrochen.');
  }
  const businessChanged = previousSaved && hasProjectChanges(current, previousSaved);
  const archiveChanged = JSON.stringify(entries) !== JSON.stringify(baseline);
  if (previousSaved && !businessChanged && !archiveChanged) return copy(previousSaved);
  if (businessChanged) entries.push(await archiveEntry(previousSaved, previousSaved.lastSavedAt));
  const { versionHistory: _ignored, ...root } = current;
  return { ...root, lastSavedAt: savedAt, versionHistory: { format: FORMAT, entries } };
}

export async function readPortableVersion(project, versionId) {
  const entry = getVersionEntries(project).find(v => v.id === versionId);
  if (!entry) throw new Error('Diese Projektversion wurde nicht gefunden.');
  if (!/^[0-9a-f]{64}$/.test(entry.sha256 || '')) throw new Error('Ungültige Versionsprüfsumme.');
  const bytes = await decompress(fromBase64(entry.data), entry.encoding);
  if (bytes.byteLength > MAX_SNAPSHOT_BYTES || await digest(bytes) !== entry.sha256) {
    throw new Error('Versionsdaten sind beschädigt (Prüfsumme stimmt nicht).');
  }
  const snapshot = JSON.parse(textDecoder.decode(bytes));
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || 'versionHistory' in snapshot) {
    throw new Error('Ungültiger oder rekursiver Versionsdatensatz.');
  }
  // The archive belongs to the current project and must survive an older restore.
  return requireProjectFile({ ...snapshot, versionHistory: copy(project.versionHistory), lastSavedAt: project.lastSavedAt });
}
