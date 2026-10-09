import { raceColor, raceTincture } from "@legionwar/design-system";
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
    <section class="lw-panel menu__sheet" aria-labelledby="menu-title">
      <header class="menu__header">
        <div class="menu__frontispice">
          <img class="menu__frontispice-art" src="/art/frontispice.webp" alt="" width="1536" height="1024" />
          <div class="menu__title-block">
            <p class="menu__overline">Atlas du continent de</p>
            <h1 class="menu__title" id="menu-title">LegionWar</h1>
          </div>
        </div>
        <p class="menu__tagline lw-flavor">Levez vos bannières, et que la carte se teinte de vos couleurs.</p>
      </header>
      <div class="lw-ornament" aria-hidden="true">❦</div>
      <label class="lw-field">
        <span class="lw-field__label">Nom du seigneur</span>
        <input class="lw-input" id="menu-name" maxlength="${NAME_MAX_LENGTH}" autocomplete="nickname"
          aria-describedby="menu-error" value="${escapeHtml(storage.get(STORAGE_KEYS.name) ?? "Seigneur")}" />
      </label>
      <fieldset class="menu__races">
        <legend class="lw-field__label">Choisissez votre peuple</legend>
        <div class="menu__race-grid">${ALL_RACES.map((id) => raceCard(id)).join("")}</div>
      </fieldset>
      <div class="menu__row">
        <label class="lw-field">
          <span class="lw-field__label">Carte</span>
          <select class="lw-select" id="menu-map">
            ${(Object.keys(MAP_DIMENSIONS) as MapSize[])
              .map(
                (size) =>
                  `<option value="${size}" ${size === "medium" ? "selected" : ""}>${MAP_LABELS[size]} (${MAP_DIMENSIONS[size].width}×${MAP_DIMENSIONS[size].height})</option>`,
              )
              .join("")}
          </select>
        </label>
        <label class="lw-field">
          <span class="lw-field__label">Tribus sauvages : <output id="menu-bots-value">60</output></span>
          <input class="lw-range" type="range" id="menu-bots" min="0" max="200" step="5" value="60" />
        </label>
        <label class="lw-field">
          <span class="lw-field__label">Graine de la carte</span>
          <input class="lw-input" id="menu-seed" inputmode="numeric" value="${randomSeed()}" />
          <span class="lw-field__hint">Même graine, même carte.</span>
        </label>
      </div>
      <p class="lw-field__error" id="menu-error" role="alert"></p>
      <div class="menu__cta">
        <button class="lw-button lw-button--primary lw-button--lg" id="menu-start">Lancer la conquête</button>
      </div>
      <footer class="menu__footer lw-text-xs lw-text-muted">
        Prototype v0.1 — solo contre les tribus sauvages · <a href="/design-system.html">Design system</a>
      </footer>
    </section>
  `;
  root.append(el);

  const $ = <T extends HTMLElement>(id: string): T => el.querySelector(`#${id}`) as T;
  const nameInput = $<HTMLInputElement>("menu-name");
  const botsInput = $<HTMLInputElement>("menu-bots");
  const botsValue = $<HTMLOutputElement>("menu-bots-value");
  const errorBox = $<HTMLParagraphElement>("menu-error");
  const cards = el.querySelectorAll<HTMLButtonElement>(".lw-card");

  const selectRace = (id: Race): void => {
    race = id;
    for (const card of cards) card.setAttribute("aria-pressed", String(card.dataset.race === id));
  };
  selectRace(race);
  for (const card of cards) {
    card.addEventListener("click", () => selectRace(card.dataset.race as Race));
  }
  botsInput.addEventListener("input", () => (botsValue.value = botsInput.value));
  nameInput.addEventListener("input", () => {
    nameInput.removeAttribute("aria-invalid");
    errorBox.textContent = "";
  });

  $<HTMLButtonElement>("menu-start").addEventListener("click", () => {
    const name = sanitizeName(nameInput.value);
    if (name === null) {
      errorBox.textContent = `Le nom doit faire entre ${NAME_MIN_LENGTH} et ${NAME_MAX_LENGTH} caractères.`;
      nameInput.setAttribute("aria-invalid", "true");
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
    <button type="button" class="lw-card menu__race" data-race="${id}" aria-pressed="false" style="--lw-card-accent: ${raceColor(id)}; --lw-font-family-title: var(--lw-skin-${id}-font)">
      <img class="menu__race-emblem" src="/art/emblems/${id}.webp" alt="" width="256" height="256" />
      <span class="lw-card__head">
        <span class="lw-shield lw-shield--lg lw-shield--hatched lw-tincture-${raceTincture(id)}" aria-hidden="true"><span>${info.emblem}</span></span>
        <span><span class="lw-card__title">${escapeHtml(info.name)}</span><br /><span class="lw-card__subtitle">${escapeHtml(info.people)}</span></span>
      </span>
      <span class="lw-card__body">${escapeHtml(info.description)}</span>
      <ul class="lw-card__list">${info.traits.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
    </button>`;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
