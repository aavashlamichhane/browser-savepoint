import { SESSION_SCHEMA_VERSION, ALLOWED_URL_PROTOCOLS } from "./schema.js";

export class SessionValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SessionValidationError";
  }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const isUrlAllowed = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    return ALLOWED_URL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
};

export const normalizeTab = (tab) => ({
  url: String(tab.url),
  title: typeof tab.title === "string" ? tab.title : "",
  pinned: Boolean(tab.pinned),
  index: typeof tab.index === "number" ? tab.index : 0
});

export const validateSessionPayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    throw new SessionValidationError("Invalid payload format.");
  }

  if (payload.schemaVersion !== SESSION_SCHEMA_VERSION) {
    throw new SessionValidationError(`Unsupported schema version: ${payload.schemaVersion}`);
  }

  if (!Array.isArray(payload.tabs)) {
    throw new SessionValidationError("Invalid payload tabs.");
  }

  for (const tab of payload.tabs) {
    if (!tab || typeof tab !== "object") {
      throw new SessionValidationError("Invalid tab entry in payload.");
    }

    if (typeof tab.url !== "string" || !isUrlAllowed(tab.url)) {
      throw new SessionValidationError(`Unsupported or invalid URL in payload: ${String(tab.url)}`);
    }
  }

  return payload;
};

export const createSessionPayload = ({ tabs, metadata = {} }) => {
  const normalizedTabs = tabs.map(normalizeTab).filter((tab) => isUrlAllowed(tab.url));

  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    metadata: {
      ...metadata,
      tabCount: normalizedTabs.length
    },
    tabs: normalizedTabs
  };
};

export const encodePayload = (payload) => textEncoder.encode(JSON.stringify(payload));

export const decodePayload = (bufferLike) => {
  const parsed = JSON.parse(textDecoder.decode(bufferLike));
  return validateSessionPayload(parsed);
};
