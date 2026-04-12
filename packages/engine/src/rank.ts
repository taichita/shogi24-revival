/**
 * 段級位システム（将棋倶楽部24準拠）
 *
 * 九段: 3100+  八段: 2900-3099  七段: 2700-2899  六段: 2500-2699
 * 五段: 2300-2499  四段: 2100-2299  三段: 1900-2099  二段: 1700-1899
 * 初段: 1500-1699
 * 1級: 1300-1499  2級: 1100-1299  3級: 900-1099  4級: 700-899
 * 5級: 500-699  6級: 300-499  7級: 100-299  8級: 0-99
 * (理論上9級以下もあるが、レートは0が下限)
 */

const DAN_NAMES = ['初段', '二段', '三段', '四段', '五段', '六段', '七段', '八段', '九段'];

/** レートから段級位文字列を返す */
export function ratingToRank(rating: number): string {
  if (rating >= 1500) {
    const danLevel = Math.min(8, Math.floor((rating - 1500) / 200));
    return DAN_NAMES[danLevel];
  }
  const kyuLevel = Math.floor((1499 - rating) / 200) + 1;
  return `${kyuLevel}級`;
}

/** 新規登録時に選べる段級位一覧（六段〜15級） */
export function getSelectableRanks(): { label: string; rating: number }[] {
  const ranks: { label: string; rating: number }[] = [];

  // 六段(2500)〜初段(1500)
  for (let dan = 5; dan >= 0; dan--) {
    const rating = 1500 + dan * 200;
    ranks.push({ label: DAN_NAMES[dan], rating });
  }

  // 1級(1300)〜15級(-1300, ただし実質0)
  for (let kyu = 1; kyu <= 15; kyu++) {
    const rating = 1500 - kyu * 200;
    ranks.push({ label: `${kyu}級`, rating: Math.max(0, rating) });
  }

  return ranks;
}

/** 許可された初期レート値のセット（バリデーション用） */
export function isValidInitialRating(rating: number): boolean {
  return getSelectableRanks().some(r => r.rating === rating);
}
