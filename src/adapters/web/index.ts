import { pathToFileURL } from "node:url";
import { startWebServer } from "./web.server";

export { startWebServer } from "./web.server";
export type {
  GraphStateSnapshot,
  IWebRuntimeAdapter,
  WebErrorDTO,
  WebSessionContext,
  WebSubmitInput,
} from "./web.types";

function isEntrypoint(): boolean {
  const scriptPath = process.argv[1];
  if (typeof scriptPath !== "string" || scriptPath.trim() === "") {
    return false;
  }
  return import.meta.url === pathToFileURL(scriptPath).href;
}

if (isEntrypoint()) {
  startWebServer();
}
