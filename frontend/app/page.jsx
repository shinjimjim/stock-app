// 1回のボタン操作で予測（/signal）とチャート用OHLC（/ohlc）を並列取得→カード表示＋軽量チャート描画

// 初期表示…useEffectで DEFAULT_SYMBOL（8058.T）を使って**/signal** と /ohlc を同時にフェッチ
// 成功…data（予測JSON）と ohlc（チャート用配列）を状態に格納 → 2枚のカード（予測/特徴量）とローソク足チャートを描画
// 失敗…err にエラーメッセージ、data/ohlc は空にして表示
"use client"; // クライアントコンポーネント（ブラウザで実行）。Reactのフックが使え、fetch もブラウザ側でOK。
import { useEffect, useState } from "react";
import LightweightChart from "./LightweightChart";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3100"; // NEXT_PUBLIC_API_BASE：ブラウザ側から参照可能なNextの環境変数。
const DEFAULT_SYMBOL = "8058.T";

export default function Home() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [data, setData] = useState(null);      // 予測JSON、/signal の返却を格納
  const [ohlc, setOhlc] = useState([]);        // チャート用、/ohlc の返却を格納（配列前提）
  const [loading, setLoading] = useState(false); // loading: フェッチ中ボタンを無効化＆ラベル“取得中…”表示
  const [err, setErr] = useState(""); // err: 例外時の文言をUIに出す

  // まとめて取得（/signal と /ohlc を並列）
  const fetchSignal = async (sym) => {
    setLoading(true); setErr("");
    try {
      const [sRes, oRes] = await Promise.all([ // Promise.all で同時リクエスト→待ち時間の短縮
        fetch(`${API_BASE}/signal/${encodeURIComponent(sym)}`),
        fetch(`${API_BASE}/ohlc/${encodeURIComponent(sym)}`),
      ]);
      if (!sRes.ok) throw new Error(await sRes.text());
      if (!oRes.ok) throw new Error(await oRes.text());
      const sJson = await sRes.json();
      const oJson = await oRes.json(); // oJson は配列前提なので Array.isArray で安全側に倒す（API仕様が変わっても落ちない）
      setData(sJson);
      setOhlc(Array.isArray(oJson) ? oJson : []); // res.ok を見てHTTPエラーを自前で投げる→ catch に流れ、err に格納
    } catch (e) {
      setErr(String(e)); setData(null); setOhlc([]);
    } finally {
      setLoading(false);
    }
  };

  // 初期フェッチ（初回マウント時に一度だけ）
  useEffect(() => { fetchSignal(symbol); }, []); // 依存配列が空なので初回だけ実行。入力欄で銘柄を変えても自動ではフェッチしない設計（「予測取得」ボタンで手動フェッチ）。

  // シグナルの色バッジ
  const badgeStyle = (sig) =>
    sig === "BUY"  ? { background:"#16a34a", color:"#fff" } :
    sig === "SELL" ? { background:"#dc2626", color:"#fff" } :
                     { background:"#6b7280", color:"#fff" };

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>株価予測デモ（三菱商事）</h1>
      <p style={{ marginBottom: 16, color: "#bbb" }}>学習デモです。投資判断は自己責任で。売買提案は参考情報です。</p>

      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:16 }}>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="例: 8058.T"
          style={{ padding:"8px 12px", border:"1px solid #333", borderRadius:8, background:"#111", color:"#eee" }}
        />
        <button
          onClick={() => fetchSignal(symbol)}
          disabled={loading}
          style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #333", background:"#1f2937", color:"#eee" }}
        >
          {loading ? "取得中..." : "予測取得"}
        </button>
      </div>

      {err && <div style={{ color:"#f87171", marginBottom:12 }}>エラー: {err}</div>}

      {data && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
          <div style={{ border:"1px solid #333", borderRadius:12, padding:16 }}>
            <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>予測・シグナル</h2>
            <div>銘柄: <strong>{data.symbol}</strong></div>
            <div>直近終値: <strong>{data.last_close?.toLocaleString?.() ?? data.last_close}</strong></div>
            <div>予測リターン（翌日）: <strong>{(data.predicted_return * 100).toFixed(3)}%</strong></div>
            <div>シグナル: <span style={{ padding:"4px 10px", borderRadius:999, ...badgeStyle(data.signal) }}>{data.signal}</span></div>
            <div style={{ fontSize:12, color:"#888", marginTop:12 }}>※ 簡易モデル。バックテストや不確実性は後続で追加予定。</div>
          </div>
          <div style={{ border:"1px solid #333", borderRadius:12, padding:16 }}>
            <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>特徴量（最新）</h2>
            <ul style={{ lineHeight:1.9 }}>
              <li>ret: <strong>{(data.features?.ret ?? 0).toFixed?.(4)}</strong></li>
              <li>ma5: <strong>{(data.features?.ma5 ?? 0).toLocaleString?.()}</strong></li>
              <li>ma20: <strong>{(data.features?.ma20 ?? 0).toLocaleString?.()}</strong></li>
              <li>rsi: <strong>{(data.features?.rsi ?? 0).toFixed?.(2)}</strong></li>
            </ul>
          </div>
        </div>
      )}

      <div style={{ border:"1px solid #333", borderRadius:12, padding:12 }}>
        <h2 style={{ fontSize:18, fontWeight:700, margin:"8px 8px 12px" }}>株価チャート（日足・2年）</h2>
        <LightweightChart data={ohlc} height={520} />
      </div>
    </main>
  );
}
