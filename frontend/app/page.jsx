// 入力を500msデバウンスして銘柄を確定→AbortControllerで古いリクエストをキャンセル→/signal と /ohlc を並列取得→ローソク足＋MA5/MA20を描画

// 全体のデータフロー
// ユーザーが銘柄入力（symbolInput）
// 500ms静止で symbol に反映（デバウンス）
// symbol または period が変化すると useEffect 発火
// 直前のフェッチを abort → 新しい /signal と /ohlc を Promise.all で並列取得
// 応答OKなら：data（予測JSON）、ohlc（ローソク足）を保存 → sma(ohlc,5/20) を計算して ma5/ma20 に保存
// 画面：左カード（予測）、右カード（特徴量）、下段チャート（ローソク＋MA）を描画
// 失敗時：err を表示し、data/ohlc/ma5/ma20 は空にリセット
"use client"; // "use client"：クライアントコンポーネント。ブラウザで実行し、fetchやフックが使えます。
import { useEffect, useMemo, useRef, useState } from "react";
import LightweightChart from "./LightweightChart";
import { sma } from "../utils/sma";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3100"; // API_BASE：ブラウザで使うので NEXT_PUBLIC_ を利用
const DEFAULT_SYMBOL = "8058.T";

const PERIODS = [ // PERIODS：period=value・interval を /ohlc へ渡す UI 選択肢（例: 2y / 1d）
  { label: "6ヶ月", value: "6mo", interval: "1d" },
  { label: "1年",   value: "1y",  interval: "1d" },
  { label: "2年",   value: "2y",  interval: "1d" },
  { label: "5年",   value: "5y",  interval: "1d" },
];

export default function Home() {
  const [symbolInput, setSymbolInput] = useState(DEFAULT_SYMBOL); // 入力欄
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);           // 実際にフェッチに使う値
  const [period, setPeriod] = useState(PERIODS[2]);               // デフォ2年
  const [data, setData] = useState(null);                         // 予測、/signal
  const [ohlc, setOhlc] = useState([]);                           // チャート用、/ohlc（ローソク足）
  const [ma5, setMa5] = useState([]);
  const [ma20, setMa20] = useState([]);                           // ma5/ma20: sma(ohlc, 窓) で計算した移動平均ライン用配列
  const [loading, setLoading] = useState(false);                  // loading/err: UXとエラー表示
  const [err, setErr] = useState("");
  const abortRef = useRef(null);

  // 入力のデバウンス（500ms）
  useEffect(() => {
    const t = setTimeout(() => setSymbol(symbolInput.trim()), 500);
    return () => clearTimeout(t);
  }, [symbolInput]);

  // 変更があったら自動で再取得
  useEffect(() => {
    if (!symbol) return;

    // 古いリクエストをキャンセル
    abortRef.current?.abort();
    const controller = new AbortController(); // AbortController で「古い問い合わせの結果が後から勝ってしまう」レースを防止
    abortRef.current = controller;

    // フェッチ（/signal と /ohlc を並列に）
    (async () => {
      setLoading(true); setErr("");
      try {
        const [sRes, oRes] = await Promise.all([ // 並列取得：Promise.all で待ち時間短縮。
          fetch(`${API_BASE}/signal/${encodeURIComponent(symbol)}`, { signal: controller.signal }),
          fetch(`${API_BASE}/ohlc/${encodeURIComponent(symbol)}?period=${period.value}&interval=${period.interval}`, { signal: controller.signal }),
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
        if (e.name !== "AbortError") {
          setErr(String(e)); setData(null); setOhlc([]); setMa5([]); setMa20([]);
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [symbol, period]);

  // シグナルの色バッジ
  const badgeStyle = (sig) =>
    sig === "BUY"  ? { background:"#16a34a", color:"#fff" } :
    sig === "SELL" ? { background:"#dc2626", color:"#fff" } :
                     { background:"#6b7280", color:"#fff" };

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>株価予測デモ（三菱商事）</h1>
      <p style={{ marginBottom: 16, color: "#bbb" }}>学習デモ。投資判断は自己責任で。売買提案は参考情報です。</p>

      {/* コントロール（更新ボタンは削除） */}
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:16, flexWrap:"wrap" }}>
        <input
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
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
        {loading && <span style={{ color:"#aaa" }}>更新中…</span>}
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
        <h2 style={{ fontSize:18, fontWeight:700, margin:"8px 8px 12px" }}>
          株価チャート（{period.label}・出来高付き）
        </h2>
        <LightweightChart data={ohlc} height={520} ma5={ma5} ma20={ma20} />
      </div>
    </main>
  );
}
