import "./styles.css";
import { GameSession } from "./GameSession";
import { showMenu } from "./ui/Menu";

const root = document.getElementById("app");
if (!root) throw new Error("Élément #app introuvable");
const app: HTMLElement = root;

function openMenu(): void {
  const closeMenu = showMenu(app, (choice) => {
    closeMenu();
    const session = new GameSession(app, choice, () => {
      session.dispose();
      openMenu();
    });
  });
}

openMenu();
