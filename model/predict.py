# model/predict.py
import json
import pandas as pd
import numpy as np
import yfinance as yf
from sklearn.ensemble import RandomForestRegressor

def rsi(series: pd.Series, window: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0).rolling(window).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(window).mean()
    # ゼロ割り防止
    rs = gain / (loss.replace(0, np.nan))
    out = 100 - (100 / (1 + rs))
    return out.fillna(50.0)  # 初期値は中立寄り

def predict_signal(symbol: str = "8058.T"):
    # auto_adjust を明示（将来のデフォルト変更に備える）
    df = yf.download(symbol, period="2y", interval="1d", auto_adjust=True).dropna()

    # 特徴量
    df["ret"]   = df["Close"].pct_change()
    df["ma5"]   = df["Close"].rolling(5).mean()
    df["ma20"]  = df["Close"].rolling(20).mean()
    df["rsi"]   = rsi(df["Close"], 14)

    # 予測ターゲット：翌日リターン
    df["target"] = df["Close"].shift(-1) / df["Close"] - 1
    df = df.dropna()

    # 学習データ
    feat_cols = ["ret", "ma5", "ma20", "rsi"]
    X = df[feat_cols]
    y = df["target"]
    split = int(len(df) * 0.8)
    model = RandomForestRegressor(n_estimators=200, random_state=0)
    model.fit(X.iloc[:split], y.iloc[:split])

    # 直近の予測
    pred = float(model.predict([X.iloc[-1]])[0])

    # シグナル判定（floatにキャストして比較）
    last_row = df.iloc[-1]
    ma5  = float(last_row["ma5"])
    ma20 = float(last_row["ma20"])
    last_close = float(last_row["Close"])

    signal = "HOLD"
    if (pred > 0.005) and (ma5 > ma20):
        signal = "BUY"
    elif (pred < -0.005) and (ma5 < ma20):
        signal = "SELL"

    return {
        "symbol": symbol,
        "predicted_return": pred,
        "signal": signal,
        "last_close": last_close,
        "features": {
            "ret": float(last_row["ret"]),
            "ma5": ma5,
            "ma20": ma20,
            "rsi": float(last_row["rsi"]),
        }
    }

if __name__ == "__main__":
    result = predict_signal("8058.T")
    # Node.js 側で安全に扱えるように JSON で出力
    print(json.dumps(result, ensure_ascii=False))
