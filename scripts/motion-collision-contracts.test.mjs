import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MOSH_FRAG } from "../src/smoosh/engine/shaders.ts";
import { routeModeSources } from "../src/smoosh/engine/mode-contracts.ts";
import { normalizeSavedProcession } from "../src/smoosh/procession.ts";
import { DEFAULT_COLLISION, MODE_META } from "../src/smoosh/types.ts";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const renderer = read("src/smoosh/engine/renderer.ts");
const ui = read("src/smoosh/ui/SmooshApp.tsx");

test("Motion Collision has a visible but controllable sweet spot", () => {
  assert.deepEqual(DEFAULT_COLLISION, {
    impact: 0.78,
    opposition: 0.68,
    shock: 0.55,
  });
  assert.equal(MODE_META.collision.label, "MOTION COLLISION");
  assert.equal(
    MODE_META.collision.hint,
    "A's motion and B's motion crash head-on. The impact becomes the wind.",
  );
});

test("A and B motion fields are estimated independently and collide in GLSL", () => {
  assert.match(renderer, /input\.mode === "collision"/);
  assert.match(renderer, /uFlowOther/);
  assert.match(MOSH_FRAG, /uCollisionMode == 1/);
  assert.match(MOSH_FRAG, /vec2 cooperative = windB \+ windA/);
  assert.match(MOSH_FRAG, /vec2 opposed = windB - windA/);
  assert.match(MOSH_FRAG, /float disagreement = length\(windB - windA\)/);
  assert.match(MOSH_FRAG, /vec2 shrapnel/);
});

test("a solo source collides with a rotated ghost of its own motion", () => {
  assert.deepEqual(routeModeSources("collision", true, false), {
    pixels: "a",
    motion: "a",
    pixelsB: "a",
    effectiveMode: "collision",
  });
  assert.match(MOSH_FRAG, /uCollisionSolo == 1/);
  assert.match(MOSH_FRAG, /windA = vec2\(-windB\.y, windB\.x\)/);
});

test("the UI exposes only Impact, Opposition, and Shock controls", () => {
  assert.match(ui, /function MotionCollisionControls/);
  assert.match(ui, /IMPACT/);
  assert.match(ui, /OPPOSITION/);
  assert.match(ui, /SHOCK/);
  assert.match(ui, /store\.mode === "collision" && <MotionCollisionControls/);
});

test("Motion Collision survives Procession persistence", () => {
  const restored = normalizeSavedProcession({
    version: 1,
    loop: true,
    steps: [{ id: "crash", mode: "collision", duration: 5.5 }],
  });
  assert.deepEqual(restored?.steps, [
    { id: "crash", mode: "collision", duration: 5.5 },
  ]);
});
