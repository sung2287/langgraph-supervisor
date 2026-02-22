import http, { type IncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { RuntimeError, toRuntimeError } from "../../../runtime/error";
import { buildWebSessionId } from "../../../runtime/orchestrator/session_namespace";
import { LocalWebRuntimeAdapter, WebSessionApiError } from "./web.runtime_adapter";
import type { GraphStateSnapshot, IWebRuntimeAdapter } from "./web.types";

interface StartWebServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly repoPath?: string;
  readonly adapter?: IWebRuntimeAdapter;
}

interface JsonObject {
  readonly [key: string]: unknown;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_UI_DIST_REL_PATH = path.join("dist", "ui");

function resolveUiDistPath(): string {
  const override = process.env.UI_DIST_DIR;
  if (typeof override === "string" && override.trim() !== "") {
    return path.resolve(override);
  }
  return path.resolve(process.cwd(), DEFAULT_UI_DIST_REL_PATH);
}

function toPort(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_PORT;
  }
  return parsed;
}

function sendJson(res: ServerResponse, statusCode: number, payload: JsonObject): void {
  const body = `${JSON.stringify(payload)}\n`;
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(body, "utf8")),
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res: ServerResponse, statusCode: number, payload: string): void {
  const body = `${payload}\n`;
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": String(Buffer.byteLength(body, "utf8")),
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendApiError(
  res: ServerResponse,
  statusCode: number,
  errorCode: "BAD_REQUEST" | "FORBIDDEN" | "SESSION_NOT_FOUND" | "ENGINE_BUSY"
): void {
  sendJson(res, statusCode, { error: errorCode });
}

function contentTypeByPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

async function sendStaticFile(
  res: ServerResponse,
  filePath: string,
  options: { readonly cacheControl?: string } = {}
): Promise<boolean> {
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": contentTypeByPath(filePath),
      "content-length": String(data.length),
      "cache-control": options.cacheControl ?? "public, max-age=60",
    });
    res.end(data);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function tryServeV2Asset(
  res: ServerResponse,
  pathname: string,
  uiDistRoot: string
): Promise<boolean> {
  if (!(pathname === "/v2" || pathname === "/v2/" || pathname.startsWith("/v2/"))) {
    return false;
  }

  const relative = pathname.startsWith("/v2/")
    ? pathname.slice("/v2/".length)
    : "";
  const candidate = relative === "" ? "index.html" : relative;
  const normalized = path.normalize(candidate).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidatePath = path.resolve(uiDistRoot, normalized);
  if (!candidatePath.startsWith(`${uiDistRoot}${path.sep}`) && candidatePath !== uiDistRoot) {
    return false;
  }

  const served = await sendStaticFile(res, candidatePath);
  if (served) {
    return true;
  }

  if (pathname === "/v2" || pathname === "/v2/" || pathname.startsWith("/v2/")) {
    const fallback = path.resolve(uiDistRoot, "index.html");
    return sendStaticFile(res, fallback, { cacheControl: "no-store" });
  }
  return false;
}

async function readJsonBody(req: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim() === "") {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("VALIDATION_ERROR body must be a JSON object");
  }
  return parsed as JsonObject;
}

function htmlPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LangGraph Observer</title>
  <style>
    :root { color-scheme: light; --bg:#f5f7fb; --panel:#ffffff; --ink:#0f172a; --muted:#475569; --bad:#b91c1c; --ok:#0369a1; }
    body { margin: 0; font-family: ui-sans-serif, -apple-system, Segoe UI, sans-serif; background: var(--bg); color: var(--ink); }
    .wrap { max-width: 960px; margin: 24px auto; padding: 0 16px; }
    .panel { background: var(--panel); border-radius: 12px; padding: 16px; box-shadow: 0 6px 30px rgba(15,23,42,.08); margin-bottom: 12px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; }
    .chip { background: #e2e8f0; border-radius: 999px; padding: 4px 10px; font-size: 12px; color: var(--muted); }
    label { display:block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    input, textarea, button { font: inherit; }
    input, textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; box-sizing: border-box; }
    textarea { min-height: 96px; resize: vertical; }
    button { border: 0; border-radius: 8px; padding: 10px 14px; cursor: pointer; background: #0f766e; color: white; }
    button.secondary { background: #334155; }
    button.warn { background: #b45309; }
    button[disabled] { opacity: 0.5; cursor: not-allowed; }
    .err { color: var(--bad); white-space: pre-wrap; }
    .ok { color: var(--ok); }
    pre { white-space: pre-wrap; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="panel">
      <div class="row">
        <div style="flex:1;min-width:240px;">
          <label>Session</label>
          <input id="sessionInput" value="default" />
        </div>
        <div style="align-self:end;"><button id="initBtn" class="secondary">Init Session</button></div>
      </div>
      <div id="sessionMeta" class="ok"></div>
    </div>

    <div class="panel">
      <div class="row">
        <div class="chip" id="modeChip">Mode: UNAVAILABLE</div>
        <div class="chip" id="domainChip">Domain: UNAVAILABLE</div>
        <div class="chip" id="providerChip">Provider: UNAVAILABLE</div>
        <div class="chip" id="modelChip">Model: UNAVAILABLE</div>
        <div class="chip" id="secretChip">Secret: UNAVAILABLE</div>
        <div class="chip" id="busyChip">Busy: false</div>
        <div class="chip" id="stepChip">Step: UNAVAILABLE</div>
      </div>
      <div id="errorBox" class="err"></div>
    </div>

    <div class="panel">
      <label>Input</label>
      <textarea id="inputText" placeholder="Enter prompt..."></textarea>
      <div class="row" style="margin-top:10px;">
        <button id="sendBtn">Send</button>
        <button id="resetBtn" class="warn">Session Reset</button>
        <button id="rerunBtn" class="secondary">Rerun from Start</button>
      </div>
    </div>

    <div class="panel">
      <label>History</label>
      <pre id="historyBox">[]</pre>
    </div>
  </div>

  <script>
    let sessionId = "";
    let busy = false;
    let es = null;

    function setBusy(v) {
      busy = Boolean(v);
      document.getElementById("busyChip").textContent = "Busy: " + String(busy);
      document.getElementById("sendBtn").disabled = busy;
      document.getElementById("resetBtn").disabled = busy;
      document.getElementById("rerunBtn").disabled = busy;
    }

    function render(snapshot) {
      document.getElementById("modeChip").textContent = "Mode: " + snapshot.mode;
      document.getElementById("domainChip").textContent = "Domain: " + snapshot.domain;
      document.getElementById("providerChip").textContent = "Provider: " + snapshot.activeProvider;
      document.getElementById("modelChip").textContent = "Model: " + snapshot.activeModel;
      document.getElementById("secretChip").textContent = "Secret: " + snapshot.secretProfileLabel;
      document.getElementById("stepChip").textContent = "Step: " + (snapshot.currentStepLabel || "UNAVAILABLE");
      document.getElementById("historyBox").textContent = JSON.stringify(snapshot.history, null, 2);
      if (snapshot.lastError) {
        document.getElementById("errorBox").textContent = snapshot.lastError.errorCode + "\\n" + snapshot.lastError.guideMessage;
      } else {
        document.getElementById("errorBox").textContent = "";
      }
      setBusy(snapshot.isBusy);
    }

    async function jsonFetch(url, init) {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || ("HTTP " + res.status));
      }
      return data;
    }

    async function refreshState() {
      if (!sessionId) return;
      const data = await jsonFetch("/api/state?session=" + encodeURIComponent(sessionId));
      render(data.snapshot);
    }

    function startSse() {
      if (!sessionId) return;
      if (es) es.close();
      es = new EventSource("/api/stream?session=" + encodeURIComponent(sessionId));
      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        render(data.snapshot);
      };
      es.onerror = () => {
        if (es) es.close();
        es = null;
      };
    }

    document.getElementById("initBtn").onclick = async () => {
      const raw = document.getElementById("sessionInput").value || "default";
      const data = await jsonFetch("/api/session/" + encodeURIComponent(raw) + "/init");
      sessionId = data.sessionId;
      document.getElementById("sessionMeta").textContent = "Active sessionId: " + sessionId;
      await refreshState();
      startSse();
    };

    document.getElementById("sendBtn").onclick = async () => {
      if (!sessionId || busy) return;
      const text = document.getElementById("inputText").value;
      const data = await jsonFetch("/api/input", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, text }),
      });
      render(data.snapshot);
    };

    document.getElementById("resetBtn").onclick = async () => {
      if (!sessionId || busy) return;
      const data = await jsonFetch("/api/session/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      render(data.snapshot);
    };

    document.getElementById("rerunBtn").onclick = async () => {
      if (!sessionId || busy) return;
      const text = document.getElementById("inputText").value;
      const data = await jsonFetch("/api/rerun", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, text }),
      });
      render(data.snapshot);
    };

    setInterval(() => {
      if (!es) {
        refreshState().catch(() => undefined);
      }
    }, 1000);
  </script>
</body>
</html>`;
}

function extractSessionId(querySession: string | null): string {
  if (typeof querySession !== "string" || querySession.trim() === "") {
    throw new Error("VALIDATION_ERROR query.session is required");
  }
  return buildWebSessionId(querySession);
}

export function startWebServer(options: StartWebServerOptions = {}): http.Server {
  const host = options.host ?? process.env.HOST ?? DEFAULT_HOST;
  const port = options.port ?? toPort(process.env.PORT);
  if (host === "0.0.0.0") {
    console.warn("[web] warning: HOST=0.0.0.0 exposes the observer beyond localhost.");
  }

  const adapter =
    options.adapter ?? new LocalWebRuntimeAdapter({ repoPath: options.repoPath ?? process.cwd() });
  const uiDistRoot = resolveUiDistPath();

  const server = http.createServer(async (req, res) => {
    try {
      const method = req.method ?? "GET";
      const origin = `http://${req.headers.host ?? "localhost"}`;
      const requestUrl = new URL(req.url ?? "/", origin);
      const pathname = requestUrl.pathname;

      if (method === "GET") {
        const servedV2 = await tryServeV2Asset(res, pathname, uiDistRoot);
        if (servedV2) {
          return;
        }
      }

      if ((method === "GET" || method === "HEAD") && pathname === "/") {
        const page = htmlPage();
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-length": String(Buffer.byteLength(page, "utf8")),
        });
        if (method === "HEAD") {
          res.end();
        } else {
          res.end(page);
        }
        return;
      }

      if (method === "GET" && /^\/api\/session\/[^/]+\/init$/.test(pathname)) {
        const rawName = decodeURIComponent(pathname.split("/")[3] ?? "");
        const context = await adapter.initWebSession(rawName);
        sendJson(res, 200, {
          sessionId: context.sessionId,
          sessionFilename: context.sessionFilename,
        });
        return;
      }

      if (method === "GET" && pathname === "/api/state") {
        const sessionId = extractSessionId(requestUrl.searchParams.get("session"));
        const snapshot = await adapter.getCurrentState(sessionId);
        sendJson(res, 200, { snapshot });
        return;
      }

      if (method === "GET" && pathname === "/api/sessions") {
        const sessionHint = requestUrl.searchParams.get("session") ?? undefined;
        const sessions = await adapter.listWebSessions(sessionHint);
        sendJson(res, 200, { sessions });
        return;
      }

      if (method === "GET" && pathname === "/api/stream") {
        const sessionId = extractSessionId(requestUrl.searchParams.get("session"));
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        });

        const push = (snapshot: GraphStateSnapshot) => {
          res.write(`data: ${JSON.stringify({ snapshot })}\n\n`);
        };
        const unsubscribe = adapter.subscribe(sessionId, push);
        const heartbeat = setInterval(() => {
          res.write(": ping\n\n");
        }, 15000);

        req.on("close", () => {
          clearInterval(heartbeat);
          unsubscribe();
        });
        return;
      }

      if (method === "POST" && pathname === "/api/session/switch") {
        const body = await readJsonBody(req);
        if (typeof body.sessionId !== "string") {
          sendApiError(res, 400, "BAD_REQUEST");
          return;
        }
        const result = await adapter.switchWebSession(body.sessionId);
        sendJson(res, 200, result as unknown as JsonObject);
        return;
      }

      if (method === "DELETE" && /^\/api\/session\/[^/]+$/.test(pathname)) {
        const rawId = decodeURIComponent(pathname.split("/")[3] ?? "");
        if (rawId.trim() === "") {
          sendApiError(res, 400, "BAD_REQUEST");
          return;
        }
        const result = await adapter.deleteWebSession(rawId);
        sendJson(res, 200, result as unknown as JsonObject);
        return;
      }

      if (method === "POST" && (pathname === "/api/input" || pathname === "/api/chat")) {
        const body = await readJsonBody(req);
        const querySession = requestUrl.searchParams.get("session");
        const sessionId = extractSessionId(
          typeof body.sessionId === "string"
            ? body.sessionId
            : typeof querySession === "string"
              ? querySession
              : null
        );
        if (typeof body.text !== "string") {
          sendApiError(res, 400, "BAD_REQUEST");
          return;
        }
        const text = body.text;
        const snapshot = await adapter.submitInput({
          sessionId,
          text,
          provider: typeof body.provider === "string" ? body.provider : undefined,
          model: typeof body.model === "string" ? body.model : undefined,
          profile: typeof body.profile === "string" ? body.profile : undefined,
          secretProfile:
            typeof body.secretProfile === "string" ? body.secretProfile : undefined,
          phase: typeof body.phase === "string" ? body.phase : undefined,
          domain: typeof body.domain === "string" ? body.domain : undefined,
        });
        sendJson(res, 200, { snapshot });
        return;
      }

      if (method === "POST" && pathname === "/api/session/reset") {
        const body = await readJsonBody(req);
        const querySession = requestUrl.searchParams.get("session");
        const sessionId = extractSessionId(
          typeof body.sessionId === "string"
            ? body.sessionId
            : typeof querySession === "string"
              ? querySession
              : null
        );
        const snapshot = await adapter.resetSession(sessionId);
        sendJson(res, 200, { snapshot });
        return;
      }

      if (method === "POST" && pathname === "/api/rerun") {
        const body = await readJsonBody(req);
        const querySession = requestUrl.searchParams.get("session");
        const sessionId = extractSessionId(
          typeof body.sessionId === "string"
            ? body.sessionId
            : typeof querySession === "string"
              ? querySession
              : null
        );
        const snapshot = await adapter.rerunFromStart({
          sessionId,
          text: typeof body.text === "string" ? body.text : undefined,
          provider: typeof body.provider === "string" ? body.provider : undefined,
          model: typeof body.model === "string" ? body.model : undefined,
          profile: typeof body.profile === "string" ? body.profile : undefined,
          secretProfile:
            typeof body.secretProfile === "string" ? body.secretProfile : undefined,
          phase: typeof body.phase === "string" ? body.phase : undefined,
          domain: typeof body.domain === "string" ? body.domain : undefined,
        });
        sendJson(res, 200, { snapshot });
        return;
      }

      sendText(res, 404, "Not Found");
    } catch (error) {
      if (error instanceof WebSessionApiError) {
        if (error.errorCode === "FORBIDDEN") {
          sendApiError(res, error.statusCode, "FORBIDDEN");
          return;
        }
        if (error.errorCode === "SESSION_NOT_FOUND") {
          sendApiError(res, error.statusCode, "SESSION_NOT_FOUND");
          return;
        }
        if (error.errorCode === "ENGINE_BUSY") {
          sendApiError(res, error.statusCode, "ENGINE_BUSY");
          return;
        }
      }
      const runtimeError = toRuntimeError(error);
      const status = error instanceof RuntimeError ? error.httpStatus : runtimeError.httpStatus;
      sendJson(res, status, {
        errorCode: runtimeError.errorCode,
        guideMessage: runtimeError.guideMessage,
        message: runtimeError.message,
      });
    }
  });

  server.listen(port, host, () => {
    console.log(`[web] observer listening on http://${host}:${String(port)}`);
  });
  return server;
}
