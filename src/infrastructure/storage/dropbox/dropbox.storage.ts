import { DropboxResponseError } from "dropbox";

import { dropboxClient } from "./dropbox.client.js";

import { DropboxStorageError } from "./dropbox.errors.js";

import type {
  DropboxDeleteInput,
  DropboxUploadInput,
  DropboxUploadedFile,
} from "./dropbox.types.js";

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const sanitizeFilename = (filename: string): string => {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";

  const baseName = filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  const safeBaseName = baseName || "image";

  return extension ? `${safeBaseName}.${extension}` : safeBaseName;
};

const normalizeDropboxPath = (path: string): string => {
  const normalized = path.replace(/\\/g, "/").replace(/\/+/g, "/");

  return normalized.startsWith("/") ? normalized : `/${normalized}`;
};

const toRawUrl = (sharedUrl: string): string => {
  const url = new URL(sharedUrl);

  url.searchParams.delete("dl");

  url.searchParams.set("raw", "1");

  return url.toString();
};

const isDropboxResponseError = (
  error: unknown,
): error is DropboxResponseError<unknown> =>
  error instanceof DropboxResponseError;

export const dropboxStorage = {
  async uploadImage(input: DropboxUploadInput): Promise<DropboxUploadedFile> {
    if (input.buffer.length > MAX_UPLOAD_SIZE) {
      throw new DropboxStorageError(
        "Image exceeds the maximum allowed size of 5 MB.",
      );
    }

    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      throw new DropboxStorageError("Unsupported image type.");
    }

    const safeFilename = sanitizeFilename(input.filename);

    const path = normalizeDropboxPath(
      `${input.folder}/${crypto.randomUUID()}-${safeFilename}`,
    );

    try {
      const uploadResult = await dropboxClient.filesUpload({
        path,
        contents: input.buffer,
        mode: {
          ".tag": "add",
        },
        autorename: false,
        mute: true,
      });

      const sharedLink =
        await dropboxClient.sharingCreateSharedLinkWithSettings({
          path: uploadResult.result.path_lower ?? path,
          settings: {
            audience: {
              ".tag": "public",
            },
            access: {
              ".tag": "viewer",
            },
            allow_download: true,
          },
        });

      const url = toRawUrl(sharedLink.result.url);

      return {
        path: uploadResult.result.path_display ?? path,

        url,

        name: uploadResult.result.name,
      };
    } catch (error: unknown) {
      if (isDropboxResponseError(error)) {
        throw new DropboxStorageError("Dropbox operation failed.", {
          cause: error,
        });
      }

      throw new DropboxStorageError("Failed to upload image to Dropbox.", {
        cause: error,
      });
    }
  },

  async deleteFile(input: DropboxDeleteInput): Promise<void> {
    try {
      await dropboxClient.filesDeleteV2({
        path: input.path,
      });
    } catch (error: unknown) {
      if (isDropboxResponseError(error)) {
        throw new DropboxStorageError("Failed to delete Dropbox file.", {
          cause: error,
        });
      }

      throw new DropboxStorageError("Failed to delete Dropbox file.", {
        cause: error,
      });
    }
  },

  async ensureFolder(folder: string): Promise<void> {
    const path = normalizeDropboxPath(folder);

    try {
      await dropboxClient.filesCreateFolderV2({
        path,
        autorename: false,
      });
    } catch (error: unknown) {
      if (isDropboxResponseError(error)) {
        const errorSummary =
          typeof error.error === "object" &&
          error.error !== null &&
          "error_summary" in error.error
            ? String(
                (error.error as { error_summary?: unknown }).error_summary ??
                  "",
              )
            : "";

        if (errorSummary.startsWith("path/conflict/folder")) {
          // Folder already exists. This is a successful/idempotent state.
          return;
        }
      }

      throw new DropboxStorageError("Failed to initialize Dropbox folder.", {
        cause: error,
      });
    }
  },
};
