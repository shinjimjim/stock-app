// 「終値 (close) の単純移動平均（SMA）」を計算し、ローソク足配列からライン用の時系列 {time, value} に変換するミニ関数

// 入力：ohlc … {time, open, high, low, close, ...} の配列（時系列順）、window … 期間（例：5, 20）
// 出力：[{ time, value }] の配列（チャートのラインシリーズでそのまま使える形）
// 処理：close の単純移動平均を、各バーの「直近 window 本」で計算
export function sma(ohlc, window) {
  const out = []; // 計算結果を入れる
  let sum = 0; // 直近window本の終値の合計（スライドしながら維持）
  const q = []; // 直近window本の終値を入れておくキュー（先頭が最古）
  for (const d of ohlc) {
    q.push(d.close); // 新しい終値をキューの末尾へ
    sum += d.close; // 合計にも加算
    if (q.length > window) sum -= q.shift(); // window超えたら最古を捨てて合計から引く
    // ぴったりwindow本そろったら平均を出力
    if (q.length === window) out.push({ time: d.time, value: +(sum / window).toFixed(4) }); // toFixed(4) は丸めた見た目がほしいときに便利ですが文字列を返すため、+ で数値に戻しています。
    // toFixed(4) は小数第4位までに丸めた「文字列」→ 先頭の+で数値に戻している
  }
  return out;
}
