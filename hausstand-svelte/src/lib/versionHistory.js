// Portable project history. The current project stays readable at the JSON root;
// only previously saved complete states are compressed into the trailing archive.
import { collectItemNumbers, applyItemNumbers } from './itemNumbers.js';
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
  await verifyPortableHistory(current, () => {}, [previousSaved]);
  const merged=collectItemNumbers([previousSaved,current]);
  Object.assign(current,applyItemNumbers(current,merged));
  const entries = [...getVersionEntries(current)];
  const baseline = previousSaved ? getVersionEntries(previousSaved) : [];
  // Refuse to save if an existing in-file archive has been truncated.
  if (baseline.some(entry => !entries.some(currentEntry => currentEntry.id === entry.id))) {
    throw new Error('Das Versionsarchiv ist unvollständig. Speichern wurde abgebrochen.');
  }
  const businessChanged = previousSaved && hasProjectChanges(current, previousSaved);
  const archiveChanged = JSON.stringify(entries) !== JSON.stringify(baseline);
  if (previousSaved && !businessChanged && !archiveChanged) return applyItemNumbers(copy(previousSaved),merged);
  if (businessChanged) entries.push(await archiveEntry(previousSaved, previousSaved.lastSavedAt));
  const { versionHistory: _ignored, ...root } = current;
  return { ...root, lastSavedAt: savedAt, versionHistory: { format: FORMAT, entries } };
}

// An explicit server-file import is not an ordinary edit: the imported file
// may be an older copy or a completely different household. Validate each
// archive independently before attempting to preserve both histories.
export async function prepareServerReplacement(imported, previousSaved, savedAt = new Date().toISOString()) {
  const source = copy(requireProjectFile(imported));
  const previous = copy(requireProjectFile(previousSaved));
  await verifyPortableHistory(source);
  await verifyPortableHistory(previous);
  const entries = new Map(getVersionEntries(previous).map(entry=>[entry.id,entry]));
  let incompatible = false;
  for (const entry of getVersionEntries(source)) {
    const existing = entries.get(entry.id);
    if (existing && ['sha256','data','encoding','savedAt'].some(key=>existing[key]!==entry[key])) {
      incompatible = true;
      break;
    }
    entries.set(entry.id,existing || entry);
  }
  if (!incompatible) {
    const merged = {...source,versionHistory:{format:FORMAT,entries:[...entries.values()]
      .sort((a,b)=>String(a.savedAt).localeCompare(String(b.savedAt)))}};
    try {
      return {saved:await createPortableSave(merged,previous,savedAt), replacesHistory:false};
    } catch (error) {
      if (error?.message !== 'INVALID_ITEM_NUMBER_REGISTRY') throw error;
    }
  }
  // Separate projects can have conflicting permanent item numbers. Never
  // renumber either archive, or silently discard the server's saved history.
  // The caller MUST explicitly confirm this result and protect the old file.
  return {saved:await createPortableSave(source,null,savedAt), replacesHistory:true};
}

async function readRawPortableVersion(project, versionId) {
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

// Restore business data, not the current identity allocation state.
export async function readPortableVersion(project, versionId) {
  await verifyPortableHistory(project);
  const snapshot=await readRawPortableVersion(project,versionId);
  const registry=collectItemNumbers([project,snapshot]);
  return applyItemNumbers(snapshot,registry);
}

// Check every embedded snapshot before accepting a file. Do not silently
// carry incompatible historical snapshots into the new storage format.
export async function verifyPortableHistory(project, validate = () => {}, related = []) {
  const ids=new Set(), snapshots=[];
  for(const entry of getVersionEntries(project)) {
    if(typeof entry?.id !== 'string' || !entry.id || ids.has(entry.id))
      throw new Error('Unbekanntes oder beschädigtes Versionsarchiv. Die Datei wurde nicht verändert.');
    ids.add(entry.id);
    snapshots.push(await readRawPortableVersion(project,entry.id));
  }
  // Preserve assigned identities, then migrate unnumbered records by the
  // recorded creation event across history, saved baseline and working copy.
  // Keep compressed bytes and hashes intact.
  const registry=collectItemNumbers([...snapshots,...related,project]);
  for (const snapshot of snapshots) await validate(applyItemNumbers(snapshot,registry));
  Object.assign(project,applyItemNumbers(project,registry));
}
