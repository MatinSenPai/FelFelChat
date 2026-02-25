const HushPrefix = 'hush:v1:';
const HushAlgorithm = 'pbkdf2-sha256+a256gcm+hmac-sha256';
const HushIterations = 210000;
type ByteArray = Uint8Array<ArrayBuffer>;

interface HushEnvelopeV1 {
  v: 1;
  alg: string;
  i: number;
  s: string;
  wi: string;
  w: string;
  ci: string;
  c: string;
  h: string;
}

interface DerivedKeys {
  kek: CryptoKey;
  hmacKey: CryptoKey;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getCrypto(): Crypto {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('WebCryptoUnavailable');
  }
  return globalThis.crypto;
}

function concatBytes(parts: ByteArray[]): ByteArray {
  const totalLength = parts.reduce((sum, item) => sum + item.length, 0);
  const result: ByteArray = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function encodeBase64(bytes: ByteArray): string {
  if (typeof btoa === 'function') {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

function decodeBase64(value: string): ByteArray {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const output: ByteArray = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      output[i] = binary.charCodeAt(i);
    }
    return output;
  }
  const source = Buffer.from(value, 'base64');
  const output: ByteArray = new Uint8Array(source.length);
  output.set(source);
  return output;
}

function encodeBase64Url(bytes: ByteArray): string {
  return encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): ByteArray {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return decodeBase64(`${normalized}${padding}`);
}

function scopedPassphrase(passphrase: string, context: string): string {
  return `${context}::${passphrase}`;
}

async function deriveKeys(passphrase: string, context: string, salt: ByteArray, iterations: number): Promise<DerivedKeys> {
  const crypto = getCrypto();
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(scopedPassphrase(passphrase, context)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const masterKeyRaw: ByteArray = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt,
        iterations,
      },
      material,
      256
    )
  );
  const hkdfMaterial = await crypto.subtle.importKey('raw', masterKeyRaw, 'HKDF', false, ['deriveBits']);
  const hkdfSalt: ByteArray = new Uint8Array(0);
  const kekRaw: ByteArray = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: hkdfSalt,
        info: encoder.encode('hush-wrap-v1'),
      },
      hkdfMaterial,
      256
    )
  );
  const hmacRaw: ByteArray = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: hkdfSalt,
        info: encoder.encode('hush-mac-v1'),
      },
      hkdfMaterial,
      256
    )
  );
  const kek = await crypto.subtle.importKey('raw', kekRaw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    hmacRaw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  return { kek, hmacKey };
}

function parseEnvelope(payload: string): HushEnvelopeV1 {
  if (!payload.startsWith(HushPrefix)) {
    throw new Error('NotEncrypted');
  }
  const compact = payload.slice(HushPrefix.length);
  const parsed = JSON.parse(decoder.decode(decodeBase64Url(compact))) as HushEnvelopeV1;
  if (parsed.v !== 1 || parsed.alg !== HushAlgorithm) {
    throw new Error('UnsupportedEnvelope');
  }
  return parsed;
}

export function isHushEncryptedMessage(text: string | null | undefined): text is string {
  return typeof text === 'string' && text.startsWith(HushPrefix);
}

export async function encryptHushMessage(plaintext: string, passphrase: string, context: string): Promise<string> {
  if (!passphrase.trim()) {
    throw new Error('PassphraseRequired');
  }
  const crypto = getCrypto();
  const salt: ByteArray = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv: ByteArray = crypto.getRandomValues(new Uint8Array(12));
  const contentIv: ByteArray = crypto.getRandomValues(new Uint8Array(12));
  const dekRaw: ByteArray = crypto.getRandomValues(new Uint8Array(32));
  const { kek, hmacKey } = await deriveKeys(passphrase, context, salt, HushIterations);
  const dek = await crypto.subtle.importKey('raw', dekRaw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const wrappedDek: ByteArray = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, kek, dekRaw));
  const ciphertext: ByteArray = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: contentIv }, dek, encoder.encode(plaintext))
  );
  const macPayload = concatBytes([
    new Uint8Array([1]),
    salt,
    wrapIv,
    wrappedDek,
    contentIv,
    ciphertext,
    encoder.encode(context),
  ]);
  const mac: ByteArray = new Uint8Array(await crypto.subtle.sign({ name: 'HMAC' }, hmacKey, macPayload));
  const envelope: HushEnvelopeV1 = {
    v: 1,
    alg: HushAlgorithm,
    i: HushIterations,
    s: encodeBase64Url(salt),
    wi: encodeBase64Url(wrapIv),
    w: encodeBase64Url(wrappedDek),
    ci: encodeBase64Url(contentIv),
    c: encodeBase64Url(ciphertext),
    h: encodeBase64Url(mac),
  };
  return `${HushPrefix}${encodeBase64Url(encoder.encode(JSON.stringify(envelope)))}`;
}

export async function decryptHushMessage(payload: string, passphrase: string, context: string): Promise<string> {
  const envelope = parseEnvelope(payload);
  const salt = decodeBase64Url(envelope.s);
  const wrapIv = decodeBase64Url(envelope.wi);
  const wrappedDek = decodeBase64Url(envelope.w);
  const contentIv = decodeBase64Url(envelope.ci);
  const ciphertext = decodeBase64Url(envelope.c);
  const mac = decodeBase64Url(envelope.h);
  const { kek, hmacKey } = await deriveKeys(passphrase, context, salt, envelope.i);
  const crypto = getCrypto();
  const macPayload = concatBytes([
    new Uint8Array([1]),
    salt,
    wrapIv,
    wrappedDek,
    contentIv,
    ciphertext,
    encoder.encode(context),
  ]);
  const macOk = await crypto.subtle.verify({ name: 'HMAC' }, hmacKey, mac, macPayload);
  if (!macOk) {
    throw new Error('InvalidMac');
  }
  const dekRaw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: wrapIv }, kek, wrappedDek);
  const dek = await crypto.subtle.importKey(
    'raw',
    dekRaw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: contentIv }, dek, ciphertext);
  return decoder.decode(plaintext);
}
