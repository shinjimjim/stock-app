// 「軽量チャート（lightweight‑charts）」でローソク足を描く最小実装

// クライアント専用コンポーネント（"use client"）。
// DOM 要素（div）の中に lightweight-charts のチャートを生成。
// ローソク足シリーズ（Candlestick）を 1 本追加。
// 受け取った data を流し込む。
// コンテナの幅が変わったら ResizeObserver でチャート幅を追従。
// アンマウント時に確実に後片付け。
"use client";
import { useEffect, useRef, useState } from "react";

export default function LightweightChart({ data = [], height = 460 }) { // data: ローソク足配列（後述のフォーマット）。初期は空配列にしておく。height: ピクセル高さ。変更されると再初期化します（後述）。
  // useRef は「React の再レンダリングを起こさず値を保持」するのに最適。チャート API は参照のまま持っておき、必要時に叩きます。
  const containerRef = useRef(null); // チャートを入れる <div>
  const chartRef = useRef(null); // createChart() の戻り（ChartAPI）
  const seriesRef = useRef(null); // addCandlestickSeries() の戻り（SeriesAPI）
  const [ready, setReady] = useState(false); // 初期化完了フラグ、ready は「チャートの初期化が終わったら true」にして、データ投入のタイミング制御に使っています。

  // 初期化 useEffect（チャート生成と破棄）
  useEffect(() => {
    let cleanup = () => {};
    let chartApi, series;

    (async () => {
      // ① クライアントでのみ動くよう動的 import
      const { createChart } = await import("lightweight-charts"); // 動的 import：lightweight-charts は window に依存するため、SSR 中に読み込むと「document が無い」系のエラーになります。useEffect 内で await import(...) すればブラウザだけでロードされ安全。
      const el = containerRef.current;
      if (!el) return;

      // ② チャート生成（オプション）
      chartApi = createChart(el, {
        width: el.clientWidth, // コンテナの現在幅
        height,
        layout: { background: { color: "transparent" }, textColor: "#ddd" },
        grid: { vertLines: { color: "#2a2a2a" }, horzLines: { color: "#2a2a2a" } },
        timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#444" },
        rightPriceScale: { borderColor: "#444" },
      });

      // ③ ローソク足シリーズを追加
      series = chartApi.addCandlestickSeries();

      // ④ 参照を保持 & レディに
      chartRef.current = chartApi;
      seriesRef.current = series;
      setReady(true);

      // ⑤ リサイズ対応（横幅のみ可変）
      const ro = new ResizeObserver(() => {
        chartApi.applyOptions({ width: el.clientWidth }); // width: el.clientWidth：親の幅にフィットするよう初期幅を計測。さらに ResizeObserver で後続の幅変化にも追従。
      });
      ro.observe(el);

      // ⑥ クリーンアップ
      cleanup = () => {
        ro.disconnect();
        chartApi.remove(); // チャート DOM/イベントを破棄
        chartRef.current = null;
        seriesRef.current = null;
      };
    })();

    // ※ height が変わったら作り直す設計
    return () => cleanup(); // cleanup：React 18 の Strict Mode（開発時）ではエフェクトが二重実行されるため、remove() で確実に破棄するのが大事。
  }, [height]);

  // データ投入 useEffect（描画 & 表示範囲調整）
  useEffect(() => {
    if (!ready || !seriesRef.current || !data?.length) return;
    // ① データをシリーズへ
    seriesRef.current.setData( // setData() は全置き換え：配列を丸ごと差し替えます。
      data.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close })) // "YYYY-MM-DD" 文字列 or Unix秒 or BusinessDayオブジェクト
    );
    chartRef.current?.timeScale().fitContent(); // fitContent() で全データが収まるようスケール調整。
  }, [ready, data]);

  // JSX（DOM コンテナ）
  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
