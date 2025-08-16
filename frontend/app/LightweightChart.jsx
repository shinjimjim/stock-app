// 「最小実装＋MA（移動平均）＋出来高つき」**の lightweight-charts コンポーネント。

// 全体像（このコンポーネントでやっていること）
// "use client" でクライアント専用にする（SSR中に動かないようにする）。
// useEffect 内で 動的 import して lightweight-charts をブラウザだけでロード。
// div（コンテナ）に createChart() でチャート本体を作成。
// ローソク足（Candlestick）シリーズを追加して data を setData()。
// 出来高（Histogram）シリーズを独立スケールに載せ、**下段に30%**の高さを確保。
// MA5/MA20 は LineSeries を2本出して {time, value} を setData()。
// ResizeObserver で横幅の変化に追従。
// アンマウント時に .remove() で後片付け（メモリリークと二重初期化防止）。
"use client";
import { useEffect, useRef, useState } from "react";

export default function LightweightChart({ data = [], height = 520, ma5 = [], ma20 = [] }) { // data: ローソク足配列（後述のフォーマット）。初期は空配列にしておく。height: ピクセル高さ。変更されると再初期化します。
  // useRef は「再レンダリングなしで外部インスタンスを保持」するのに最適。チャート API は React state に入れず ref で持つのが定石です。
  const containerRef = useRef(null); // チャートを入れる<div>の参照
  const chartRef = useRef(null); // ChartAPI（createChartの戻り）
  const candleRef = useRef(null); // CandlestickSeriesAPI
  const volRef = useRef(null);
  const ma5Ref = useRef(null); // LineSeriesAPI（MA5）
  const ma20Ref = useRef(null); // LineSeriesAPI（MA20）
  const [ready, setReady] = useState(false); // 初期化完了フラグ

  // 初期化エフェクト（生成・リサイズ・破棄）
  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      const { createChart } = await import("lightweight-charts"); // 動的 import：lightweight-charts は window 前提。SSR中に読むと壊れます。useEffect 内で読み込めばブラウザだけで実行。
      const el = containerRef.current; if (!el) return;

      const chart = createChart(el, {
        width: el.clientWidth,
        height,
        layout: { background: { color: "transparent" }, textColor: "#ddd" },
        grid: { vertLines: { color: "#2a2a2a" }, horzLines: { color: "#2a2a2a" } },
        timeScale: { timeVisible: true, borderColor: "#444" },
        rightPriceScale: { borderColor: "#444" },
      });

      // ローソク
      const candle = chart.addCandlestickSeries();

      // 出来高（下部30%を確保）— 空文字IDの独立スケールを使う
      const volume = chart.addHistogramSeries({
        priceFormat: { type: "volume" }, // ツールチップ等の表示を整数ベースに
        priceScaleId: "", // ← デフォルト右軸とは別の“オーバーレイスケール”
      });
      // // 下段30%を出来高に割り当て（= 上側75%を余白に）
      chart.priceScale("").applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } }); // chart.priceScale("") でこのスケールに上下マージンを設定し、下段エリアを割り当てます。

      // MA ライン
      const ma5s = chart.addLineSeries({ lineWidth: 2 }); // ★MA5（線）
      const ma20s = chart.addLineSeries({ lineWidth: 2 }); // ★MA20（線）

      chartRef.current = chart;
      candleRef.current = candle;
      volRef.current = volume;
      ma5Ref.current = ma5s;
      ma20Ref.current = ma20s;
      setReady(true);

      const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth })); // ResizeObserver：親要素の幅に追従。width: el.clientWidth を都度適用。
      ro.observe(el);
      cleanup = () => { ro.disconnect(); chart.remove(); }; // chart.remove()：React 18（開発時）は useEffect を二度実行。破棄しないと二重初期化＆リークの原因に。
    })();
    return () => cleanup();
  }, [height]);

  // ローソク & 出来高
  useEffect(() => {
    if (!ready || !candleRef.current || !data?.length) return;

    candleRef.current.setData( // setData() は全置き換え。増分更新（リアルタイム）なら update({time, ...}) を使うと軽い。
      data.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }))
    );

    // 出来高は上昇/下落で色分け
    volRef.current?.setData(
      data.map(d => ({
        time: d.time,
        value: d.volume ?? 0,
        color: (d.close >= d.open) ? undefined : undefined, // 色はテーマ任せ（指定も可）
      }))
    );

    chartRef.current?.timeScale().fitContent();
  }, [ready, data]);

  // データ投入（MA5／MA20）
  useEffect(() => { if (ready && ma5Ref.current)  ma5Ref.current.setData(ma5);  }, [ready, ma5]);
  useEffect(() => { if (ready && ma20Ref.current) ma20Ref.current.setData(ma20); }, [ready, ma20]);

  // JSX（DOM コンテナ）
  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
