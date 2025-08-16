// 「銘柄＋期間を指定して、予測（/signal）とOHLC（/ohlc）を並列取得し、**ローソク足＋移動平均線（MA5・MA20）**まで描画する」構成

// 初期表示：DEFAULT_SYMBOL=8058.T と period=2年 を使い、useEffectで /signal と /ohlc を同時フェッチ
// 成功：
// /signal → data（予測JSON）に保存
// /ohlc → ohlc（ローソク足配列）に保存
// さらに sma(ohlc, 5) と sma(ohlc, 20) を計算して ma5 と ma20 に保存
// 画面描画：
// 左カード：銘柄・直近終値・翌日予測リターン・シグナル（色バッジ）
// 右カード：特徴量（ret, ma5, ma20, rsi）
// 下部：LightweightChart（ローソク足＋MA5/MA20 ライン）
// 失敗：err に文言、data/ohlc/ma5/ma20 は空に
"use client"; // "use client"：クライアントコンポーネント。ブラウザで実行し、fetchやフックが使えます。
import { useEffect, useState } from "react";
import LightweightChart from "./LightweightChart";
import { sma } from "../utils/sma";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3100"; // NEXT_PUBLIC_API_BASE：フロントから参照可能な環境変数。
const DEFAULT_SYMBOL = "8058.T";

const PERIODS = [ // PERIODS：UIのセレクトで選ぶ期間と足の間隔。クエリとして /ohlc?period=...&interval=... に渡します。
  { label: "6ヶ月", value: "6mo", interval: "1d" },
  { label: "1年",   value: "1y",  interval: "1d" },
  { label: "2年",   value: "2y",  interval: "1d" },
  { label: "5年",   value: "5y",  interval: "1d" },
];

export default function Home() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [period, setPeriod] = useState(PERIODS[2]); // デフォ2年
  const [data, setData] = useState(null); // 予測、/signal
  const [ohlc, setOhlc] = useState([]);   // チャート用、/ohlc（ローソク足）
  const [ma5, setMa5] = useState([]);
  const [ma20, setMa20] = useState([]); // ma5/ma20: sma(ohlc, 窓) で計算した移動平均ライン用配列
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(""); // loading/err: UXとエラー表示

  // フェッチ（/signal と /ohlc を並列に）
  async function fetchAll(sym, per) {
    setLoading(true); setErr("");
    try {
      const [sRes, oRes] = await Promise.all([ // 並列取得：Promise.all で待ち時間短縮。
        fetch(`${API_BASE}/signal/${encodeURIComponent(sym)}`),
        fetch(`${API_BASE}/ohlc/${encodeURIComponent(sym)}?period=${per.value}&interval=${per.interval}`)
      ]);
      if (!sRes.ok) throw new Error(await sRes.text()); // 厳密なエラー扱い：!res.ok ならボディ文字列を読み出して Error に。
      if (!oRes.ok) throw new Error(await oRes.text());
      const s = await sRes.json();
      const o = await oRes.json(); // oJson は配列前提なので Array.isArray で安全側に倒す（API仕様が変わっても落ちない）
      setData(s);
      setOhlc(o);
      setMa5(sma(o, 5));
      setMa20(sma(o, 20));
    } catch (e) {
      setErr(String(e)); setData(null); setOhlc([]); setMa5([]); setMa20([]);
    } finally { setLoading(false); }
  }

  // 初期フェッチ（初回だけ）
  useEffect(() => { fetchAll(symbol, period); }, []); // 依存配列 [] なので初回のみ。ユーザーが銘柄や期間を変えたら、「更新」ボタンで明示的に再フェッチします（自動更新が良ければ [symbol, period] 依存に変更）。

  // シグナルの色バッジ
  const badgeStyle = (sig) =>
    sig === "BUY"  ? { background:"#16a34a", color:"#fff" } :
    sig === "SELL" ? { background:"#dc2626", color:"#fff" } :
                     { background:"#6b7280", color:"#fff" };

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>株価予測デモ（三菱商事）</h1>
      <p style={{ marginBottom: 16, color: "#bbb" }}>学習デモ。投資判断は自己責任で。売買提案は参考情報です。</p>

      {/* UI（コントロール → カード → チャート） */}
      {/* コントロール */}
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:16, flexWrap:"wrap" }}>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="例: 8058.T"
          style={{ padding:"8px 12px", border:"1px solid #333", borderRadius:8, background:"#111", color:"#eee" }}
        />
        <select
          value={period.value}
          onChange={(e) => {
            const p = PERIODS.find(x => x.value === e.target.value) || PERIODS[2];
            setPeriod(p);
          }}
          style={{ padding:"8px 12px", border:"1px solid #333", borderRadius:8, background:"#111", color:"#eee" }}
        >
          {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <button
          onClick={() => fetchAll(symbol, period)}
          disabled={loading}
          style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #333", background:"#1f2937", color:"#eee" }}
        >
          {loading ? "取得中..." : "更新"}
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
        <h2 style={{ fontSize:18, fontWeight:700, margin:"8px 8px 12px" }}>株価チャート（{period.label}）</h2>
        <LightweightChart data={ohlc} height={520} ma5={ma5} ma20={ma20} />
        <div style={{ marginTop:8, fontSize:12, color:"#aaa" }}>※ 黄=MA5, 青=MA20（ブラウザのテーマによって色は異なる場合があります）</div>
      </div>
    </main>
  );
}
