export interface DropboxUploadedFile {
  path: string;
  url: string;
  name: string;
}

export interface DropboxUploadInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  folder: string;
}

export interface DropboxDeleteInput {
  path: string;
}
