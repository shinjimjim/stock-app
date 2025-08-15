// フロントからAPIを叩いて予測シグナルを取りに行き、画面にカード表示＋TradingViewの埋め込みチャートを出す
// Next.jsのクライアントコンポーネント（先頭の"use client"が目印）
// ユーザーが銘柄コードを入力 → API（/signal/:symbol）にfetch → JSONを受け取って画面に表示
// TradingViewChart という別コンポーネントでチャート埋め込み
// 状態管理：symbol（入力値）、data（API返却）、loading、err
// 環境変数：NEXT_PUBLIC_API_BASE（ブラウザ側へ公開したいのでNEXT_PUBLIC_プレフィックス）
"use client"; // このファイルはクライアント側で実行される。ブラウザAPI（fetchやwindow）が使える。
import { useEffect, useState } from "react"; // useState / useEffect：Reactの状態管理と副作用（初回マウント時の処理など）を使うためのフック。
import TradingViewChart from "./TradingViewChart"; // TradingViewChart：別ファイルのチャート埋め込みコンポーネント。

// 定数（環境変数と銘柄）
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000"; // NEXT_PUBLIC_ が付いた環境変数はブラウザへ露出してOKな値。
const DEFAULT_SYMBOL = "8058.T";   // Python/API用のシンボル、API（Python／yfinance）は 8058.T のようにYahoo!形式
const TV_SYMBOL = "TSE:8058";      // TradingView用のシンボル、radingViewのウィジェットは TSE:8058 のように取引所:銘柄 という表記

export default function Home() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL); // symbol：入力欄とAPI対象の銘柄（初期値はDEFAULT_SYMBOL）
  const [data, setData] = useState(null); // data：API応答（例：{ symbol, last_close, predicted_return, signal, features }）
  const [loading, setLoading] = useState(false); // loading：API通信中のフラグ
  const [err, setErr] = useState(""); // err：エラーメッセージ

  // // API呼び出し関数
  const fetchSignal = async (sym) => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/signal/${encodeURIComponent(sym)}`); // encodeURIComponent：銘柄に.や/が入っても安全にURL化するため。
      if (!res.ok) throw new Error(await res.text()); // !res.ok のとき await res.text() を投げ直し：サーバ側のエラー文をそのまま拾えるのが◎。
      const json = await res.json();
      setData(json);
    } catch (e) { // 例外時は err に格納、data はクリア。
      setErr(String(e));
      setData(null);
    } finally { // finally で必ずローディング終了。
      setLoading(false);
    }
  };

  // 初回マウントで1回だけ取得
  useEffect(() => {
    fetchSignal(symbol);
  }, []); // 依存配列が [] なので初回だけ実行。入力欄でシンボルを変えても自動では再取得しない（下の「取得」ボタンで手動取得する設計）。

  // シグナルの色バッジ
  const signalBadgeClass = (sig) => { // 今はCSS文字列を返し、あとでオブジェクトに変換して style へ渡しています
    if (sig === "BUY") return "background: #16a34a; color:#fff";
    if (sig === "SELL") return "background: #dc2626; color:#fff";
    return "background: #6b7280; color:#fff";
  };

  return (
    // 画面の骨格（JSX）
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        株価予測デモ（三菱商事）
      </h1>
      <p style={{ marginBottom: 16, color: "#555" }}>
        学習デモです。投資判断は自己責任で。売買提案は参考情報です。
      </p>

      {/* 入力とボタン */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="例: 8058.T"
          style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8 }}
        />
        <button
          onClick={() => fetchSignal(symbol)}
          disabled={loading}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#f3f4f6" }}
        >
          {loading ? "取得中..." : "予測取得"}
        </button>
      </div>

      {/* エラー表示 */}
      {err && (
        <div style={{ color: "#dc2626", marginBottom: 12 }}>
          エラー: {err}
        </div>
      )}

      {/* 予測カード & 特徴量カード（dataがある時だけ） */}
      {data && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 24
          }}
        >
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>予測・シグナル</h2>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: "#666" }}>銘柄: </span>
              <strong>{data.symbol}</strong>
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: "#666" }}>直近終値: </span>
              <strong>{data.last_close?.toLocaleString?.() ?? data.last_close}</strong>
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: "#666" }}>予測リターン（翌日）: </span>
              <strong>{(data.predicted_return * 100).toFixed(3)}%</strong>
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: "#666" }}>シグナル: </span>
              <span style={{ padding: "4px 10px", borderRadius: 999, ...Object.fromEntries(signalBadgeClass(data.signal).split(";").filter(Boolean).map(s=>s.trim().split(": ").map((v,i,a)=>i===0?[v]:[a.join(": ")]).flat()).map(([k,v])=>[k,v])) }}>
                {data.signal}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#777", marginTop: 12 }}>
              ※ 簡易モデルのデモ。バックテスト・不確実性指標は後続で追加予定。
            </div>
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>特徴量（最新）</h2>
            <ul style={{ lineHeight: 1.9 }}>
              <li>ret: <strong>{(data.features?.ret ?? 0).toFixed?.(4)}</strong></li>
              <li>ma5: <strong>{(data.features?.ma5 ?? 0).toLocaleString?.()}</strong></li>
              <li>ma20: <strong>{(data.features?.ma20 ?? 0).toLocaleString?.()}</strong></li>
              <li>rsi: <strong>{(data.features?.rsi ?? 0).toFixed?.(2)}</strong></li>
            </ul>
          </div>
        </div>
      )}

      {/* TradingViewのチャート（サーバからデータを持ってこなくてもOK） */}
      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "8px 8px 12px" }}>株価チャート</h2>
        <TradingViewChart symbol={TV_SYMBOL} height={560} />
      </div>
    </main>
  );
}
