interface DropboxConfig {
  appKey: string;
  appSecret: string;
  refreshToken: string;
  rootFolder: string;
}

const requiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
};

const normalizeDropboxPath = (value: string): string => {
  const normalized = value.trim().replace(/\\/g, "/").replace(/\/+/g, "/");

  if (!normalized.startsWith("/")) {
    return `/${normalized}`;
  }

  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }

  return normalized;
};

export const dropboxConfig: DropboxConfig = {
  appKey: requiredEnv("DROPBOX_APP_KEY"),
  appSecret: requiredEnv("DROPBOX_APP_SECRET"),
  refreshToken: requiredEnv("DROPBOX_REFRESH_TOKEN"),
  rootFolder: normalizeDropboxPath(requiredEnv("DROPBOX_ROOT_FOLDER")),
};
