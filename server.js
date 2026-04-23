const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 5173);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function send(res, status, payload, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function callOpenAI(model, prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return missingKey("OPENAI_API_KEY", "set OPENAI_API_KEY=你的key");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({ model, input: prompt })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data, null, 2));
  return data.output_text || JSON.stringify(data, null, 2);
}

async function callAnthropic(model, prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return missingKey("ANTHROPIC_API_KEY", "set ANTHROPIC_API_KEY=你的key");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data, null, 2));
  return (data.content || []).map((item) => item.text || "").join("\n") || JSON.stringify(data, null, 2);
}

async function callGoogle(model, prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return missingKey("GEMINI_API_KEY", "set GEMINI_API_KEY=你的key");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data, null, 2));
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || JSON.stringify(data, null, 2);
}

async function callOpenAICompatible(baseUrl, envName, model, prompt) {
  const key = process.env[envName];
  if (!key) return missingKey(envName, `set ${envName}=你的key`);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data, null, 2));
  return data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
}

function missingKey(envName, command) {
  return `未检测到 ${envName}。\n\nWindows PowerShell 示例：\n${command}\nnode server.js\n\n配置后刷新页面再运行 Demo。`;
}

async function handleDemo(req, res) {
  try {
    const { provider, model, prompt } = await readBody(req);
    if (!provider || !model || !prompt) {
      send(res, 400, { error: "provider、model、prompt 都不能为空。" });
      return;
    }

    let output;
    if (provider === "openai") output = await callOpenAI(model, prompt);
    else if (provider === "anthropic") output = await callAnthropic(model, prompt);
    else if (provider === "google") output = await callGoogle(model, prompt);
    else if (provider === "xai") output = await callOpenAICompatible("https://api.x.ai/v1", "XAI_API_KEY", model, prompt);
    else if (provider === "mistral") output = await callOpenAICompatible("https://api.mistral.ai/v1", "MISTRAL_API_KEY", model, prompt);
    else output = `未知 provider：${provider}`;

    send(res, 200, { output });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const cleanPath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(root, cleanPath));

  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }
    send(res, 200, content, mime[path.extname(filePath)] || "application/octet-stream");
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/demo") {
    handleDemo(req, res);
    return;
  }
  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }
  send(res, 405, "Method not allowed", "text/plain; charset=utf-8");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AI Model Workbench running at http://127.0.0.1:${port}`);
});
