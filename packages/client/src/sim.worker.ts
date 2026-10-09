import { Game } from "@legionwar/engine";
import type { FromWorker, ToWorker } from "./workerProtocol";

/** Sous-ensemble de DedicatedWorkerGlobalScope utilisé ici (évite le conflit des libs DOM/WebWorker). */
interface WorkerScope {
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
  postMessage(message: FromWorker, transfer: Transferable[]): void;
}

/**
 * La simulation tourne ici, hors du thread de rendu. Les tampons de tuiles sont transférés
 * (zéro copie) vers le thread principal.
 */
const scope = self as unknown as WorkerScope;
let game: Game | null = null;

function post(message: FromWorker, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

scope.onmessage = (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  try {
    if (msg.type === "init") {
      game = new Game(msg.config);
      const terrain = game.map.terrain.slice();
      const state = game.map.state.slice();
      post(
        {
          type: "ready",
          width: game.map.width,
          height: game.map.height,
          terrain,
          state,
          mines: [...game.mines],
        },
        [terrain.buffer, state.buffer],
      );
    } else if (msg.type === "turn" && game) {
      const result = game.executeTurn(msg.turn);
      post({ type: "tick", result }, [result.changedTiles.buffer]);
    }
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
