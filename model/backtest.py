# 移動平均（MA5/MA20）のゴールデンクロスで買い、デッドクロスでノーポジという“ロングオンリー”戦略を、日次データで簡易バックテストするモジュール

# 何をしているファイル？
# yfinance で株価（デフォルトは 8058.T、期間2年、日足）を取得
# MA5 と MA20 を計算 → MA5>MA20 のときだけ保有（=1）、それ以外は非保有（=0）
# 前日シグナルを翌日リターンに適用してルックアヘッド回避（sig.shift(1)）
# 手数料（片道 bps）を売買が発生した日だけ引く
# 累積損益（エクイティ）と各種指標（CAGR/MDD/Sharpe/取引回数など）を JSON で返す
import json, math
import numpy as np
import pandas as pd
import yfinance as yf

# ------- helpers -------ヘルパー関数
# _as_series1d(x, index=None)
# どんな入力でも 1D の pd.Series(float) に正規化します。
# np.ndarray / list / Series などを受け取り、形を (N,) にして float 化。
# index が与えられ、長さが合えばそれを使って Series を作る。
# 目的：型・次元のブレで起きる pandas の例外を回避。
def _as_series1d(x, index=None) -> pd.Series:
    """何が来ても 1次元の pandas.Series(float) に正規化。index 長が一致すれば引き継ぐ。"""
    if isinstance(x, pd.Series):
        return x.astype(float)
    arr = np.asarray(x)
    arr = arr.reshape(-1)  # (N,1) → (N,)
    if index is not None and len(index) == len(arr):
        return pd.Series(arr, index=index, dtype=float)
    return pd.Series(arr, dtype=float)

# _to_float_scalar(x)
# numpy / pandas のスカラ or 0次元配列を素の float に変換（.item() があればそれを利用）。
# 目的：mean() や min() の戻り値を確実に float に落とす。
def _to_float_scalar(x) -> float:
    try:
        # pandas/numpy 双方に対応
        return float(getattr(x, "item", lambda: x)())
    except Exception:
        return float(np.asarray(x).reshape(-1)[0])

# _max_drawdown(equity)
# エクイティ曲線 eq の累積最大値 roll_max を取り、
# dd = eq / roll_max - 1.0 の**最小値（最悪下落率）**を返す。
# 返り値は 負の値（例：-0.25 なら 25% 下落）。
def _max_drawdown(equity: pd.Series) -> float:
    eq = _as_series1d(equity, getattr(equity, "index", None))
    roll_max = eq.cummax()
    dd = eq / roll_max - 1.0
    return _to_float_scalar(dd.min(skipna=True))

# _sharpe_ratio(returns, risk_free=0.0, periods_per_year=252)
# 日次リターン r から超過リターン r - rf/252 を作る
# 平均 μ と分散 σ^2 → 標準偏差 σ を取り、
# Sharpe = (μ/σ) * √252 を返す（σ=0 や非有限値は 0 に丸める）。
# 目的：年率化シャープの頑健計算。
def _sharpe_ratio(returns: pd.Series, risk_free: float = 0.0, periods_per_year: int = 252) -> float:
    r = _as_series1d(returns, getattr(returns, "index", None))
    excess = r - (risk_free / periods_per_year)
    mu = _to_float_scalar(excess.mean(skipna=True))
    var = _to_float_scalar(((excess - mu) ** 2).mean(skipna=True))
    sigma = math.sqrt(max(var, 0.0))
    if not np.isfinite(sigma) or sigma == 0.0:
        return 0.0
    return (mu / sigma) * math.sqrt(periods_per_year)

# ------- main -------
def backtest_ma_cross(symbol: str = "8058.T", period: str = "2y", interval: str = "1d",
                      fast: int = 5, slow: int = 20, fee_bps: float = 5.0):
    """
    MA5/MA20 クロス（ロングオンリー）
    - 前日シグナル→翌日寄付約定（ルックアヘッド回避）
    - 片道手数料 fee_bps (例: 5bps=0.05%)
    """
    # データ取得
    df = yf.download(symbol, period=period, interval=interval, auto_adjust=True).dropna() # 分割・配当を調整した系列（auto_adjust=True）。
    if df.empty:
        return {"symbol": symbol, "period": period, "interval": interval, "error": "no_data"} # データが無ければ {"error": "no_data"} を返すガード付き。

    # インジケータ＆シグナル
    # MA が揃うまでは NaN になるので、min_periods=期間で最初の確定点だけ作るのがミソ。
    close = df["Close"].astype(float)
    open_ = df.get("Open", close).astype(float)

    ma_fast = close.rolling(fast, min_periods=fast).mean()
    ma_slow = close.rolling(slow, min_periods=slow).mean()
    sig_long = (ma_fast > ma_slow).astype(int)

    # 前日シグナル→翌日寄付約定（インデックスを厳密に整列）、ルックアヘッド回避と取引検出
    pos    = sig_long.shift(1).reindex(close.index).fillna(0.0).astype(float) # shift(1)：前日シグナルを翌日に適用。これで「当日終値を見て当日中に約定する」ズル（ルックアヘッド）を回避します。
    ret    = close.pct_change().reindex(close.index).fillna(0.0).astype(float) # ret は終値→翌日終値のクローズ・トゥ・クローズリターン。
    trades = pos.diff().abs().fillna(pos).clip(0, 1).astype(float) # trades は ポジションが変化した日だけ 1。0→1（買い）も 1→0（売り）も abs(diff)==1 で検出。

    # 手数料
    fee = trades * (float(fee_bps) / 10000.0) # 片道 bps を、売買が発生した日だけ引きます（買い・売りともにかかる）。

    # 戦略リターンとエクイティを 1D Series で保持
    strat_ret = _as_series1d(pos * ret - fee, close.index) # 保有日だけ ret を取り込み、売買日に fee を控除。
    equity    = _as_series1d((1.0 + strat_ret).cumprod(), close.index) # 累積してエクイティ曲線を得ます（初期1.0）。

    # 指標の計算
    n_days = int(len(strat_ret))
    if n_days == 0:
        return {"symbol": symbol, "period": period, "interval": interval, "error": "no_returns"}

    last_eq = _to_float_scalar(equity.iloc[-1])
    cagr    = (last_eq ** (252.0 / n_days)) - 1.0 if last_eq > 0 else 0.0 # CAGR は「日次複利を年率換算」：last_eq^(252/N) - 1
    mdd     = _max_drawdown(equity) # MDD は前述の通り（最悪下落率）。
    sharpe  = _sharpe_ratio(strat_ret) # Sharpe は 年率化シャープ（無リスク 0%、252 営業日）。

    # 取引回数は値配列でカウント（将来の .item() 警告回避）
    trade_count = int(np.count_nonzero((trades.values > 0).astype(np.int32))) # trade_count はポジション変化の回数（買い・売りを合わせてカウント）。

    # 出力（DatetimeIndex 前提、違う場合は文字列化）
    eq_out = []
    start = max(slow, fast)
    for idx, val in equity.iloc[start:].items():
        t = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx) # DatetimeIndex なら "YYYY-MM-DD"、そうでなければ str()。
        eq_out.append({"time": t, "value": float(val)})

    return {
        "symbol": symbol,
        "period": period,
        "interval": interval,
        "fast": fast,
        "slow": slow,
        "fee_bps": float(fee_bps),
        "metrics": {
            "cagr": float(cagr),
            "max_drawdown": float(mdd),
            "sharpe": float(sharpe),
            "trade_count": trade_count,
            "last_equity": float(last_eq),
        },
        "equity": eq_out,
    }

if __name__ == "__main__":
    print(json.dumps(backtest_ma_cross(), ensure_ascii=False))
