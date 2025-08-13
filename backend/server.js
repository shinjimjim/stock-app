import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// __dirname 相当をESMで取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// 環境変数からPythonパス取得（なければ自動検出）
function resolvePythonPath() {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH; // 環境変数優先
  const candidates = [
    path.join(__dirname, "..", "venv", "bin", "python"), // mac/Linux
    path.join(__dirname, "..", "venv", "Scripts", "python.exe"), // Windows
    "python"
  ];
  for (const p of candidates) {
    try {
      if (p === "python" || fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return "python";
}

const PYTHON = resolvePythonPath();

app.get("/signal/:symbol", (req, res) => {
  const symbol = req.params.symbol;
  const pyCode = `
from model.predict import predict_signal
import json
print(json.dumps(predict_signal("${symbol}"), ensure_ascii=False))
  `.trim();

  const child = spawn(PYTHON, ["-c", pyCode], {
    cwd: path.join(__dirname, ".."),
    env: process.env
  });

  let stdout = "";
  let stderr = "";

  const timer = setTimeout(() => child.kill("SIGKILL"), 15000);

  child.stdout.on("data", (d) => (stdout += d.toString("utf-8")));
  child.stderr.on("data", (d) => (stderr += d.toString("utf-8")));

  child.on("close", (code) => {
    clearTimeout(timer);
    if (code !== 0) {
      return res.status(500).json({ error: "python_error", detail: stderr });
    }
    try {
      res.json(JSON.parse(stdout));
    } catch (e) {
      res.status(500).json({ error: "parse_error", detail: String(e), raw: stdout });
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
