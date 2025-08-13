// backend/server.js
const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());

// venv の python を優先して使う（なければ `python` フォールバック）
function resolvePythonPath() {
  const candidates = [
    path.join(__dirname, "..", "venv", "bin", "python"),     // macOS/Linux
    path.join(__dirname, "..", "venv", "Scripts", "python.exe"), // Windows
    "python",
  ];
  for (const p of candidates) {
    try {
      if ((p === "python") || fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return "python";
}

const PYTHON = resolvePythonPath();

// 健康チェック
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// 例: GET /signal/8058.T
app.get("/signal/:symbol", (req, res) => {
  const symbol = (req.params.symbol || "").trim();
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  // Python を -c で実行して predict_signal(symbol) を呼ぶ
  const pyCode = `
from model.predict import predict_signal
import json
print(json.dumps(predict_signal("${symbol}"), ensure_ascii=False))
  `.trim();

  const child = spawn(PYTHON, ["-c", pyCode], {
    cwd: path.join(__dirname, ".."), // プロジェクトルートで実行
    env: process.env,
  });

  let stdout = "";
  let stderr = "";

  // タイムアウト（例: 15秒）— API が固まらないように
  const killTimer = setTimeout(() => {
    child.kill("SIGKILL");
  }, 15000);

  child.stdout.on("data", (d) => (stdout += d.toString("utf-8")));
  child.stderr.on("data", (d) => (stderr += d.toString("utf-8")));

  child.on("close", (code) => {
    clearTimeout(killTimer);
    if (code !== 0) {
      console.error("[PY ERR]", stderr || `exit ${code}`);
      return res.status(500).json({ error: "python_error", detail: stderr || `exit ${code}` });
    }
    try {
      const json = JSON.parse(stdout);
      return res.json(json);
    } catch (e) {
      console.error("[PARSE ERR]", e, "STDOUT:", stdout, "STDERR:", stderr);
      return res.status(500).json({ error: "parse_error", detail: String(e), raw: stdout });
    }
  });
});

// サーバ起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
