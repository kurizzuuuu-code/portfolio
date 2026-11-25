/* ========================================================================
 * KURIZU 3D CHESS ENGINE — Full FIDE-style Chess Rules + 4-Tier AI
 * Supports Main Thread & Web Worker execution (window / self).
 * Difficulties: "easy" (~700), "medium" (~1350), "hard" (~1850), "gm" (~2250+)
 * ======================================================================== */
((root) => {
  'use strict';

  const FILES = 'abcdefgh';
  const PIECE_VALUES = {
    p: 100,
    n: 320,
    b: 335,
    r: 500,
    q: 900,
    k: 20000,
  };

  // Piece-square tables from White's perspective (row 0 = rank 8, row 7 = rank 1)
  const PST_PAWN = [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [12, 16, 22, 32, 32, 22, 16, 12],
    [6,  10, 16, 28, 28, 16, 10,  6],
    [2,   4, 12, 24, 24, 12,  4,  2],
    [4,  -2, -6,  4,  4, -6, -2,  4],
    [6,  10, 10,-22,-22, 10, 10,  6],
    [0,   0,  0,  0,  0,  0,  0,  0],
  ];

  const PST_KNIGHT = [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  4,  4,  0,-20,-40],
    [-30,  4, 14, 18, 18, 14,  4,-30],
    [-30,  8, 18, 24, 24, 18,  8,-30],
    [-30,  4, 18, 24, 24, 18,  4,-30],
    [-30,  8, 14, 18, 18, 14,  8,-30],
    [-40,-20,  0,  6,  6,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
  ];

  const PST_BISHOP = [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  4,  0,  0,  0,  0,  4,-10],
    [-10, 10, 10, 12, 12, 10, 10,-10],
    [-10,  4, 12, 14, 14, 12,  4,-10],
    [-10,  8, 10, 14, 14, 10,  8,-10],
    [-10, 10, 12, 10, 10, 12, 10,-10],
    [-10,  8,  0,  4,  4,  0,  8,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
  ];

  const PST_ROOK = [
    [ 4,  6,  8, 10, 10,  8,  6,  4],
    [12, 16, 16, 18, 18, 16, 16, 12],
    [-4,  0,  0,  0,  0,  0,  0, -4],
    [-4,  0,  0,  0,  0,  0,  0, -4],
    [-4,  0,  0,  0,  0,  0,  0, -4],
    [-4,  0,  0,  0,  0,  0,  0, -4],
    [-4,  0,  0,  0,  0,  0,  0, -4],
    [ 0,  0,  4, 10, 10,  4,  0,  0],
  ];

  const PST_QUEEN = [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  4,  0,  0,  0,  0,-10],
    [-10,  4,  6,  6,  6,  6,  0,-10],
    [ -5,  0,  6,  8,  8,  6,  0, -5],
    [  0,  0,  6,  8,  8,  6,  0, -5],
    [-10,  6,  6,  6,  6,  6,  0,-10],
    [-10,  0,  6,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20],
  ];

  const PST_KING_MID = [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [ 18, 18,  0,  0,  0,  0, 18, 18],
    [ 22, 32, 12,  0,  0, 12, 34, 22],
  ];

  const PST_KING_END = [
    [-50,-35,-25,-20,-20,-25,-35,-50],
    [-30,-15,  0,  5,  5,  0,-15,-30],
    [-20,  0, 16, 24, 24, 16,  0,-20],
    [-20,  5, 22, 32, 32, 22,  5,-20],
    [-20,  5, 22, 32, 32, 22,  5,-20],
    [-20,  0, 14, 20, 20, 14,  0,-20],
    [-30,-15,  0,  5,  5,  0,-15,-30],
    [-50,-35,-25,-20,-20,-25,-35,-50],
  ];

  const KNIGHT_DIRS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  const BISHOP_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];
  const ROOK_DIRS   = [[-1,0],[1,0],[0,-1],[0,1]];
  const KING_DIRS   = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const isUpper = (ch) => ch >= 'A' && ch <= 'Z';
  const pieceColor = (ch) => (ch ? (isUpper(ch) ? 'w' : 'b') : null);
  const sqName = (r, c) => FILES[c] + String(8 - r);
  const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

  // Opening book keyed by board-turn-castling-ep FEN prefix (first 4 fields)
  const OPENING_BOOK = {
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': ['e2e4', 'd2d4', 'c2c4', 'g1f3'],
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3': ['c7c5', 'e7e5', 'e7e6', 'c7c6'],
    'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3': ['g8f6', 'd7d5', 'e7e6'],
    'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3': ['e7e5', 'g8f6', 'c7c5'],
    'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -': ['d7d5', 'g8f6', 'c7c5'],
    // 1. e4 c5 (Sicilian)
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6': ['g1f3', 'b1c3'],
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -': ['d7d6', 'b8c6', 'e7e6'],
    'rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': ['d2d4', 'f1b5'],
    'rnbqkbnr/pp2pppp/3p4/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3': ['c5d4'],
    'rnbqkbnr/pp2pppp/3p4/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq -': ['g8f6'],
    'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq -': ['a7a6', 'e7e5', 'b8c6'],
    // 1. e4 e5 (Open Game)
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6': ['g1f3', 'f1c4'],
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -': ['b8c6', 'g8f6'],
    'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': ['f1b5', 'f1c4', 'd2d4'],
    'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -': ['a7a6', 'g8f6'],
    'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -': ['b5a4'],
    'r1bqkbnr/1ppp1ppp/p1n5/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b KQkq -': ['g8f6'],
    'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -': ['f8c5', 'g8f6'],
    // 1. e4 e6 (French) & 1. e4 c6 (Caro-Kann)
    'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': ['d2d4'],
    'rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3': ['d7d5'],
    'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': ['d2d4'],
    'rnbqkbnr/pp1ppppp/2p5/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3': ['d7d5'],
    // 1. d4 d5 (QGD / Slav) & 1. d4 Nf6 (Indian)
    'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6': ['c2c4', 'g1f3', 'c1f4'],
    'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3': ['e7e6', 'c7c6'],
    'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -': ['c2c4', 'g1f3', 'c1f4'],
    'rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3': ['e7e6', 'g7g6'],
  };

  class ChessGame {
    constructor(fen = START_FEN) {
      this.loadFen(fen);
    }

    loadFen(fen = START_FEN) {
      const parts = String(fen).trim().split(/\s+/);
      const rows = (parts[0] || START_FEN.split(' ')[0]).split('/');
      this.board = Array.from({ length: 8 }, () => Array(8).fill(null));
      for (let r = 0; r < 8; r++) {
        let c = 0;
        const rowStr = rows[r] || '';
        for (let i = 0; i < rowStr.length && c < 8; i++) {
          const ch = rowStr[i];
          if (ch >= '1' && ch <= '8') {
            c += Number(ch);
          } else {
            this.board[r][c] = ch;
            c += 1;
          }
        }
      }
      this.turn = parts[1] === 'b' ? 'b' : 'w';
      const cast = parts[2] || '-';
      this.castling = {
        K: cast.includes('K'),
        Q: cast.includes('Q'),
        k: cast.includes('k'),
        q: cast.includes('q'),
      };
      const epStr = parts[3] || '-';
      if (epStr !== '-' && epStr.length === 2) {
        const ec = FILES.indexOf(epStr[0]);
        const er = 8 - Number(epStr[1]);
        this.ep = inBounds(er, ec) ? { r: er, c: ec } : null;
      } else {
        this.ep = null;
      }
      this.halfmove = Math.max(0, Number(parts[4]) || 0);
      this.fullmove = Math.max(1, Number(parts[5]) || 1);
      this.history = [];
      this.positionCounts = new Map();
      const key = this.positionKey();
      this.positionCounts.set(key, 1);
    }

    clone() {
      const g = new ChessGame();
      g.board = this.board.map((row) => row.slice());
      g.turn = this.turn;
      g.castling = { ...this.castling };
      g.ep = this.ep ? { ...this.ep } : null;
      g.halfmove = this.halfmove;
      g.fullmove = this.fullmove;
      g.history = [];
      g.positionCounts = new Map(this.positionCounts);
      return g;
    }

    positionKey() {
      let s = '';
      for (let r = 0; r < 8; r++) {
        let empty = 0;
        for (let c = 0; c < 8; c++) {
          const p = this.board[r][c];
          if (!p) empty++;
          else {
            if (empty) { s += empty; empty = 0; }
            s += p;
          }
        }
        if (empty) s += empty;
        if (r < 7) s += '/';
      }
      let cast = '';
      if (this.castling.K) cast += 'K';
      if (this.castling.Q) cast += 'Q';
      if (this.castling.k) cast += 'k';
      if (this.castling.q) cast += 'q';
      const epStr = this.ep ? sqName(this.ep.r, this.ep.c) : '-';
      return `${s} ${this.turn} ${cast || '-'} ${epStr}`;
    }

    toFen() {
      return `${this.positionKey()} ${this.halfmove} ${this.fullmove}`;
    }

    findKing(color) {
      const target = color === 'w' ? 'K' : 'k';
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (this.board[r][c] === target) return { r, c };
        }
      }
      return null;
    }

    isSquareAttacked(r, c, byColor) {
      const b = this.board;
      // Pawns
      const pawn = byColor === 'w' ? 'P' : 'p';
      const pr = byColor === 'w' ? r + 1 : r - 1;
      if (pr >= 0 && pr < 8) {
        if (c > 0 && b[pr][c - 1] === pawn) return true;
        if (c < 7 && b[pr][c + 1] === pawn) return true;
      }
      // Knights
      const knight = byColor === 'w' ? 'N' : 'n';
      for (let i = 0; i < 8; i++) {
        const nr = r + KNIGHT_DIRS[i][0];
        const nc = c + KNIGHT_DIRS[i][1];
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr][nc] === knight) return true;
      }
      // Bishops & Queen (diagonals)
      const bishop = byColor === 'w' ? 'B' : 'b';
      const queen = byColor === 'w' ? 'Q' : 'q';
      for (let i = 0; i < 4; i++) {
        const dr = BISHOP_DIRS[i][0];
        const dc = BISHOP_DIRS[i][1];
        let nr = r + dr;
        let nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const p = b[nr][nc];
          if (p) {
            if (p === bishop || p === queen) return true;
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
      // Rooks & Queen (orthogonals)
      const rook = byColor === 'w' ? 'R' : 'r';
      for (let i = 0; i < 4; i++) {
        const dr = ROOK_DIRS[i][0];
        const dc = ROOK_DIRS[i][1];
        let nr = r + dr;
        let nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const p = b[nr][nc];
          if (p) {
            if (p === rook || p === queen) return true;
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
      // King
      const king = byColor === 'w' ? 'K' : 'k';
      for (let i = 0; i < 8; i++) {
        const nr = r + KING_DIRS[i][0];
        const nc = c + KING_DIRS[i][1];
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr][nc] === king) return true;
      }
      return false;
    }

    inCheck(color = this.turn) {
      const k = this.findKing(color);
      if (!k) return false;
      return this.isSquareAttacked(k.r, k.c, color === 'w' ? 'b' : 'w');
    }

    generatePseudoMovesFor(r, c, out) {
      const p = this.board[r][c];
      if (!p) return;
      const color = pieceColor(p);
      const lower = p.toLowerCase();
      const enemy = color === 'w' ? 'b' : 'w';
      const b = this.board;

      if (lower === 'p') {
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        const promoRow = color === 'w' ? 0 : 7;
        const r1 = r + dir;
        if (inBounds(r1, c) && !b[r1][c]) {
          if (r1 === promoRow) {
            for (const promo of ['q', 'r', 'b', 'n']) {
              out.push({ fromR: r, fromC: c, toR: r1, toC: c, piece: p, captured: null, promo: color === 'w' ? promo.toUpperCase() : promo });
            }
          } else {
            out.push({ fromR: r, fromC: c, toR: r1, toC: c, piece: p, captured: null });
            const r2 = r + dir * 2;
            if (r === startRow && !b[r2][c]) {
              out.push({ fromR: r, fromC: c, toR: r2, toC: c, piece: p, captured: null, pawnDouble: true });
            }
          }
        }
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (!inBounds(r1, nc)) continue;
          const target = b[r1][nc];
          if (target && pieceColor(target) === enemy) {
            if (r1 === promoRow) {
              for (const promo of ['q', 'r', 'b', 'n']) {
                out.push({ fromR: r, fromC: c, toR: r1, toC: nc, piece: p, captured: target, promo: color === 'w' ? promo.toUpperCase() : promo });
              }
            } else {
              out.push({ fromR: r, fromC: c, toR: r1, toC: nc, piece: p, captured: target });
            }
          } else if (this.ep && this.ep.r === r1 && this.ep.c === nc) {
            const capPiece = b[r][nc];
            if (capPiece && pieceColor(capPiece) === enemy) {
              out.push({ fromR: r, fromC: c, toR: r1, toC: nc, piece: p, captured: capPiece, enPassant: true });
            }
          }
        }
        return;
      }

      if (lower === 'n') {
        for (let i = 0; i < 8; i++) {
          const nr = r + KNIGHT_DIRS[i][0];
          const nc = c + KNIGHT_DIRS[i][1];
          if (!inBounds(nr, nc)) continue;
          const t = b[nr][nc];
          if (!t || pieceColor(t) === enemy) {
            out.push({ fromR: r, fromC: c, toR: nr, toC: nc, piece: p, captured: t || null });
          }
        }
        return;
      }

      if (lower === 'b' || lower === 'r' || lower === 'q') {
        const dirs = lower === 'b' ? BISHOP_DIRS : lower === 'r' ? ROOK_DIRS : KING_DIRS;
        for (let i = 0; i < dirs.length; i++) {
          const dr = dirs[i][0];
          const dc = dirs[i][1];
          let nr = r + dr;
          let nc = c + dc;
          while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const t = b[nr][nc];
            if (!t) {
              out.push({ fromR: r, fromC: c, toR: nr, toC: nc, piece: p, captured: null });
            } else {
              if (pieceColor(t) === enemy) {
                out.push({ fromR: r, fromC: c, toR: nr, toC: nc, piece: p, captured: t });
              }
              break;
            }
            nr += dr;
            nc += dc;
          }
        }
        return;
      }

      if (lower === 'k') {
        for (let i = 0; i < 8; i++) {
          const nr = r + KING_DIRS[i][0];
          const nc = c + KING_DIRS[i][1];
          if (!inBounds(nr, nc)) continue;
          const t = b[nr][nc];
          if (!t || pieceColor(t) === enemy) {
            out.push({ fromR: r, fromC: c, toR: nr, toC: nc, piece: p, captured: t || null });
          }
        }
        // Castling
        const homeRow = color === 'w' ? 7 : 0;
        if (r === homeRow && c === 4 && !this.isSquareAttacked(homeRow, 4, enemy)) {
          const ks = color === 'w' ? this.castling.K : this.castling.k;
          const qs = color === 'w' ? this.castling.Q : this.castling.q;
          const rookChar = color === 'w' ? 'R' : 'r';
          if (ks && b[homeRow][7] === rookChar && !b[homeRow][5] && !b[homeRow][6]) {
            if (!this.isSquareAttacked(homeRow, 5, enemy) && !this.isSquareAttacked(homeRow, 6, enemy)) {
              out.push({ fromR: homeRow, fromC: 4, toR: homeRow, toC: 6, piece: p, captured: null, castle: 'K' });
            }
          }
          if (qs && b[homeRow][0] === rookChar && !b[homeRow][1] && !b[homeRow][2] && !b[homeRow][3]) {
            if (!this.isSquareAttacked(homeRow, 3, enemy) && !this.isSquareAttacked(homeRow, 2, enemy)) {
              out.push({ fromR: homeRow, fromC: 4, toR: homeRow, toC: 2, piece: p, captured: null, castle: 'Q' });
            }
          }
        }
      }
    }

    pushRawMove(move) {
      const b = this.board;
      const color = pieceColor(move.piece);
      const prevCastling = { ...this.castling };
      const prevEp = this.ep ? { ...this.ep } : null;
      const prevHalfmove = this.halfmove;
      const prevFullmove = this.fullmove;

      b[move.fromR][move.fromC] = null;
      if (move.enPassant) {
        b[move.fromR][move.toC] = null;
      }
      b[move.toR][move.toC] = move.promo || move.piece;

      if (move.castle === 'K') {
        b[move.toR][5] = b[move.toR][7];
        b[move.toR][7] = null;
      } else if (move.castle === 'Q') {
        b[move.toR][3] = b[move.toR][0];
        b[move.toR][0] = null;
      }

      // Update castling rights
      if (move.piece === 'K') { this.castling.K = false; this.castling.Q = false; }
      if (move.piece === 'k') { this.castling.k = false; this.castling.q = false; }
      if (move.fromR === 7 && move.fromC === 0) this.castling.Q = false;
      if (move.fromR === 7 && move.fromC === 7) this.castling.K = false;
      if (move.fromR === 0 && move.fromC === 0) this.castling.q = false;
      if (move.fromR === 0 && move.fromC === 7) this.castling.k = false;
      if (move.toR === 7 && move.toC === 0) this.castling.Q = false;
      if (move.toR === 7 && move.toC === 7) this.castling.K = false;
      if (move.toR === 0 && move.toC === 0) this.castling.q = false;
      if (move.toR === 0 && move.toC === 7) this.castling.k = false;

      // Update en passant square
      if (move.pawnDouble) {
        this.ep = { r: (move.fromR + move.toR) >> 1, c: move.fromC };
      } else {
        this.ep = null;
      }

      if (move.piece.toLowerCase() === 'p' || move.captured) {
        this.halfmove = 0;
      } else {
        this.halfmove += 1;
      }
      if (color === 'b') this.fullmove += 1;
      this.turn = color === 'w' ? 'b' : 'w';

      return { move, prevCastling, prevEp, prevHalfmove, prevFullmove };
    }

    popRawMove(undo) {
      const m = undo.move;
      const b = this.board;
      const color = pieceColor(m.piece);

      this.turn = color;
      this.castling = undo.prevCastling;
      this.ep = undo.prevEp;
      this.halfmove = undo.prevHalfmove;
      this.fullmove = undo.prevFullmove;

      b[m.fromR][m.fromC] = m.piece;
      b[m.toR][m.toC] = m.enPassant ? null : m.captured;
      if (m.enPassant) {
        b[m.fromR][m.toC] = m.captured;
      }
      if (m.castle === 'K') {
        b[m.toR][7] = b[m.toR][5];
        b[m.toR][5] = null;
      } else if (m.castle === 'Q') {
        b[m.toR][0] = b[m.toR][3];
        b[m.toR][3] = null;
      }
    }

    getAllLegalMoves(color = this.turn, capturesOnly = false) {
      const pseudo = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = this.board[r][c];
          if (p && pieceColor(p) === color) {
            this.generatePseudoMovesFor(r, c, pseudo);
          }
        }
      }
      const legal = [];
      for (let i = 0; i < pseudo.length; i++) {
        const m = pseudo[i];
        if (capturesOnly && !m.captured && !m.promo) continue;
        const undo = this.pushRawMove(m);
        if (!this.inCheck(color)) {
          legal.push(m);
        }
        this.popRawMove(undo);
      }
      return legal;
    }

    getLegalMoves(fromR, fromC) {
      const p = this.board[fromR]?.[fromC];
      if (!p || pieceColor(p) !== this.turn) return [];
      const pseudo = [];
      this.generatePseudoMovesFor(fromR, fromC, pseudo);
      const legal = [];
      for (let i = 0; i < pseudo.length; i++) {
        const m = pseudo[i];
        const undo = this.pushRawMove(m);
        if (!this.inCheck(this.turn === 'w' ? 'b' : 'w')) {
          legal.push(m);
        }
        this.popRawMove(undo);
      }
      return legal;
    }

    formatSan(move, legalSameColor) {
      if (move.castle === 'K') return 'O-O';
      if (move.castle === 'Q') return 'O-O-O';
      const lower = move.piece.toLowerCase();
      let san = '';
      if (lower === 'p') {
        if (move.captured) san += FILES[move.fromC] + 'x';
        san += sqName(move.toR, move.toC);
      } else {
        san += lower.toUpperCase();
        // Disambiguation among legal moves of same piece type to same destination
        let sameFile = false;
        let sameRank = false;
        let ambig = false;
        for (let i = 0; i < legalSameColor.length; i++) {
          const o = legalSameColor[i];
          if (o === move) continue;
          if (o.piece === move.piece && o.toR === move.toR && o.toC === move.toC && (o.fromR !== move.fromR || o.fromC !== move.fromC)) {
            ambig = true;
            if (o.fromC === move.fromC) sameFile = true;
            if (o.fromR === move.fromR) sameRank = true;
          }
        }
        if (ambig) {
          if (!sameFile) san += FILES[move.fromC];
          else if (!sameRank) san += String(8 - move.fromR);
          else san += sqName(move.fromR, move.fromC);
        }
        if (move.captured) san += 'x';
        san += sqName(move.toR, move.toC);
      }
      if (move.promo) san += '=' + move.promo.toUpperCase();
      return san;
    }

    makeMove(moveInput) {
      const legal = this.getAllLegalMoves(this.turn);
      const move = legal.find((m) =>
        m.fromR === moveInput.fromR &&
        m.fromC === moveInput.fromC &&
        m.toR === moveInput.toR &&
        m.toC === moveInput.toC &&
        (!moveInput.promo || (m.promo && m.promo.toLowerCase() === moveInput.promo.toLowerCase()))
      );
      if (!move) return null;

      let san = this.formatSan(move, legal);
      const undo = this.pushRawMove(move);

      const oppLegal = this.getAllLegalMoves(this.turn);
      const isCheck = this.inCheck(this.turn);
      if (isCheck) {
        san += oppLegal.length === 0 ? '#' : '+';
      }

      const key = this.positionKey();
      this.positionCounts.set(key, (this.positionCounts.get(key) || 0) + 1);

      const record = {
        ...move,
        uci: sqName(move.fromR, move.fromC) + sqName(move.toR, move.toC) + (move.promo ? move.promo.toLowerCase() : ''),
        san,
        isCheck,
        undo,
        posKey: key,
      };
      this.history.push(record);
      return record;
    }

    undoMove() {
      const record = this.history.pop();
      if (!record) return null;
      const cnt = (this.positionCounts.get(record.posKey) || 1) - 1;
      if (cnt <= 0) this.positionCounts.delete(record.posKey);
      else this.positionCounts.set(record.posKey, cnt);
      this.popRawMove(record.undo);
      return record;
    }

    hasInsufficientMaterial() {
      const minorW = [];
      const minorB = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = this.board[r][c];
          if (!p) continue;
          const lower = p.toLowerCase();
          if (lower === 'p' || lower === 'r' || lower === 'q') return false;
          if (lower === 'b' || lower === 'n') {
            const item = { lower, sqColor: (r + c) & 1 };
            if (isUpper(p)) minorW.push(item);
            else minorB.push(item);
          }
        }
      }
      if (minorW.length === 0 && minorB.length === 0) return true;
      if ((minorW.length === 1 && minorB.length === 0) || (minorB.length === 1 && minorW.length === 0)) return true;
      if (minorW.length === 1 && minorB.length === 1 && minorW[0].lower === 'b' && minorB[0].lower === 'b') {
        return minorW[0].sqColor === minorB[0].sqColor;
      }
      return false;
    }

    getStatus() {
      const legal = this.getAllLegalMoves(this.turn);
      const check = this.inCheck(this.turn);
      if (legal.length === 0) {
        if (check) {
          return {
            over: true,
            state: 'checkmate',
            winner: this.turn === 'w' ? 'b' : 'w',
            inCheck: true,
          };
        }
        return { over: true, state: 'stalemate', winner: 'draw', inCheck: false };
      }
      if (this.halfmove >= 100) {
        return { over: true, state: 'draw-50', winner: 'draw', inCheck: check };
      }
      const key = this.positionKey();
      if ((this.positionCounts.get(key) || 0) >= 3) {
        return { over: true, state: 'draw-repetition', winner: 'draw', inCheck: check };
      }
      if (this.hasInsufficientMaterial()) {
        return { over: true, state: 'draw-insufficient', winner: 'draw', inCheck: check };
      }
      return { over: false, state: check ? 'check' : 'playing', winner: null, inCheck: check };
    }
  }

  /* ==================== EVALUATION & AI SEARCH ==================== */

  function evaluateBoard(game) {
    const b = game.board;
    let nonPawnMaterial = 0;
    let wBishops = 0;
    let bBishops = 0;
    let scoreW = 0;

    // Track pawn files for structure evaluation
    const wPawnCols = [0,0,0,0,0,0,0,0];
    const bPawnCols = [0,0,0,0,0,0,0,0];
    let wkPos = null;
    let bkPos = null;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (!p) continue;
        const w = isUpper(p);
        const lower = p.toLowerCase();
        const pr = w ? r : 7 - r;
        let val = PIECE_VALUES[lower];

        if (lower === 'p') {
          val += PST_PAWN[pr][c];
          if (w) wPawnCols[c]++;
          else bPawnCols[c]++;
        } else if (lower === 'n') {
          val += PST_KNIGHT[pr][c];
          nonPawnMaterial += PIECE_VALUES.n;
        } else if (lower === 'b') {
          val += PST_BISHOP[pr][c];
          nonPawnMaterial += PIECE_VALUES.b;
          if (w) wBishops++; else bBishops++;
        } else if (lower === 'r') {
          val += PST_ROOK[pr][c];
          nonPawnMaterial += PIECE_VALUES.r;
        } else if (lower === 'q') {
          val += PST_QUEEN[pr][c];
          nonPawnMaterial += PIECE_VALUES.q;
        } else if (lower === 'k') {
          if (w) wkPos = { r, c };
          else bkPos = { r, c };
        }

        scoreW += w ? val : -val;
      }
    }

    // Tapered king safety (endgame phase blends when non-pawn material < ~2600)
    const egWeight = Math.max(0, Math.min(1, 1 - (nonPawnMaterial - 1200) / 3600));
    if (wkPos) {
      const mid = PST_KING_MID[wkPos.r][wkPos.c];
      const end = PST_KING_END[wkPos.r][wkPos.c];
      scoreW += Math.round(mid * (1 - egWeight) + end * egWeight);
    }
    if (bkPos) {
      const kr = 7 - bkPos.r;
      const mid = PST_KING_MID[kr][bkPos.c];
      const end = PST_KING_END[kr][bkPos.c];
      scoreW -= Math.round(mid * (1 - egWeight) + end * egWeight);
    }

    // Bishop pair bonus
    if (wBishops >= 2) scoreW += 36;
    if (bBishops >= 2) scoreW -= 36;

    // Doubled & isolated pawn penalties
    for (let c = 0; c < 8; c++) {
      if (wPawnCols[c] > 1) scoreW -= 14 * (wPawnCols[c] - 1);
      if (bPawnCols[c] > 1) scoreW += 14 * (bPawnCols[c] - 1);
      const wIso = (c === 0 || wPawnCols[c - 1] === 0) && (c === 7 || wPawnCols[c + 1] === 0);
      const bIso = (c === 0 || bPawnCols[c - 1] === 0) && (c === 7 || bPawnCols[c + 1] === 0);
      if (wPawnCols[c] > 0 && wIso) scoreW -= 12 * wPawnCols[c];
      if (bPawnCols[c] > 0 && bIso) scoreW += 12 * bPawnCols[c];
    }

    return game.turn === 'w' ? scoreW : -scoreW;
  }

  function scoreMoveOrder(m, ttUci, killerA, killerB) {
    const uci = sqName(m.fromR, m.fromC) + sqName(m.toR, m.toC) + (m.promo ? m.promo.toLowerCase() : '');
    if (ttUci && uci === ttUci) return 1000000;
    let s = 0;
    if (m.captured) {
      const victim = PIECE_VALUES[m.captured.toLowerCase()] || 100;
      const attacker = PIECE_VALUES[m.piece.toLowerCase()] || 100;
      s += 100000 + victim * 10 - attacker;
    }
    if (m.promo) {
      s += 90000 + (PIECE_VALUES[m.promo.toLowerCase()] || 0);
    }
    if (m.castle) s += 550;
    if (!m.captured) {
      if (killerA && uci === killerA) s += 8000;
      else if (killerB && uci === killerB) s += 7000;
    }
    return s;
  }

  function moveToUci(m) {
    return sqName(m.fromR, m.fromC) + sqName(m.toR, m.toC) + (m.promo ? m.promo.toLowerCase() : '');
  }

  function chooseBestMove(fenOrGame, difficulty = 'medium') {
    const game = typeof fenOrGame === 'string' ? new ChessGame(fenOrGame) : fenOrGame.clone();
    const diff = ['easy', 'medium', 'hard', 'gm'].includes(difficulty) ? difficulty : 'medium';
    const legal = game.getAllLegalMoves(game.turn);
    if (!legal.length) return null;
    if (legal.length === 1) return legal[0];

    // Check opening book for Hard / Grandmaster
    if (diff === 'hard' || diff === 'gm') {
      const key = game.positionKey();
      const bookMoves = OPENING_BOOK[key];
      if (bookMoves && bookMoves.length) {
        const pickUci = diff === 'gm'
          ? bookMoves[Math.floor(Math.random() * Math.min(2, bookMoves.length))]
          : bookMoves[Math.floor(Math.random() * bookMoves.length)];
        const found = legal.find((m) => moveToUci(m) === pickUci);
        if (found) return found;
      }
    }

    const cfg = {
      easy:   { maxDepth: 2, timeMs: 120, qDepth: 2 },
      medium: { maxDepth: 3, timeMs: 260, qDepth: 4 },
      hard:   { maxDepth: 4, timeMs: 520, qDepth: 6 },
      gm:     { maxDepth: 6, timeMs: 820, qDepth: 8 },
    }[diff];

    const startTime = Date.now();
    let aborted = false;
    let nodes = 0;
    const tt = new Map();
    const killers = Array.from({ length: 12 }, () => [null, null]);

    const checkTimeout = () => {
      if ((nodes & 1023) === 0 && Date.now() - startTime >= cfg.timeMs) {
        aborted = true;
      }
      return aborted;
    };

    const quiescence = (alpha, beta, qPly) => {
      nodes++;
      if (checkTimeout()) return alpha;
      const standPat = evaluateBoard(game);
      if (standPat >= beta) return beta;
      if (alpha < standPat) alpha = standPat;
      if (qPly >= cfg.qDepth) return alpha;

      const captures = game.getAllLegalMoves(game.turn, true);
      captures.sort((a, b) => scoreMoveOrder(b) - scoreMoveOrder(a));

      for (let i = 0; i < captures.length; i++) {
        const m = captures[i];
        // Delta pruning guard (skip hopeless captures unless promo)
        if (!m.promo && standPat + PIECE_VALUES[m.captured.toLowerCase()] + 180 < alpha) continue;
        const undo = game.pushRawMove(m);
        const val = -quiescence(-beta, -alpha, qPly + 1);
        game.popRawMove(undo);
        if (aborted) return alpha;
        if (val >= beta) return beta;
        if (val > alpha) alpha = val;
      }
      return alpha;
    };

    const negamax = (depth, ply, alpha, beta) => {
      nodes++;
      if (checkTimeout()) return 0;

      const key = game.positionKey();
      const ttEntry = tt.get(key);
      if (ttEntry && ttEntry.depth >= depth) {
        if (ttEntry.flag === 0) return ttEntry.score;
        if (ttEntry.flag === 1 && ttEntry.score > alpha) alpha = ttEntry.score;
        else if (ttEntry.flag === 2 && ttEntry.score < beta) beta = ttEntry.score;
        if (alpha >= beta) return ttEntry.score;
      }

      if (depth <= 0) {
        return quiescence(alpha, beta, 0);
      }

      const moves = game.getAllLegalMoves(game.turn);
      if (moves.length === 0) {
        return game.inCheck(game.turn) ? (-50000 + ply) : 0;
      }
      if (game.halfmove >= 100) return 0;

      const ttMove = ttEntry ? ttEntry.bestUci : null;
      const kPair = killers[ply] || [null, null];
      moves.sort((a, b) => scoreMoveOrder(b, ttMove, kPair[0], kPair[1]) - scoreMoveOrder(a, ttMove, kPair[0], kPair[1]));

      const origAlpha = alpha;
      let bestScore = -999999;
      let bestUci = moveToUci(moves[0]);

      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        const undo = game.pushRawMove(m);
        const score = -negamax(depth - 1, ply + 1, -beta, -alpha);
        game.popRawMove(undo);
        if (aborted) return bestScore;

        if (score > bestScore) {
          bestScore = score;
          bestUci = moveToUci(m);
        }
        if (score > alpha) {
          alpha = score;
        }
        if (alpha >= beta) {
          if (!m.captured && killers[ply]) {
            const uci = moveToUci(m);
            if (killers[ply][0] !== uci) {
              killers[ply][1] = killers[ply][0];
              killers[ply][0] = uci;
            }
          }
          break;
        }
      }

      if (tt.size < 25000) {
        const flag = bestScore <= origAlpha ? 2 : bestScore >= beta ? 1 : 0;
        tt.set(key, { depth, score: bestScore, flag, bestUci });
      }
      return bestScore;
    };

    // Iterative deepening root search keeping scored moves for Easy/Medium personality
    let bestMove = legal[0];
    let scoredRoot = legal.map((m) => ({ move: m, score: 0 }));

    for (let depth = 1; depth <= cfg.maxDepth; depth++) {
      const currentScores = [];
      let alpha = -999999;
      const beta = 999999;
      const bestUci = moveToUci(bestMove);
      legal.sort((a, b) => {
        if (depth > 1) {
          if (moveToUci(a) === bestUci) return -1;
          if (moveToUci(b) === bestUci) return 1;
        }
        return scoreMoveOrder(b, bestUci) - scoreMoveOrder(a, bestUci);
      });

      for (let i = 0; i < legal.length; i++) {
        const m = legal[i];
        const undo = game.pushRawMove(m);
        const val = -negamax(depth - 1, 1, -beta, -alpha);
        game.popRawMove(undo);
        if (aborted) break;
        currentScores.push({ move: m, score: val });
        if (val > alpha) alpha = val;
      }

      if (!aborted && currentScores.length === legal.length) {
        currentScores.sort((a, b) => b.score - a.score);
        scoredRoot = currentScores;
        bestMove = currentScores[0].move;
        if (currentScores[0].score > 45000) break; // forced mate found
      } else {
        break;
      }
    }

    // Difficulty personality adjustments:
    if (diff === 'easy') {
      // Pick randomly among top few moves or occasionally play an imprecise move (unless forced mate)
      if (scoredRoot[0].score < 40000) {
        const poolCount = Math.min(scoredRoot.length, Math.random() < 0.35 ? 6 : 3);
        return scoredRoot[Math.floor(Math.random() * poolCount)].move;
      }
    } else if (diff === 'medium') {
      // Slightly human: within 45 centipawns of best, occasionally pick 2nd option
      const topScore = scoredRoot[0].score;
      const nearBest = scoredRoot.filter((x) => topScore - x.score <= 45);
      if (nearBest.length > 1 && Math.random() < 0.25) {
        return nearBest[Math.floor(Math.random() * Math.min(3, nearBest.length))].move;
      }
    }

    return bestMove;
  }

  root.KurizuChess = {
    ChessGame,
    chooseBestMove,
    evaluateBoard,
    START_FEN,
    PIECE_VALUES,
    FILES,
  };
})(typeof window !== 'undefined' ? window : self);
