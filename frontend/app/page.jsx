// 入力デバウンス → 直前フェッチを中断 → /signal & /ohlc を並列取得 → ローソク足＋MA5/MA20描画 → ついでにバックテスト指標も表示

// 全体像（動作の流れ）
// ユーザーが銘柄欄に入力（symbolInput）。
// 500ms入力が止まると、その値を確定値symbolへ反映（＝デバウンス）。
// symbolまたはperiodが変わるとuseEffect発火。
// 直前のAPI呼び出しをAbortControllerでキャンセルし、新しい**/signalと/ohlc**（さらに/backtestも）をPromise.allで並列取得。
// 正常応答なら：
// /signal → signalData に格納（銘柄・直近終値・翌日予測・シグナル・特徴量）
// /ohlc → ohlc に格納（ローソク足配列）
// sma(ohlc,5/20) → ma5 / ma20 に格納（移動平均線用）
// /backtest → bt に格納（CAGR, 最大DD, Sharpe, 取引回数など）
// 画面描画：上段カード（予測／特徴量）＋中段チャート（ローソク＋MA）＋下段バックテスト指標。
// エラーなら err に表示し、関連状態をクリア。
"use client";

import { useEffect, useRef, useState } from "react";
import LightweightChart from "./LightweightChart";
import { sma } from "../utils/sma";

// APIベースURL（.env.local の NEXT_PUBLIC_API_BASE を優先）
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3100"; // API_BASE：ブラウザで使うので NEXT_PUBLIC_ を利用
const DEFAULT_SYMBOL = "8058.T";

const PERIODS = [ // PERIODS：period=value・interval を /ohlc へ渡す UI 選択肢（例: 2y / 1d）
  { label: "6ヶ月", value: "6mo", interval: "1d" },
  { label: "1年",   value: "1y",  interval: "1d" },
  { label: "2年",   value: "2y",  interval: "1d" },
  { label: "5年",   value: "5y",  interval: "1d" },
];

export default function Home() {
  // 入力欄（デバウンス用）と実際にフェッチに使う値を分離
  const [symbolInput, setSymbolInput] = useState(DEFAULT_SYMBOL); // symbolInput は入力欄の即時値
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);           // symbol はAPIに投げる確定値。
  // タイピング毎にAPIを叩かないためにデバウンスしてからsymbolへ反映します。
  const [period, setPeriod] = useState(PERIODS[2]);               // 初期: 2年
  const [loading, setLoading] = useState(false);                  // loading/err: UXとエラー表示
  const [err, setErr] = useState("");

  // 予測・チャート・MA・バックテスト
  const [signalData, setSignalData] = useState(null);
  const [ohlc, setOhlc] = useState([]);                           // チャート用、/ohlc（ローソク足）
  const [ma5, setMa5] = useState([]);
  const [ma20, setMa20] = useState([]);                           // ma5/ma20: sma(ohlc, 窓) で計算した移動平均ライン用配列
  const [bt, setBt] = useState(null);

  // フェッチのキャンセル管理
  const abortRef = useRef(null);

  // 入力のデバウンス（0.5s）
  useEffect(() => {
    const t = setTimeout(() => setSymbol(symbolInput.trim()), 500); // 入力が止まって0.5秒後に確定。前のタイマーは必ずクリア。
    return () => clearTimeout(t);
  }, [symbolInput]);

  // symbol/period 変更時に自動フェッチ(再取得)
  useEffect(() => {
    if (!symbol) return;

    // 古いリクエストを中断
    abortRef.current?.abort();                // 直前の要求を中断
    const controller = new AbortController(); // AbortController で「古い問い合わせの結果が後から勝ってしまう」レースを防止
    abortRef.current = controller;

    // フェッチ（/signal と /ohlc を並列に）
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const backtestUrl =
          `${API_BASE}/backtest/${encodeURIComponent(symbol)}?period=${period.value}` +
          `&interval=${period.interval}&fast=5&slow=20&fee_bps=5`;

        const [sRes, oRes, bRes] = await Promise.all([ // Promise.all で同時取得し、待ち時間を短縮。
          fetch(`${API_BASE}/signal/${encodeURIComponent(symbol)}`, { signal: controller.signal }),
          fetch(`${API_BASE}/ohlc/${encodeURIComponent(symbol)}?period=${period.value}&interval=${period.interval}`, { signal: controller.signal }),
          fetch(backtestUrl, { signal: controller.signal }),
        ]);

        if (!sRes.ok) throw new Error(await sRes.text()); // !res.ok なら本文テキストを読んで Error に詰め替え → catch でUIに出せる。
        if (!oRes.ok) throw new Error(await oRes.text());
        if (!bRes.ok) throw new Error(await bRes.text());

        const [s, o, b] = await Promise.all([sRes.json(), oRes.json(), bRes.json()]);

        setSignalData(s);
        setOhlc(Array.isArray(o) ? o : []);
        setMa5(sma(o, 5));
        setMa20(sma(o, 20));
        setBt(b);
      } catch (e) {
        if (e.name !== "AbortError") {
          setErr(String(e));
          setSignalData(null);
          setOhlc([]);
          setMa5([]);
          setMa20([]);
          setBt(null);
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort(); // このエフェクトのクリーンアップ
  }, [symbol, period]);

  const badgeStyle = (sig) =>
    sig === "BUY"  ? { background:"#16a34a", color:"#fff" } :
    sig === "SELL" ? { background:"#dc2626", color:"#fff" } :
                     { background:"#6b7280", color:"#fff" };

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        株価予測デモ（三菱商事）
      </h1>
      <p style={{ marginBottom: 16, color: "#bbb" }}>
        学習デモです。投資判断は自己責任で。売買提案は参考情報です。
      </p>

      {/* コントロール（自動フェッチ・更新ボタンなし） */}
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
          {PERIODS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        {loading && <span style={{ color:"#aaa" }}>更新中…</span>}
      </div>

      {err && (
        <div style={{ color:"#f87171", marginBottom:12 }}>
          エラー: {err}
        </div>
      )}

      {/* 上段：予測と特徴量 */}
      {signalData && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
          <div style={{ border:"1px solid #333", borderRadius:12, padding:16 }}>
            <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>予測・シグナル</h2>
            <div>銘柄: <strong>{signalData.symbol}</strong></div>
            <div>直近終値: <strong>{signalData.last_close?.toLocaleString?.() ?? signalData.last_close}</strong></div>
            <div>予測リターン（翌日）: <strong>{(signalData.predicted_return * 100).toFixed(3)}%</strong></div>
            <div>シグナル: <span style={{ padding:"4px 10px", borderRadius:999, ...badgeStyle(signalData.signal) }}>{signalData.signal}</span></div>
            <div style={{ fontSize:12, color:"#888", marginTop:12 }}>
              ※ 簡易モデルのデモ。バックテスト・不確実性は後続で追加予定。
            </div>
          </div>

          <div style={{ border:"1px solid #333", borderRadius:12, padding:16 }}>
            <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>特徴量（最新）</h2>
            <ul style={{ lineHeight:1.9 }}>
              <li>ret: <strong>{(signalData.features?.ret ?? 0).toFixed?.(4)}</strong></li>
              <li>ma5: <strong>{(signalData.features?.ma5 ?? 0).toLocaleString?.()}</strong></li>
              <li>ma20: <strong>{(signalData.features?.ma20 ?? 0).toLocaleString?.()}</strong></li>
              <li>rsi: <strong>{(signalData.features?.rsi ?? 0).toFixed?.(2)}</strong></li>
            </ul>
          </div>
        </div>
      )}

      {/* 中段：出来高付きチャート（MA5/MA20 オーバーレイ） */}
      <div style={{ border:"1px solid #333", borderRadius:12, padding:12, marginBottom:24 }}>
        <h2 style={{ fontSize:18, fontWeight:700, margin:"8px 8px 12px" }}>
          株価チャート（{period.label}・出来高付き）
        </h2>
        <LightweightChart data={ohlc} height={520} ma5={ma5} ma20={ma20} />
        <div style={{ marginTop:8, fontSize:12, color:"#aaa" }}>
          ※ 線色はテーマ依存。必要なら固定色に変更できます。
        </div>
      </div>

      {/* 下段：バックテスト指標 */}
      {bt?.metrics && (
        <div style={{ border:"1px solid #333", borderRadius:12, padding:16, marginBottom:24 }}>
          <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>
            バックテスト（MA{bt.fast}/MA{bt.slow}・手数料 {bt.fee_bps}bps）
          </h2>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12 }}>
            <div>
              <div style={{color:"#aaa"}}>年率CAGR</div>
              <strong>{(bt.metrics.cagr * 100).toFixed(2)}%</strong>
            </div>
            <div>
              <div style={{color:"#aaa"}}>最大ドローダウン</div>
              <strong>{(bt.metrics.max_drawdown * 100).toFixed(2)}%</strong>
            </div>
            <div>
              <div style={{color:"#aaa"}}>Sharpe</div>
              <strong>{bt.metrics.sharpe.toFixed(2)}</strong>
            </div>
            <div>
              <div style={{color:"#aaa"}}>取引回数</div>
              <strong>{bt.metrics.trade_count}</strong>
            </div>
          </div>
          <div style={{ fontSize:12, color:"#888", marginTop:8 }}>
            ※ 前日シグナル→翌日寄付約定・片道手数料を考慮したシンプル検証です。
          </div>
        </div>
      )}
    </main>
  );
}
