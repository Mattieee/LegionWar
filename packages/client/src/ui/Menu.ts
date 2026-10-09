import { ALL_RACES, MAP_DIMENSIONS, RACES, Race, type MapSize } from "@legionwar/engine";
import { NAME_MAX_LENGTH, NAME_MIN_LENGTH, sanitizeName } from "@legionwar/shared";
import { escapeHtml, storage } from "./format";

export interface MenuChoice {
  name: string;
  race: Race;
  mapSize: MapSize;
  bots: number;
  seed: number;
}

const MAP_LABELS: Record<MapSize, string> = {
  small: "Petite",
  medium: "Moyenne",
  large: "Grande",
};

const STORAGE_KEYS = { name: "legionwar.name", race: "legionwar.race" } as const;

/** Écran d'accueil : pseudo, race, carte, nombre de tribus. */
export function showMenu(root: HTMLElement, onStart: (choice: MenuChoice) => void): () => void {
  const savedRace = storage.get(STORAGE_KEYS.race);
  let race: Race = ALL_RACES.includes(savedRace as Race) ? (savedRace as Race) : Race.Aldoria;

  const el = document.createElement("main");
  el.className = "menu";
  el.innerHTML = `
    <header class="menu__header">
      <h1 class="menu__title">LegionWar</h1>
      <p class="menu__tagline">Levez vos bannières. Conquérez le continent de Valdren.</p>
    </header>
    <section class="panel menu__panel">
      <label class="field">
        <span class="field__label">Nom du seigneur</span>
        <input class="field__input" id="menu-name" maxlength="${NAME_MAX_LENGTH}" autocomplete="nickname"
          value="${escapeHtml(storage.get(STORAGE_KEYS.name) ?? "Seigneur")}" />
      </label>
      <fieldset class="races">
        <legend class="field__label">Choisissez votre peuple</legend>
        <div class="races__grid">
          ${ALL_RACES.map((id) => raceCard(id)).join("")}
        </div>
      </fieldset>
      <div class="menu__row">
        <label class="field">
          <span class="field__label">Carte</span>
          <select class="field__input" id="menu-map">
            ${(Object.keys(MAP_DIMENSIONS) as MapSize[])
              .map(
                (size) =>
                  `<option value="${size}" ${size === "medium" ? "selected" : ""}>${MAP_LABELS[size]} (${MAP_DIMENSIONS[size].width}×${MAP_DIMENSIONS[size].height})</option>`,
              )
              .join("")}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Tribus sauvages : <output id="menu-bots-value">60</output></span>
          <input class="field__range" type="range" id="menu-bots" min="0" max="200" step="5" value="60" />
        </label>
        <label class="field">
          <span class="field__label">Graine de la carte</span>
          <input class="field__input" id="menu-seed" inputmode="numeric" value="${randomSeed()}" />
        </label>
      </div>
      <p class="menu__error" id="menu-error" role="alert"></p>
      <button class="button button--primary" id="menu-start">Lancer la conquête</button>
    </section>
    <footer class="menu__footer">Prototype v0.1 — solo contre les tribus sauvages</footer>
  `;
  root.append(el);

  const $ = <T extends HTMLElement>(id: string): T => el.querySelector(`#${id}`) as T;
  const nameInput = $<HTMLInputElement>("menu-name");
  const botsInput = $<HTMLInputElement>("menu-bots");
  const botsValue = $<HTMLOutputElement>("menu-bots-value");
  const errorBox = $<HTMLParagraphElement>("menu-error");

  const selectRace = (id: Race): void => {
    race = id;
    for (const card of el.querySelectorAll<HTMLButtonElement>(".race")) {
      card.setAttribute("aria-pressed", String(card.dataset.race === id));
    }
  };
  selectRace(race);
  for (const card of el.querySelectorAll<HTMLButtonElement>(".race")) {
    card.addEventListener("click", () => selectRace(card.dataset.race as Race));
  }
  botsInput.addEventListener("input", () => (botsValue.value = botsInput.value));

  $<HTMLButtonElement>("menu-start").addEventListener("click", () => {
    const name = sanitizeName(nameInput.value);
    if (name === null) {
      errorBox.textContent = `Le nom doit faire entre ${NAME_MIN_LENGTH} et ${NAME_MAX_LENGTH} caractères.`;
      nameInput.focus();
      return;
    }
    const seedText = $<HTMLInputElement>("menu-seed").value.trim();
    const seed = /^\d+$/.test(seedText) ? Number(seedText) >>> 0 : randomSeed();
    storage.set(STORAGE_KEYS.name, name);
    storage.set(STORAGE_KEYS.race, race);
    onStart({
      name,
      race,
      mapSize: $<HTMLSelectElement>("menu-map").value as MapSize,
      bots: Number(botsInput.value),
      seed,
    });
  });

  return () => el.remove();
}

function raceCard(id: Race): string {
  const info = RACES[id];
  return `
    <button type="button" class="race" data-race="${id}" aria-pressed="false" style="--heraldry: ${info.heraldry}">
      <span class="race__emblem" aria-hidden="true">${info.emblem}</span>
      <span class="race__name">${escapeHtml(info.name)}</span>
      <span class="race__people">${escapeHtml(info.people)}</span>
      <span class="race__desc">${escapeHtml(info.description)}</span>
      <ul class="race__traits">${info.traits.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
    </button>`;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
