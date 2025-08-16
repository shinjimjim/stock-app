// Node.js（ESM）から Python を一発呼び出し → 返ってきた JSON をそのままHTTPレスポンスにする

// Node/Express で API サーバーを起動（CORS も許可）。
// GET /signal/:symbol（例: /signal/8058.T）に来たら、子プロセスで Python を起動。
// Python 側で model.predict.predict_signal(symbol) を実行して JSON を標準出力へ print。
// Node 側はその stdout を JSON.parse して res.json(...) で返す。
// GET /ohlc/:symbol も同様に model.ohlc.fetch_ohlc(symbol) を実行して返す。

// ESM（"type": "module"）なので import 文を使う（CommonJS の require ではない）。
import express from "express";
import cors from "cors"; // cors：フロントが別オリジンでも API にアクセスできるようにする。
import { spawn } from "child_process"; // child_process.spawn：外部プロセス（ここでは Python）を起動するために使用。
import path from "path"; // path / fs：ファイルパス操作や存在チェックに使用。
import fs from "fs";
import { fileURLToPath } from "url";

// __dirname 相当をESMで取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // ESM では __dirname がないため、自分自身の URL（file://）を実パスに変換してディレクトリ名を得る定型コード。

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

// OHLC エンドポイント（period/interval 対応）
app.get("/ohlc/:symbol", (req, res) => {
  const symbol = (req.params.symbol || "").trim();
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  // 例: /ohlc/8058.T?period=6mo&interval=1d
  const period = (req.query.period || "2y").trim(); // 例: 6mo, 1y, 2y
  const interval = (req.query.interval || "1d").trim(); // 例: 1d, 1h, 5m

  const pyCode = `
from model.ohlc import fetch_ohlc
import json
print(json.dumps(fetch_ohlc("${symbol}", period="${period}", interval="${interval}"), ensure_ascii=False))
  `.trim();

  const child = spawn(PYTHON, ["-c", pyCode], {
    cwd: path.join(__dirname, ".."),
    env: process.env
  });

  let stdout = "", stderr = "";
  const timer = setTimeout(() => child.kill("SIGKILL"), 20000);

  child.stdout.on("data", d => stdout += d.toString("utf-8"));
  child.stderr.on("data", d => stderr += d.toString("utf-8"));

  child.on("close", (code) => {
    clearTimeout(timer);
    if (code !== 0) return res.status(500).json({ error: "python_error", detail: stderr || `exit ${code}` });
    try { res.json(JSON.parse(stdout)); }
    catch (e) { res.status(500).json({ error: "parse_error", detail: String(e), raw: stdout }); }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
