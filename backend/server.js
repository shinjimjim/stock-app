// 「Node.js（ESM）から Python を一発呼び出し → 返ってきた JSON をそのままHTTPレスポンスにする」という最小API
// Express で Web サーバー（API）を立てる
// /signal/:symbol にアクセスされたら、Pythonを子プロセスとして起動し、model.predict.predict_signal(symbol) を実行
// Python が返す JSON をそのまま res.json(...) でフロントへ返す

// ESM（type:"module"）の基本とファイルパス周り
// ESM では require/module.exports ではなく import/export を使います（package.json に "type": "module" が必要）。
import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// __dirname 相当をESMで取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Express と CORS
const app = express();
app.use(cors()); // cors() を有効化しておくと、ブラウザの別オリジン（例：http://localhost:5173 のフロント）からでもこのAPIへアクセスできます。

// 環境変数からPythonパス取得（なければ自動検出）
function resolvePythonPath() {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH; // PYTHON_PATH環境変数優先
  const candidates = [
    path.join(__dirname, "..", "venv", "bin", "python"), // mac/Linux venv
    path.join(__dirname, "..", "venv", "Scripts", "python.exe"), // Windows venv
    "python" // どれも無ければ PATH にある "python" を使う、というフォールバック戦略。
  ];
  for (const p of candidates) {
    try {
      if (p === "python" || fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return "python";
}

const PYTHON = resolvePythonPath();

// エンドポイント /signal/:symbol の流れ
app.get("/signal/:symbol", (req, res) => { // URL の :symbol（例：/signal/8058.T）を受け取り、インラインの Python コードを -c で実行します。
  const symbol = req.params.symbol;
  const pyCode = `
from model.predict import predict_signal
import json
print(json.dumps(predict_signal("${symbol}"), ensure_ascii=False))
  `.trim(); // predict_signal(symbol) の戻り値（Pythonの辞書）を JSON 文字列として print。

  // 子プロセス起動と入出力の取り扱い
  const child = spawn(PYTHON, ["-c", pyCode], { // spawn で Python を起動。cwd が プロジェクトルート なので、model.predict の相対importが通る前提。
    cwd: path.join(__dirname, ".."), // プロジェクトルートで実行
    env: process.env // // 親の環境変数を継承
  });

  let stdout = ""; // 標準出力（stdout）に JSON が流れてくる想定。
  let stderr = ""; // 標準エラー（stderr）に警告やエラー。

  const timer = setTimeout(() => child.kill("SIGKILL"), 15000); // ウォッチドッグ：15秒経ったら SIGKILL で落とす（ハング防止）。

  child.stdout.on("data", (d) => (stdout += d.toString("utf-8")));
  child.stderr.on("data", (d) => (stderr += d.toString("utf-8")));

  // 終了時のエラー処理と JSON パース
  child.on("close", (code) => {
    clearTimeout(timer);
    if (code !== 0) { // 終了コード ≠ 0 は Python 側で例外など → stderr を添えて 500。
      return res.status(500).json({ error: "python_error", detail: stderr });
    }
    try { // 終了コードが 0 でも、stdout が純粋な JSON でないと JSON.parse が失敗 → parse_error として 500。
      res.json(JSON.parse(stdout));
    } catch (e) {
      res.status(500).json({ error: "parse_error", detail: String(e), raw: stdout });
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
