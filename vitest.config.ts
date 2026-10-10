import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
    // Les tests de déterminisme rejouent des parties entières (2 à 5 s) : le délai par défaut
    // de 5 s les faisait échouer par intermittence sur une machine chargée.
    testTimeout: 30_000,
  },
});
