import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { routeModeSources } from "../src/smoosh/engine/mode-contracts.ts";
import { normalizeSavedProcession } from "../src/smoosh/procession.ts";
import { DEFAULT_GRAVITY_WELLS, MODE_META } from "../src/smoosh/types.ts";

const shader = readFileSync("src/smoosh/engine/shaders.ts", "utf8");
const renderer = readFileSync("src/smoosh/engine/renderer.ts", "utf8");
const ui = readFileSync("src/smoosh/ui/SmooshApp.tsx", "utf8");

test("Gravity Wells opens at a useful kinetic-lensing sweet spot", () => {
  assert.deepEqual(DEFAULT_GRAVITY_WELLS, {
    mass: 0.72,
    reach: 0.52,
    orbit: 0.38,
  });
  assert.equal(MODE_META.gravity.label, "GRAVITY WELLS");
  assert.match(MODE_META.gravity.hint, /B turns motion into gravity/);
});

test("nine motion-fed point masses bend both source and feedback", () => {
  assert.match(shader, /if \(uGravityMode == 1\)/);
  assert.match(shader, /wellY < 3/);
  assert.match(shader, /wellX < 3/);
  assert.match(shader, /decodeFlow\(texture\(uFlow, anchor\)/);
  assert.match(shader, /exp\(-distanceSq/);
  assert.match(shader, /tangent \* handedness/);
  assert.match(shader, /texture\(uFeedback, memoryUv\)\.rgb \* uPersist/);
  assert.match(renderer, /input\.mode === "gravity"/);
});

test("Gravity Wells exposes only Mass, Reach, and Orbit", () => {
  assert.match(ui, /aria-label="Gravity Wells controls"/);
  assert.match(ui, /\["MASS", "mass"\]/);
  assert.match(ui, /\["REACH", "reach"\]/);
  assert.match(ui, /\["ORBIT", "orbit"\]/);
  const section = ui.match(
    /function GravityWellControls\(\)[\s\S]*?\n}\n\nfunction ControlSheet/,
  )?.[0];
  assert.ok(section);
  assert.equal((section.match(/type="range"/g) ?? []).length, 1);
});

test("Gravity Wells accepts one source and survives Procession", () => {
  assert.deepEqual(routeModeSources("gravity", true, false), {
    pixels: "a",
    motion: "a",
    pixelsB: "a",
    effectiveMode: "gravity",
  });
  assert.deepEqual(routeModeSources("gravity", true, true), {
    pixels: "a",
    motion: "b",
    pixelsB: "b",
    effectiveMode: "gravity",
  });
  assert.equal(
    normalizeSavedProcession({
      version: 1,
      loop: false,
      steps: [{ id: "sink", mode: "gravity", duration: 4 }],
    })?.steps[0]?.mode,
    "gravity",
  );
});
