import type { Player } from './types.js';

/** idle=待機室(挑戦受付中), resting=休憩室, automatch=オートマッチ待ち, playing=対局中 */
export type PlayerStatus = 'idle' | 'resting' | 'automatch' | 'playing';

export interface LobbyPlayer {
  id: string;
  handle: string;
  rating: number;
  status: PlayerStatus;
  preferredTime: string;  // preset key
}

export interface Challenge {
  id: string;
  from: LobbyPlayer;
  to: LobbyPlayer;
  timePreset: string;
  createdAt: number;
}

let challengeIdCounter = 0;

export class Lobby {
  private players = new Map<string, LobbyPlayer>();
  private challenges = new Map<string, Challenge>();

  /** プレイヤーをロビーに追加 */
  join(player: Player): LobbyPlayer {
    const lp: LobbyPlayer = {
      id: player.id,
      handle: player.handle,
      rating: player.rating,
      status: 'resting',
      preferredTime: 'normal',
    };
    this.players.set(player.id, lp);
    return lp;
  }

  /** プレイヤーをロビーから除去 */
  leave(playerId: string): void {
    this.players.delete(playerId);
    // この人が関わる挑戦も消す
    for (const [id, ch] of this.challenges) {
      if (ch.from.id === playerId || ch.to.id === playerId) {
        this.challenges.delete(id);
      }
    }
  }

  /** プレイヤー取得 */
  getPlayer(playerId: string): LobbyPlayer | undefined {
    return this.players.get(playerId);
  }

  /** ステータス変更 */
  setStatus(playerId: string, status: PlayerStatus): void {
    const p = this.players.get(playerId);
    if (p) p.status = status;
  }

  /** 希望持ち時間を変更 */
  setPreferredTime(playerId: string, preset: string): void {
    const p = this.players.get(playerId);
    if (p) p.preferredTime = preset;
  }

  /** ロビーの全プレイヤー一覧 */
  getAll(): LobbyPlayer[] {
    return Array.from(this.players.values());
  }

  /** 挑戦を送る */
  sendChallenge(fromId: string, toId: string, timePreset: string): Challenge | string {
    const from = this.players.get(fromId);
    const to = this.players.get(toId);
    if (!from) return 'ログインしてください';
    if (!to) return '相手が見つかりません';
    if (from.id === to.id) return '自分には挑戦できません';
    if (from.status === 'playing') return '対局中です';
    if (from.status === 'resting') return '待機室に入ってから挑戦してください';
    if (to.status !== 'idle') return '相手は挑戦を受け付けていません';

    // 既に同じ相手への挑戦があるか
    for (const ch of this.challenges.values()) {
      if (ch.from.id === fromId && ch.to.id === toId) return '既に挑戦を送っています';
    }

    const ch: Challenge = {
      id: `ch_${++challengeIdCounter}`,
      from: { ...from },
      to: { ...to },
      timePreset,
      createdAt: Date.now(),
    };
    this.challenges.set(ch.id, ch);
    return ch;
  }

  /** 挑戦を取得 */
  getChallenge(challengeId: string): Challenge | undefined {
    return this.challenges.get(challengeId);
  }

  /** 挑戦を削除 */
  removeChallenge(challengeId: string): void {
    this.challenges.delete(challengeId);
  }

  /** プレイヤーに来ている挑戦一覧 */
  getChallengesFor(playerId: string): Challenge[] {
    return Array.from(this.challenges.values()).filter(ch => ch.to.id === playerId);
  }

  /** 古い挑戦を掃除 (30秒以上) */
  cleanStale(): void {
    const cutoff = Date.now() - 30_000;
    for (const [id, ch] of this.challenges) {
      if (ch.createdAt < cutoff) this.challenges.delete(id);
    }
  }
}
