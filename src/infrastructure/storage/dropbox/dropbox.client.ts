import { Dropbox, DropboxAuth } from "dropbox";
import { dropboxConfig } from "../../../config/dropbox.config.js";

const auth = new DropboxAuth({
  clientId: dropboxConfig.appKey,
  clientSecret: dropboxConfig.appSecret,
  refreshToken: dropboxConfig.refreshToken,
});

export const dropboxClient = new Dropbox({
  auth,
});
