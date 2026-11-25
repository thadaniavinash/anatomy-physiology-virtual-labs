const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 8010);
const root = __dirname;
const labelsPath = path.join(root, "data", "muscle-labels.json");
const crashLogPath = path.join(root, "server-crash.log");

process.on("uncaughtException", (error) => {
  fs.appendFileSync(crashLogPath, `${new Date().toISOString()} uncaughtException\n${error.stack || error}\n\n`);
});

process.on("unhandledRejection", (reason) => {
  fs.appendFileSync(crashLogPath, `${new Date().toISOString()} unhandledRejection\n${reason?.stack || reason}\n\n`);
});

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (requestUrl.pathname === "/api/labels") {
    handleLabelsApi(request, response);
    return;
  }

  const safePath = path
    .normalize(decodeURIComponent(requestUrl.pathname))
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath === "" ? "index.html" : safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  });
});

function handleLabelsApi(request, response) {
  if (request.method === "GET") {
    fs.readFile(labelsPath, "utf8", (error, data) => {
      if (error && error.code !== "ENOENT") {
        sendJson(response, 500, { error: "Could not read labels file." });
        return;
      }

      sendJson(response, 200, error ? [] : JSON.parse(data || "[]"));
    });
    return;
  }

  if (request.method === "POST") {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) request.destroy();
    });

    request.on("end", () => {
      try {
        const labels = JSON.parse(body || "[]");
        if (!Array.isArray(labels)) throw new Error("Labels payload must be an array.");

        fs.mkdir(path.dirname(labelsPath), { recursive: true }, (mkdirError) => {
          if (mkdirError) {
            sendJson(response, 500, { error: "Could not create data directory." });
            return;
          }

          fs.writeFile(labelsPath, `${JSON.stringify(labels, null, 2)}\n`, "utf8", (writeError) => {
            if (writeError) {
              sendJson(response, 500, { error: "Could not save labels file." });
              return;
            }

            sendJson(response, 200, { ok: true, count: labels.length });
          });
        });
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
    });
    return;
  }

  sendJson(response, 405, { error: "Method not allowed." });
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

server.listen(port, "127.0.0.1", () => {
  fs.writeFileSync(path.join(root, "server-current.log"), `3D Muscle Labelling prototype: http://127.0.0.1:${port}/\n`);
});
