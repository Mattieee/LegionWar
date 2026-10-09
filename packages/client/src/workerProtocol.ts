import type { GameConfig, TickResult, Turn } from "@legionwar/engine";

/** Messages du thread principal vers le worker de simulation. */
export type ToWorker = { type: "init"; config: GameConfig } | { type: "turn"; turn: Turn };

/** Messages du worker de simulation vers le thread principal. */
export type FromWorker =
  | {
      type: "ready";
      width: number;
      height: number;
      terrain: Uint8Array;
      state: Uint16Array;
      mines: number[];
    }
  | { type: "tick"; result: TickResult }
  | { type: "error"; message: string };
