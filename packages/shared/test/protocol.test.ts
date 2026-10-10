import { describe, expect, it } from "vitest";
import { MAX_PLAYER_ID } from "@legionwar/engine";
import { isValidIntent } from "@legionwar/shared";

describe("isValidIntent : diplomatie", () => {
  it.each([
    { type: "allianceRequest", target: 3 },
    { type: "allianceReply", requester: 3, accept: true },
    { type: "allianceReply", requester: 3, accept: false },
    { type: "allianceRenew", ally: 7 },
    { type: "allianceBreak", ally: MAX_PLAYER_ID },
    { type: "donate", target: 2, resource: "gold", amount: 1000 },
    { type: "donate", target: 2, resource: "troops", amount: 0 },
    { type: "embargo", target: 4, on: true },
    { type: "embargo", target: 4, on: false },
  ])("accepte %o", (intent) => {
    expect(isValidIntent(intent)).toBe(true);
  });

  it.each([
    { type: "allianceRequest", target: 0 },
    { type: "allianceRequest", target: MAX_PLAYER_ID + 1 },
    { type: "allianceRequest", target: 1.5 },
    { type: "allianceReply", requester: 3, accept: "oui" },
    { type: "allianceReply", requester: 3 },
    { type: "allianceRenew", ally: -1 },
    { type: "allianceBreak" },
    { type: "donate", target: 2, resource: "mana", amount: 10 },
    { type: "embargo", target: 0, on: true },
    { type: "embargo", target: 4, on: "oui" },
    { type: "donate", target: 2, resource: "gold", amount: -5 },
    { type: "donate", target: 2, resource: "gold", amount: Number.POSITIVE_INFINITY },
  ])("refuse %o", (intent) => {
    expect(isValidIntent(intent)).toBe(false);
  });
});
