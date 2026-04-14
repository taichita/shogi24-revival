/** 24式レーティング変動結果 */
export interface RatingResult {
  nextWinner: number;
  nextLoser: number;
  exchanged: number;
  rated: boolean;
}

/** 授受点計算 (1-31にクリップ) */
export function calc24Exchange(winnerR: number, loserR: number): number {
  const raw = 16 + (loserR - winnerR) * 0.04;
  return Math.max(1, Math.min(31, Math.round(raw)));
}

/** 通常レーティング更新 */
export function apply24Rating(winnerR: number, loserR: number): RatingResult {
  // 2600以上 × 400点差超 → レーティング計算なし（将棋倶楽部24準拠）
  if ((winnerR >= 2600 || loserR >= 2600) && Math.abs(winnerR - loserR) > 400) {
    return { nextWinner: winnerR, nextLoser: loserR, exchanged: 0, rated: false };
  }

  const exchanged = calc24Exchange(winnerR, loserR);
  const nextWinner = winnerR + exchanged;
  let loserDelta = exchanged;

  // 200点以下は負けの減点半分
  if (loserR <= 200) {
    loserDelta = Math.ceil(exchanged / 2);
  }

  const nextLoser = Math.max(0, loserR - loserDelta);

  return { nextWinner, nextLoser, exchanged, rated: true };
}
