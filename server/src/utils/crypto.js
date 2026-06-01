import crypto from "node:crypto";

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

export const sha256Base64 = (value) => crypto.createHash("sha256").update(value).digest("base64");

export const constantTimeEqualBase64 = (aB64, bB64) => {
  try {
    const a = Buffer.from(aB64, "base64");
    const b = Buffer.from(bB64, "base64");
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

export const newId = (prefix = "id") =>
  `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}`;
