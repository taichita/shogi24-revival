import { describe, it, expect } from 'vitest';
import {
  createGame, generateLegalMoves, makeMove, isCheckmate, isCheck,
  getLegalMovesFrom, getLegalDrops, moveToJapanese,
  parseSfen, toSfen, INITIAL_SFEN,
  findKing, isInCheck, opponent,
} from '../index.js';
import type { Move, Pos, GameState } from '../index.js';

describe('初期局面', () => {
  it('平手初期配置が正しい', () => {
    const game = createGame();
    // 先手玉は8,4
    expect(game.board[8][4]).toEqual({ kind: 'king', color: 'black', promoted: false });
    // 後手王は0,4
    expect(game.board[0][4]).toEqual({ kind: 'king', color: 'white', promoted: false });
    // 先手の歩は6段目
    for (let c = 0; c <= 8; c++) {
      expect(game.board[6][c]).toEqual({ kind: 'pawn', color: 'black', promoted: false });
    }
    // 後手の歩は2段目
    for (let c = 0; c <= 8; c++) {
      expect(game.board[2][c]).toEqual({ kind: 'pawn', color: 'white', promoted: false });
    }
  });

  it('先手番で始まる', () => {
    const game = createGame();
    expect(game.turn).toBe('black');
  });

  it('初期局面で合法手が30手ある', () => {
    const game = createGame();
    const moves = generateLegalMoves(game);
    // 歩9枚×1マス + 角0 + 飛0 + 桂0(行き場なし除外すると)...
    // 正確には: 歩9手 + 右桂1手 + 左桂1手 + 角0手 + 飛2手(1六/1八方向)...
    // 先手初期は30手が正解
    expect(moves.length).toBe(30);
  });
});

describe('SFEN', () => {
  it('初期局面のSFENが正しい', () => {
    const game = createGame();
    const sfen = toSfen(game);
    expect(sfen).toBe(INITIAL_SFEN);
  });

  it('SFENからパースして再出力が一致する', () => {
    const game = parseSfen(INITIAL_SFEN);
    expect(toSfen(game)).toBe(INITIAL_SFEN);
  });

  it('持ち駒ありのSFENをパースできる', () => {
    const sfen = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b 2P 1';
    const game = parseSfen(sfen);
    expect(game.hands.black.pawn).toBe(2);
  });
});

describe('駒の移動', () => {
  it('歩を一つ前に進められる', () => {
    const game = createGame();
    const from: Pos = { row: 6, col: 4 }; // ５七歩
    const moves = getLegalMovesFrom(game, from);
    expect(moves.length).toBe(1);
    expect(moves[0].to).toEqual({ row: 5, col: 4 }); // ５六歩
  });

  it('初手7六歩を指せる', () => {
    const game = createGame();
    const move: Move = {
      type: 'move',
      from: { row: 6, col: 2 },  // ７七歩
      to: { row: 5, col: 2 },    // ７六歩
      pieceKind: 'pawn',
      promote: false,
    };
    const next = makeMove(game, move);
    expect(next.board[5][2]).toEqual({ kind: 'pawn', color: 'black', promoted: false });
    expect(next.board[6][2]).toBeNull();
    expect(next.turn).toBe('white');
    expect(next.moveCount).toBe(1);
  });

  it('不正な手はエラーになる', () => {
    const game = createGame();
    const move: Move = {
      type: 'move',
      from: { row: 8, col: 4 },
      to: { row: 6, col: 4 }, // 玉が歩を飛び越える（不正）
      pieceKind: 'king',
      promote: false,
    };
    expect(() => makeMove(game, move)).toThrow('Illegal move');
  });
});

describe('駒を取る', () => {
  it('駒を取ると持ち駒になる', () => {
    // 歩がぶつかる局面を作る
    const sfen = '9/9/9/9/4p4/4P4/9/9/4K4 b - 1';
    const game = parseSfen(sfen);
    const move: Move = {
      type: 'move',
      from: { row: 5, col: 4 },
      to: { row: 4, col: 4 },
      pieceKind: 'pawn',
      promote: false,
    };
    const next = makeMove(game, move);
    expect(next.hands.black.pawn).toBe(1);
    expect(next.board[4][4]?.color).toBe('black');
  });
});

describe('成り', () => {
  it('敵陣に入ると成れる', () => {
    const sfen = '9/9/9/4P4/9/9/9/9/4K4 b - 1';
    const game = parseSfen(sfen);
    const from: Pos = { row: 3, col: 4 };
    const moves = getLegalMovesFrom(game, from);
    // 敵陣(row 0-2)に向かう手で成り/不成がある
    const promMoves = moves.filter(m => m.promote);
    const noPromMoves = moves.filter(m => !m.promote);
    expect(promMoves.length).toBe(1);
    expect(noPromMoves.length).toBe(1);
  });

  it('一段目に歩は成り必須', () => {
    const sfen = '9/4P4/9/9/9/9/9/9/4K4 b - 1';
    const game = parseSfen(sfen);
    const from: Pos = { row: 1, col: 4 };
    const moves = getLegalMovesFrom(game, from);
    expect(moves.length).toBe(1);
    expect(moves[0].promote).toBe(true);
  });
});

describe('駒打ち', () => {
  it('持ち駒の歩を打てる', () => {
    const sfen = '4k4/9/9/9/9/9/9/9/4K4 b P 1';
    const game = parseSfen(sfen);
    const drops = getLegalDrops(game, 'pawn');
    // 一段目(row=0)には打てない、玉の位置にも打てない
    // 空きマス: 81 - 2(玉) = 79、但しrow=0は打てない → 79 - 8 = 71
    expect(drops.length).toBe(71);
  });

  it('二歩は禁止される', () => {
    const sfen = '4k4/9/9/9/4P4/9/9/9/4K4 b P 1';
    const game = parseSfen(sfen);
    const drops = getLegalDrops(game, 'pawn');
    // col=4にはもう歩があるので打てない
    const col4drops = drops.filter(d => d.to.col === 4);
    expect(col4drops.length).toBe(0);
  });
});

describe('王手・詰み', () => {
  it('王手を検出できる', () => {
    // 後手番で、先手の飛車が後手玉に直射
    const sfen = '4k4/9/9/9/9/9/9/9/4R3K w - 1';
    const game = parseSfen(sfen);
    expect(isCheck(game)).toBe(true);
  });

  it('頭金の詰みを検出できる', () => {
    // 後手玉(0,0)に先手金2枚(1,0)(1,1)で詰み
    // 金(1,0)が王手、全逃げ先を金2枚で塞ぐ
    const sfen = 'k8/GG7/9/9/9/9/9/9/8K w - 2';
    const game = parseSfen(sfen);
    expect(isCheckmate(game)).toBe(true);
  });
});

describe('日本語表記', () => {
  it('移動手を変換できる', () => {
    const move: Move = {
      type: 'move',
      from: { row: 6, col: 2 },
      to: { row: 5, col: 2 },
      pieceKind: 'pawn',
      promote: false,
    };
    expect(moveToJapanese(move, 'black')).toBe('７六歩');
  });

  it('駒打ちを変換できる', () => {
    const move: Move = {
      type: 'drop',
      to: { row: 4, col: 4 },
      pieceKind: 'pawn',
    };
    expect(moveToJapanese(move, 'black')).toBe('５五歩打');
  });
});
