const textEncoder = new TextEncoder();

const toBase64 = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const fromBase64 = (value) => {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
};

const deriveRawBits = async ({ password, saltBytes, iterations }) => {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations,
      hash: "SHA-256"
    },
    baseKey,
    256
  );

  return new Uint8Array(bits);
};

const digestSha256 = async (bytes) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
};

export const createAuthSetupMaterial = async ({ password, iterations = 210000 }) => {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const authKey = await deriveRawBits({ password, saltBytes, iterations });
  const verifier = await digestSha256(authKey);
  return {
    authSaltB64: toBase64(saltBytes),
    authIterations: iterations,
    authVerifierB64: toBase64(verifier)
  };
};

export const createLoginVerifier = async ({ password, authSaltB64, authIterations }) => {
  const saltBytes = fromBase64(authSaltB64);
  const authKey = await deriveRawBits({ password, saltBytes, iterations: authIterations });
  const verifier = await digestSha256(authKey);
  return toBase64(verifier);
};
