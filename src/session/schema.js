export const SESSION_SCHEMA_VERSION = 1;
export const CONTAINER_VERSION = 1;

export const FILE_MAGIC = "BSAVE01";
export const FILE_EXTENSION = ".bsave";
export const FILE_MIME = "application/x-encrypted-tab-session";

export const PBKDF2_ITERATIONS = 310000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const KEY_LENGTH_BITS = 256;

export const MAX_IMPORT_TABS_DEFAULT = 200;
export const LARGE_IMPORT_CONFIRMATION_THRESHOLD = 75;

export const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:", "file:", "ftp:"]);
