# 全体像（何をするコード？）
# yfinanceで銘柄の過去株価（終値）を2年分取得
# 特徴量（当日リターン、5日/20日移動平均、RSI14）を作る
# 目的変数は「翌日のリターン」
# ランダムフォレスト回帰で学習（過去80%を学習、残りで直近の予測）
# 予測値と移動平均の関係から BUY/SELL/HOLD を判定
# JSONで結果を標準出力に出す（Node.jsから呼びやすい）
import json # json：結果をNode.js側に渡しやすいJSONで出力
import pandas as pd # pandas / numpy：データ加工と数値計算
import numpy as np
import yfinance as yf # yfinance：Yahoo! Finance から価格データ取得
from sklearn.ensemble import RandomForestRegressor # sklearn.ensemble.RandomForestRegressor：ランダムフォレストで回帰

# RSI 関数（テクニカル指標の計算）
def rsi(series: pd.Series, window: int = 14) -> pd.Series:
    delta = series.diff() # 差分：delta = Close の変化量
    gain = delta.where(delta > 0, 0.0).rolling(window).mean() # 上昇分/下落分を分け、各14日単純移動平均を取る（Wilderの平滑化ではなくSMA版）
    loss = (-delta.where(delta < 0, 0.0)).rolling(window).mean()
    # ゼロ割り防止
    rs = gain / (loss.replace(0, np.nan)) # RS = 平均上昇 / 平均下落 から RSI = 100 - 100/(1+RS)
    out = 100 - (100 / (1 + rs))
    return out.fillna(50.0)  # 最初のほうは計算不能なので 50で埋め（中立）

def predict_signal(symbol: str = "8058.T"):
    # auto_adjust を明示（将来のデフォルト変更に備える）
    df = yf.download(symbol, period="2y", interval="1d", auto_adjust=True).dropna() # 2年・日足を取得。auto_adjust=True で分割/配当調整後価格を使い、将来のデフォルト変更に備えています。取得直後に dropna() で欠損行除去。

    # 特徴量. 先に移動平均やRSIを作る → 初期の数行にNaNが出るのは正常。
    df["ret"]   = df["Close"].pct_change() # 当日の対前日リターン
    df["ma5"]   = df["Close"].rolling(5).mean() # 5日移動平均
    df["ma20"]  = df["Close"].rolling(20).mean() # 20日移動平均
    df["rsi"]   = rsi(df["Close"], 14) # RSI(14)

    # 予測ターゲット：翌日リターン
    df["target"] = df["Close"].shift(-1) / df["Close"] - 1 # 翌日リターンを目的変数に設定（shift(-1)）。NaN（最終行のtargetなど）を全部落として整形。
    df = df.dropna()

    # 学習データ
    feat_cols = ["ret", "ma5", "ma20", "rsi"] # 説明変数は4つ。**時系列なので「過去80%で学習→残り20%で評価」**という前向き分割。
    X = df[feat_cols]
    y = df["target"]
    split = int(len(df) * 0.8)
    model = RandomForestRegressor(n_estimators=200, random_state=0) # ランダムフォレストは標準化不要で扱いやすい回帰器。random_stateで再現性を確保。
    model.fit(X.iloc[:split], y.iloc[:split])

    # 直近の予測
    pred = float(model.predict([X.iloc[-1]])[0]) # 最後の1行（最新の特徴量）で翌日リターンを予測。float(...) にするのは numpy型だとJSON化で困るのを避けるため。

    # シグナル判定（floatにキャストして比較）
    last_row = df.iloc[-1]
    ma5  = float(last_row["ma5"]) # 予測の符号と強さ（±0.5%以上か）に加え、トレンド向き（5日MA vs 20日MA）でフィルタ。
    ma20 = float(last_row["ma20"])
    last_close = float(last_row["Close"]) # ここを float() にキャストしているのは、pandasのSeriesやnumpy.float64のままだと比較・JSON化でトラブルになりやすいから。過去にありがちなエラー：ValueError: The truth value of a Series is ambiguous（Series同士の比較を真偽値にしようとして失敗）

    signal = "HOLD"
    if (pred > 0.005) and (ma5 > ma20):
        signal = "BUY"
    elif (pred < -0.005) and (ma5 < ma20):
        signal = "SELL"

    # 返却オブジェクトをJSONで出力
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
    } # Node.js など外部プロセスで扱いやすい形のJSON。最下部の if __name__ == "__main__": ... print(json.dumps(...)) で標準出力に流します。

if __name__ == "__main__":
    result = predict_signal("8058.T")
    # Node.js 側で安全に扱えるように JSON で出力
    print(json.dumps(result, ensure_ascii=False))
