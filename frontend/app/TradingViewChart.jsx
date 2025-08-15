// TradingView の「Advanced Chart」ウィジェットを Next.js（App Router）でクライアント側にだけ 埋め込むための最小構成
// "use client"：このファイルを クライアントコンポーネント として扱う宣言（document などのブラウザAPIを使える）。
// TradingViewChart コンポーネント：symbol（銘柄）と height を受け取り、表示領域となる <div> を用意。
// useRef：TradingViewのスクリプトを差し込む 生のDOMノード を掴むための“取っ手”を用意。
// useEffect：symbol が変わるたびに、TradingViewの埋め込み用スクリプト（外部JS + JSON設定）を作り直して差し込む。
// 結果として、TradingViewが内部で <iframe> を挿入し、チャートが表示される。
"use client"; // App Router（app/）配下では、デフォルトはサーバーコンポーネント。TradingView はブラウザで動くウィジェット（window/document依存）なのでクライアント宣言が必須。
import { useEffect, useRef } from "react"; // Reactのフック。useRef でDOM参照、useEffect で「マウント後にスクリプト挿入」という副作用を行う。

export default function TradingViewChart({ symbol = "TSE:8058", height = 480 }) { // symbol と height をプロップで受け取る。デフォルトは三菱商事（例）と高さ480px。
  const containerRef = useRef(null); // 後で containerRef.current に差し込み先のDOMが入る。

  useEffect(() => {
    // 既存スクリプト掃除
    const old = containerRef.current?.querySelector("script#tv-embed"); // 再描画（symbol変更）時の二重挿入防止。同じIDの <script> があれば削除。
    if (old) old.remove();

    // TradingView 公式の埋め込みスクリプトを生成。async にして非同期ロード。
    const script = document.createElement("script");
    script.id = "tv-embed";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    // 埋め込み用オプションを “JSON文字列” として script の中身に書くのがTradingView流。
    script.innerHTML = JSON.stringify({
      autosize: true, // 親要素のサイズにフィット。親の幅・高さが重要（このコンポーネントでは style={{ width: "100%", height }} で確保）。
      symbol,           // ここがチャートの銘柄
      interval: "D", // 日足（他に "W", "60" 分足など）。
      timezone: "Asia/Tokyo", // 表示タイムゾーン。
      theme: "light", // "dark" にするとダークテーマ。
      style: "1", // チャートスタイル（1=キャンドル）。
      locale: "ja", // UI日本語。
      hide_top_toolbar: false, // 上部ツールバーを隠すか。
      withdateranges: true, // 期間プリセットのUIを表示。
      allow_symbol_change: true, // 画面上で銘柄変更を許可。
      details: true, // 銘柄情報パネルを表示。
      hotlist: false, // サイドのホットリスト
      calendar: false // 経済カレンダー表示。
    });
    containerRef.current.appendChild(script); // symbol が変わったら再実行し、新しいチャートに差し替え。
  }, [symbol]);

  return (
    <div className="tradingview-widget-container" style={{ width: "100%", height }}>
      <div ref={containerRef} className="tradingview-widget-container__widget" style={{ width: "100%", height }} />
    </div>
  );
}
