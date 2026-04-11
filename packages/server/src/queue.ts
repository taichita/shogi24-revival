import type { Player } from './types.js';

/** 対局待ちキュー（時間方式別） */
export class MatchQueue {
  // presetKey → 待機プレイヤー
  private queues = new Map<string, Player>();

  /** キューに入れる。相手がいればペアを返す */
  enqueue(player: Player, presetKey: string): { black: Player; white: Player } | null {
    const waiting = this.queues.get(presetKey);

    if (waiting && waiting.id !== player.id) {
      this.queues.delete(presetKey);
      // 先に待っていた方をランダムに先手or後手
      if (Math.random() < 0.5) {
        return { black: waiting, white: player };
      } else {
        return { black: player, white: waiting };
      }
    }

    this.queues.set(presetKey, player);
    return null;
  }

  /** キューから除去 */
  remove(playerId: string): void {
    for (const [key, player] of this.queues) {
      if (player.id === playerId) {
        this.queues.delete(key);
        return;
      }
    }
  }
}
