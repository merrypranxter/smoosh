import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MOSH_FRAG } from "../src/smoosh/engine/shaders.ts";
import { routeModeSources } from "../src/smoosh/engine/mode-contracts.ts";
import { normalizeSavedProcession } from "../src/smoosh/procession.ts";
import { DEFAULT_INFECTION, MODE_META } from "../src/smoosh/types.ts";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const renderer = read("src/smoosh/engine/renderer.ts");
const ui = read("src/smoosh/ui/SmooshApp.tsx");

test("Regional Infection ships with a useful motion-gated sweet spot", () => {
  assert.deepEqual(DEFAULT_INFECTION, {
    trigger: 0.34,
    spread: 0.58,
    bite: 0.82,
  });
  assert.equal(MODE_META.infection.label, "REGIONAL INFECTION");
  assert.equal(
    MODE_META.infection.hint,
    "Stillness heals. Motion opens wounds where the old frame keeps breeding.",
  );
});

test("the shader keeps static source clean and corrupts motion-active regions", () => {
  assert.match(renderer, /input\.mode === "infection"/);
  assert.match(MOSH_FRAG, /uInfectionMode == 1/);
  assert.match(MOSH_FRAG, /float activity = max/);
  assert.match(MOSH_FRAG, /float wound = smoothstep/);
  assert.match(MOSH_FRAG, /vec3 infected = texture\(uFeedback, infectedUv\)/);
  assert.match(MOSH_FRAG, /mix\(src, infected, wound \* uInfectionBite\)/);
});

test("one source can provide both body and infection motion", () => {
  assert.deepEqual(routeModeSources("infection", true, false), {
    pixels: "a",
    motion: "a",
    pixelsB: "a",
    effectiveMode: "infection",
  });
});

test("the UI exposes exactly Trigger, Spread, and Bite controls", () => {
  assert.match(ui, /function RegionalInfectionControls/);
  assert.match(ui, /TRIGGER/);
  assert.match(ui, /SPREAD/);
  assert.match(ui, /BITE/);
  assert.match(ui, /store\.mode === "infection" && <RegionalInfectionControls/);
});

test("Regional Infection survives Procession persistence", () => {
  const restored = normalizeSavedProcession({
    version: 1,
    loop: true,
    steps: [{ id: "wound", mode: "infection", duration: 4.5 }],
  });
  assert.deepEqual(restored?.steps, [
    { id: "wound", mode: "infection", duration: 4.5 },
  ]);
});
