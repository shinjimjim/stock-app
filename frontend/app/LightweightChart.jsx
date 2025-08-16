// 「最小実装＋移動平均（MA）オーバーレイ付き」の軽量チャート版

// "use client" で クライアント専用コンポーネントにする（SSR中は実行しない）。
// lightweight-charts を 動的 import（useEffect内）して ブラウザだけで読み込む。
// div コンテナに createChart() でチャート本体を作る。
// ローソク足シリーズ（Candlestick）に data を setData()。
// MA5／MA20 は LineSeries を2本追加して、それぞれ { time, value } を setData()。
// ResizeObserver で 横幅の変化に追従。
// アンマウント時に .remove()（メモリリーク＆二重初期化対策）。
"use client";
import { useEffect, useRef, useState } from "react";

// ※ createChart は動的 import（前回修正版のまま）
export default function LightweightChart({ data = [], height = 460, ma5 = [], ma20 = [] }) { // data: ローソク足配列（後述のフォーマット）。初期は空配列にしておく。height: ピクセル高さ。変更されると再初期化します。
  // useRef は「再レンダリングなしで外部インスタンスを保持」するのに最適。チャート API は React state に入れず ref で持つのが定石です。
  const containerRef = useRef(null); // チャートを入れる<div>の参照
  const chartRef = useRef(null); // ChartAPI（createChartの戻り）
  const candleRef = useRef(null); // CandlestickSeriesAPI
  const ma5Ref = useRef(null); // LineSeriesAPI（MA5）
  const ma20Ref = useRef(null); // LineSeriesAPI（MA20）
  const [ready, setReady] = useState(false); // 初期化完了フラグ

  // 初期化エフェクト（生成・リサイズ・破棄）
  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      const { createChart } = await import("lightweight-charts"); // 動的 import：lightweight-charts は window を前提にするため、SSR 中に静的 import するとエラーになりがち。useEffect 内で読み込めば クライアント側のみ実行され安全。
      const el = containerRef.current; if (!el) return;

      const chart = createChart(el, {
        width: el.clientWidth, height,
        layout: { background: { color: "transparent" }, textColor: "#ddd" },
        grid: { vertLines: { color: "#2a2a2a" }, horzLines: { color: "#2a2a2a" } },
        timeScale: { timeVisible: true, borderColor: "#444" },
        rightPriceScale: { borderColor: "#444" },
      });
      const candle = chart.addCandlestickSeries(); // ★ローソク足
      const ma5s = chart.addLineSeries({ lineWidth: 2 }); // ★MA5（線）
      const ma20s = chart.addLineSeries({ lineWidth: 2 }); // ★MA20（線）

      chartRef.current = chart;
      candleRef.current = candle;
      ma5Ref.current = ma5s;
      ma20Ref.current = ma20s;
      setReady(true);

      const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth })); // ResizeObserver：親要素の幅に追従。width: el.clientWidth を都度適用。
      ro.observe(el);
      cleanup = () => { ro.disconnect(); chart.remove(); }; // cleanup（chart.remove()）：React 18 の Strict Mode ではエフェクトが 二重実行されます。破棄を入れないと 重複初期化やリークの原因に。
    })();
    return () => cleanup();
  }, [height]);

  // データ投入（ローソク足）
  useEffect(() => {
    if (!ready || !candleRef.current || !data?.length) return;
    candleRef.current.setData(data.map(d => ({ // setData() は全置き換え。リアルタイム更新なら update({time, open, high, low, close}) を使うと効率的。
      time: d.time, open: d.open, high: d.high, low: d.low, close: d.close
    })));
    chartRef.current?.timeScale().fitContent();
  }, [ready, data]);

  // データ投入（MA5／MA20）
  useEffect(() => { if (ready && ma5Ref.current) ma5Ref.current.setData(ma5); }, [ready, ma5]);
  useEffect(() => { if (ready && ma20Ref.current) ma20Ref.current.setData(ma20); }, [ready, ma20]);

  // // JSX（DOM コンテナ）
  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
