// Versioned, authenticated encrypted project container; no server-side decryption.
const FORMAT = 'hausstand-aesgcm-v1';
const ITERATIONS = 600000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const random = size => crypto.getRandomValues(new Uint8Array(size));
const base64 = bytes => {
  let result = '';
  for (let start = 0; start < bytes.length; start += 8192) {
    result += String.fromCharCode(...bytes.subarray(start, start + 8192));
  }
  return btoa(result);
};
const unbase64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export const randomSecret = () => [...random(32)].map(c => c.toString(16).padStart(2, '0')).join('');
export const hashSecret = async secret => {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return [...new Uint8Array(hash)].map(c => c.toString(16).padStart(2, '0')).join('');
};
export const isEncryptedEnvelope = data => data?.format === FORMAT && data?.version === 1;
const headerAAD = header => encoder.encode(JSON.stringify(header));
async function passwordKey(password, salt, iterations) {
  if (!password || password.length < 8) throw new Error('Bitte eine Passphrase mit mindestens 8 Zeichen verwenden.');
  const secret = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    secret, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function validate(envelope) {
  if (!isEncryptedEnvelope(envelope) || envelope.kdf !== 'PBKDF2-SHA256'
      || envelope.cipher !== 'AES-256-GCM' || !Number.isInteger(envelope.iterations)
      || envelope.iterations < 300000 || envelope.iterations > 2000000
      || typeof envelope.salt !== 'string' || typeof envelope.nonce !== 'string'
      || typeof envelope.ciphertext !== 'string')
    throw new Error('Unbekanntes oder ungültiges verschlüsseltes Dateiformat.');
  const salt = unbase64(envelope.salt);
  const nonce = unbase64(envelope.nonce);
  if (salt.length !== 16 || nonce.length !== 12) throw new Error('Ungültige Salt-/Nonce-Länge.');
  return { salt, nonce };
}
export async function encryptProject(project, password, editToken = randomSecret()) {
  if (!project || !Array.isArray(project.events)) throw new Error('Ungültiges Projekt.');
  const salt = random(16);
  const nonce = random(12);
  const header = {
    format: FORMAT, version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS,
    cipher: 'AES-256-GCM', salt: base64(salt), nonce: base64(nonce)
  };
  const key = await passwordKey(password, salt, ITERATIONS);
  const payload = encoder.encode(JSON.stringify({ project, editToken }));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: headerAAD(header), tagLength: 128 },
    key, payload
  );
  return { ...header, ciphertext: base64(new Uint8Array(ciphertext)) };
}
export async function decryptProject(envelope, password) {
  const { salt, nonce } = validate(envelope);
  const { ciphertext, ...header } = envelope;
  // Reject unexpected fields: the authenticated header must not be ambiguous.
  if (Object.keys(header).length !== 7) throw new Error('Ungültiger Verschlüsselungsheader.');
  try {
    const key = await passwordKey(password, salt, envelope.iterations);
    const decrypted = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: nonce, additionalData: headerAAD(header), tagLength: 128
    }, key, unbase64(ciphertext));
    const result = JSON.parse(decoder.decode(decrypted));
    if (!result.project || !Array.isArray(result.project.events)
        || typeof result.editToken !== 'string' || result.editToken.length < 32)
      throw new Error('Ungültiger entschlüsselter Inhalt.');
    return result;
  } catch (error) {
    throw new Error('Entschlüsselung fehlgeschlagen: falsches Passwort oder beschädigte Datei.');
  }
}
