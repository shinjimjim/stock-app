# 指定した銘柄のローソク足（OHLCV）をYahoo Financeから取得して、フロントの lightweight‑charts がそのまま読めるJSONに整形して返す」ための最小ユーティリティ

# 依存: yfinance（Yahoo Financeの非公式APIラッパー）, json
# 役割: fetch_ohlc(symbol, period, interval) でデータ取得→「time, open, high, low, close, volume」の配列を返却
# 実行方法: python model/ohlc.py と単体実行すると、標準出力にJSONをプリント（デフォは 8058.T
import json
import yfinance as yf # yfinance は yf.download(...) でOHLCVをまとめて取得。

# symbol: 例）東証なら「8058.T」「7203.T」など。米株なら「AAPL」「NVDA」。
# period: どれくらい過去まで取るか（例："1mo", "6mo", "1y", "2y", "5y", "max"）。
# interval: 足の粒度（例："1d", "1wk", "1mo"、分足は銘柄/市場により制限あり）。
# auto_adjust=True: 株式分割や配当落ちなどの調整を加えた価格（特に Close）に自動で直す。可視化用には便利。
# .dropna(): 欠損行を落として扱いやすくする。
def fetch_ohlc(symbol: str = "8058.T", period: str = "2y", interval: str = "1d"):
    df = yf.download(symbol, period=period, interval=interval, auto_adjust=True).dropna()
    # lightweight-charts は time を "YYYY-MM-DD" 文字列で受け取れる
    out = []
    for ts, row in df.iterrows(): # df のインデックス（日時）を ts、各行を row。
        out.append({
            "time": ts.strftime("%Y-%m-%d"), # lightweight‑charts は time を「UNIX秒」か「YYYY-MM-DD」の文字列でも受け付けます。ここでは日足前提で "YYYY-MM-DD" を採用。
            "open": float(row["Open"]),
            "high": float(row["High"]),
            "low":  float(row["Low"]),
            "close":float(row["Close"]),
            "volume": int(row.get("Volume", 0)), # Volume が無いケース（週足や一部データ源）に備えて row.get("Volume", 0)。
        }) # 数値は float/int にキャストして型の揺れを防止。
    return out

if __name__ == "__main__":
    print(json.dumps(fetch_ohlc("8058.T"), ensure_ascii=False)) # スクリプト直実行時に 8058.T の結果をJSONで標準出力へ。ensure_ascii=False は日本語が入ってもエスケープしない設定
