import {
  CONTAINER_VERSION,
  FILE_MAGIC,
  IV_BYTES,
  KEY_LENGTH_BITS,
  PBKDF2_ITERATIONS,
  SALT_BYTES
} from "../session/schema.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

class CryptoContainerError extends Error {
  constructor(message) {
    super(message);
    this.name = "CryptoContainerError";
  }
}

const concatBytes = (...arrays) => {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    merged.set(arr, offset);
    offset += arr.length;
  }
  return merged;
};

const toBase64 = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const fromBase64 = (base64String) => {
  const binary = atob(base64String);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
};

const deriveKey = async (password, salt, iterations) => {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    baseKey,
    {
      name: "AES-GCM",
      length: KEY_LENGTH_BITS
    },
    false,
    ["encrypt", "decrypt"]
  );
};

const encodeHeader = ({ iterations, salt, iv, ciphertextLength }) => {
  const header = new Uint8Array(FILE_MAGIC.length + 1 + 4 + 1 + 1 + 4);
  const view = new DataView(header.buffer);

  header.set(textEncoder.encode(FILE_MAGIC), 0);
  let offset = FILE_MAGIC.length;

  header[offset] = CONTAINER_VERSION;
  offset += 1;

  view.setUint32(offset, iterations, false);
  offset += 4;

  header[offset] = salt.length;
  offset += 1;
  header[offset] = iv.length;
  offset += 1;

  view.setUint32(offset, ciphertextLength, false);

  return header;
};

const parseHeader = (bytes) => {
  const minimumHeaderLength = FILE_MAGIC.length + 1 + 4 + 1 + 1 + 4;
  if (bytes.length < minimumHeaderLength) {
    throw new CryptoContainerError("Encrypted file is too short.");
  }

  const magic = textDecoder.decode(bytes.slice(0, FILE_MAGIC.length));
  if (magic !== FILE_MAGIC) {
    throw new CryptoContainerError("Invalid encrypted file signature.");
  }

  let offset = FILE_MAGIC.length;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const version = bytes[offset];
  offset += 1;

  if (version !== CONTAINER_VERSION) {
    throw new CryptoContainerError(`Unsupported file version: ${version}`);
  }

  const iterations = view.getUint32(offset, false);
  offset += 4;

  const saltLength = bytes[offset];
  offset += 1;
  const ivLength = bytes[offset];
  offset += 1;
  const ciphertextLength = view.getUint32(offset, false);
  offset += 4;

  const requiredLength = offset + saltLength + ivLength + ciphertextLength;
  if (requiredLength !== bytes.length) {
    throw new CryptoContainerError("Encrypted file appears truncated or malformed.");
  }

  if (iterations < 100000 || iterations > 2000000) {
    throw new CryptoContainerError("Unsupported key-derivation parameters.");
  }

  if (saltLength < 8 || saltLength > 64 || ivLength !== IV_BYTES) {
    throw new CryptoContainerError("Unsupported encryption parameters.");
  }

  const salt = bytes.slice(offset, offset + saltLength);
  offset += saltLength;
  const iv = bytes.slice(offset, offset + ivLength);
  offset += ivLength;
  const ciphertext = bytes.slice(offset, offset + ciphertextLength);

  return {
    iterations,
    salt,
    iv,
    ciphertext
  };
};

export const encodeBytesToBase64 = (bytes) => toBase64(bytes);
export const decodeBase64ToBytes = (base64String) => fromBase64(base64String);
export { CryptoContainerError };

export const encryptSessionBytes = async (plainBytes, password) => {
  if (!password || password.length < 8) {
    throw new CryptoContainerError("Password must be at least 8 characters.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    plainBytes
  );

  const ciphertext = new Uint8Array(ciphertextBuffer);
  const header = encodeHeader({
    iterations: PBKDF2_ITERATIONS,
    salt,
    iv,
    ciphertextLength: ciphertext.length
  });

  return concatBytes(header, salt, iv, ciphertext);
};

export const decryptSessionBytes = async (encryptedBytes, password) => {
  const parsed = parseHeader(encryptedBytes);
  const key = await deriveKey(password, parsed.salt, parsed.iterations);

  try {
    const plainBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: parsed.iv
      },
      key,
      parsed.ciphertext
    );
    return new Uint8Array(plainBuffer);
  } catch {
    throw new CryptoContainerError("Decryption failed. Password is incorrect or file is corrupted.");
  }
};
