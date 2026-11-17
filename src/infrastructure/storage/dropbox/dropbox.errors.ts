export class DropboxStorageError extends Error {
  public readonly code = "DROPBOX_STORAGE_ERROR";

  constructor(
    message: string,
    options?: {
      cause?: unknown;
    },
  ) {
    super(message);

    this.name = "DropboxStorageError";

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}
