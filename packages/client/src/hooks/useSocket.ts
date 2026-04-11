"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { Color, Move, GameState, GameResult, Pos } from "@shogi24/engine";
import type { ChatMessage } from "@/components/ChatPanel";
import { makeMove as engineMakeMove } from "@shogi24/engine";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3025";

interface TimePreset {
  name: string;
  mainTimeMs: number;
  byoyomiMs: number;
}

interface ClockState {
  black: { remainMs: number; inByoyomi: boolean };
  white: { remainMs: number; inByoyomi: boolean };
}

export interface LobbyPlayer {
  id: string;
  handle: string;
  rating: number;
  status: "idle" | "resting" | "automatch" | "playing";
  preferredTime: string;
}

export interface IncomingChallenge {
  challengeId: string;
  from: { handle: string; rating: number };
  timePreset: string;
}

export interface OnlineMatchState {
  matchId: string;
  myColor: Color;
  blackPlayer: { handle: string; rating: number };
  whitePlayer: { handle: string; rating: number };
  game: GameState | null;
  clock: ClockState | null;
  timePreset: TimePreset | null;
  result: GameResult | null;
  error: string | null;
}

export interface UseSocketReturn {
  connected: boolean;
  loggedIn: boolean;
  myId: string | null;
  handle: string | null;
  waiting: boolean;
  lobbyPlayers: LobbyPlayer[];
  challenges: IncomingChallenge[];
  match: OnlineMatchState | null;
  chatMessages: ChatMessage[];
  login: (handle: string) => Promise<boolean>;
  quickstart: (timePreset?: string) => Promise<void>;
  sendChallenge: (targetId: string, timePreset: string) => Promise<string | null>;
  acceptChallenge: (challengeId: string) => void;
  declineChallenge: (challengeId: string) => void;
  sendMove: (move: Move) => void;
  sendResign: () => void;
  sendChat: (message: string) => void;
  backToLobby: () => void;
  setLobbyStatus: (status: 'idle' | 'resting' | 'automatch') => void;
  setPreferredTime: (preset: string) => void;
  // 感想戦
  reviewMode: boolean;
  reviewMyBoard: GameState | null;
  reviewOpponentBoard: GameState | null;
  enterReview: () => void;
  sendReviewMove: (move: Move) => void;
  reviewUndo: () => void;
  reviewReset: (position: 'initial' | 'final') => void;
  leaveReview: () => void;
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [challenges, setChallenges] = useState<IncomingChallenge[]>([]);
  const [match, setMatch] = useState<OnlineMatchState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewMyBoard, setReviewMyBoard] = useState<GameState | null>(null);
  const [reviewOpponentBoard, setReviewOpponentBoard] = useState<GameState | null>(null);

  useEffect(() => {
    // localStorageからJWTを取得して接続時に送信
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('shogi24_token') : null;
    const socket = io(SERVER_URL, {
      autoConnect: true,
      auth: storedToken ? { token: storedToken } : undefined,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setMyId(socket.id ?? null);
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setLoggedIn(false);
      setMyId(null);
    });

    // JWT自動認証の復元
    socket.on("auth.restored", (data: { handle: string; rating: number; userId: string }) => {
      setLoggedIn(true);
      setHandle(data.handle);
    });

    // --- ロビー ---
    socket.on("lobby.snapshot", (data: { players: LobbyPlayer[] }) => {
      setLobbyPlayers(data.players);
    });

    socket.on("lobby.challenge.received", (data: IncomingChallenge) => {
      setChallenges((prev) => [...prev, data]);
    });

    socket.on("lobby.challenge.declined", (data: { challengeId: string }) => {
      setChallenges((prev) => prev.filter((c) => c.challengeId !== data.challengeId));
    });

    // --- 対局 ---
    socket.on("match.started", (data) => {
      setWaiting(false);
      setChallenges([]);
      setMatch({
        matchId: data.matchId,
        myColor: data.yourColor,
        blackPlayer: data.black,
        whitePlayer: data.white,
        game: null,
        clock: null,
        timePreset: data.timePreset,
        result: null,
        error: null,
      });
    });

    socket.on("match.snapshot", (data) => {
      setMatch((prev) => prev ? { ...prev, game: data.game, clock: data.clock } : prev);
    });

    socket.on("match.moved", (data) => {
      setMatch((prev) => {
        if (!prev || !prev.game) return prev;
        try {
          const newGame = engineMakeMove(prev.game, data.move);
          return { ...prev, game: newGame, clock: data.clock };
        } catch {
          return prev;
        }
      });
    });

    socket.on("match.clock", (data) => {
      setMatch((prev) => prev ? { ...prev, clock: data.clock } : prev);
    });

    socket.on("match.result", (data) => {
      setMatch((prev) => prev ? { ...prev, result: data.result, clock: data.clock } : prev);
    });

    socket.on("match.error", (data) => {
      setMatch((prev) => prev ? { ...prev, error: data.message } : prev);
    });

    socket.on("chat.message", (data: { matchId: string; sender: string; message: string; timestamp: number }) => {
      setChatMessages((prev) => [...prev, { sender: data.sender, message: data.message, timestamp: data.timestamp }]);
    });

    // --- 感想戦 ---
    socket.on("review.entered", (data: { matchId: string; board: GameState }) => {
      setReviewMode(true);
      setReviewMyBoard(data.board);
    });

    socket.on("review.snapshot", (data: { matchId: string; color: Color; board: GameState }) => {
      // 自分の色か相手の色かで振り分け
      setMatch((prev) => {
        if (!prev) return prev;
        const myColor = prev.myColor;
        if (data.color === myColor) {
          setReviewMyBoard(data.board);
        } else {
          setReviewOpponentBoard(data.board);
        }
        return prev;
      });
    });

    socket.on("review.left", (data: { matchId: string; color: Color }) => {
      // 相手が離脱したら相手盤をクリア
      setMatch((prev) => {
        if (!prev) return prev;
        if (data.color !== prev.myColor) {
          setReviewOpponentBoard(null);
        }
        return prev;
      });
    });

    return () => { socket.disconnect(); };
  }, []);

  const login = useCallback(async (h: string): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket) return false;
    return new Promise((resolve) => {
      socket.emit("auth.login", { handle: h }, (res: { ok: boolean; playerId?: string; error?: string }) => {
        if (res.ok) {
          setLoggedIn(true);
          setHandle(h);
          setMyId(socket.id ?? null);
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }, []);

  const quickstart = useCallback(async (timePreset?: string): Promise<void> => {
    const socket = socketRef.current;
    if (!socket) return;
    setWaiting(true);
    socket.emit("match.quickstart", { timePreset }, (res: { ok: boolean; matchId?: string; error?: string }) => {
      if (!res.ok) setWaiting(false);
    });
  }, []);

  const sendChallenge = useCallback(async (targetId: string, timePreset: string): Promise<string | null> => {
    const socket = socketRef.current;
    if (!socket) return "接続されていません";
    return new Promise((resolve) => {
      socket.emit("lobby.challenge", { targetId, timePreset }, (res: { ok: boolean; challengeId?: string; error?: string }) => {
        resolve(res.ok ? null : (res.error ?? "挑戦に失敗しました"));
      });
    });
  }, []);

  const acceptChallenge = useCallback((challengeId: string) => {
    socketRef.current?.emit("lobby.challenge.accept", { challengeId });
    setChallenges((prev) => prev.filter((c) => c.challengeId !== challengeId));
  }, []);

  const declineChallenge = useCallback((challengeId: string) => {
    socketRef.current?.emit("lobby.challenge.decline", { challengeId });
    setChallenges((prev) => prev.filter((c) => c.challengeId !== challengeId));
  }, []);

  const sendMove = useCallback((move: Move) => {
    const socket = socketRef.current;
    if (!socket || !match) return;
    socket.emit("match.move", { matchId: match.matchId, move });
  }, [match]);

  const sendResign = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !match) return;
    socket.emit("match.resign", { matchId: match.matchId });
  }, [match]);

  const sendChat = useCallback((message: string) => {
    const socket = socketRef.current;
    if (!socket || !match) return;
    socket.emit("chat.send", { matchId: match.matchId, message });
  }, [match]);

  const enterReview = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !match) return;
    socket.emit("review.enter", { matchId: match.matchId });
  }, [match]);

  const sendReviewMove = useCallback((move: Move) => {
    const socket = socketRef.current;
    if (!socket || !match) return;
    socket.emit("review.move", { matchId: match.matchId, move });
  }, [match]);

  const reviewUndo = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !match) return;
    socket.emit("review.undo", { matchId: match.matchId });
  }, [match]);

  const reviewReset = useCallback((position: 'initial' | 'final') => {
    const socket = socketRef.current;
    if (!socket || !match) return;
    socket.emit("review.reset", { matchId: match.matchId, position });
  }, [match]);

  const leaveReview = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !match) return;
    socket.emit("review.leave", { matchId: match.matchId });
    setReviewMode(false);
    setReviewMyBoard(null);
    setReviewOpponentBoard(null);
  }, [match]);

  const backToLobby = useCallback(() => {
    if (reviewMode && match) {
      socketRef.current?.emit("review.leave", { matchId: match.matchId });
    }
    setMatch(null);
    setWaiting(false);
    setChatMessages([]);
    setReviewMode(false);
    setReviewMyBoard(null);
    setReviewOpponentBoard(null);
  }, [reviewMode, match]);

  const setLobbyStatus = useCallback((status: 'idle' | 'resting' | 'automatch') => {
    socketRef.current?.emit("lobby.setStatus", { status });
    if (status === 'automatch') setWaiting(true);
    else setWaiting(false);
  }, []);

  const setPreferredTime = useCallback((preset: string) => {
    socketRef.current?.emit("lobby.setTime", { preset });
  }, []);

  return {
    connected, loggedIn, myId, handle, waiting,
    lobbyPlayers, challenges, match, chatMessages,
    login, quickstart, sendChallenge, acceptChallenge, declineChallenge,
    sendMove, sendResign, sendChat, backToLobby, setLobbyStatus, setPreferredTime,
    reviewMode, reviewMyBoard, reviewOpponentBoard,
    enterReview, sendReviewMove, reviewUndo, reviewReset, leaveReview,
  };
}
