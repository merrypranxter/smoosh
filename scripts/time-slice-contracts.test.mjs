import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MOSH_FRAG } from "../src/smoosh/engine/shaders.ts";
import { normalizeSavedProcession } from "../src/smoosh/procession.ts";
import { DEFAULT_SLICE, MODE_META } from "../src/smoosh/types.ts";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ui = read("src/smoosh/ui/SmooshApp.tsx");
const renderer = read("src/smoosh/engine/renderer.ts");

test("Time-Slice starts in a useful narrow vertical sweet spot", () => {
  assert.deepEqual(DEFAULT_SLICE, {
    slitWidth: 18,
    drift: 0.62,
    scanSpeed: 0.85,
    orientation: "vertical",
  });
  assert.equal(MODE_META.slice.label, "TIME-SLICE / SLIT-SCAN");
  assert.equal(
    MODE_META.slice.hint,
    "Each strip lives at a different moment. Drag time sideways.",
  );
});

test("the shader gives each slit a separate temporal refresh phase", () => {
  assert.match(MOSH_FRAG, /uSliceMode == 1/);
  assert.match(MOSH_FRAG, /floor\(axis \/ bandUv\)/);
  assert.match(MOSH_FRAG, /float stripPhase = fract/);
  assert.match(MOSH_FRAG, /float writePulse = smoothstep/);
  assert.match(MOSH_FRAG, /oldStrip/);
  assert.match(MOSH_FRAG, /uSliceOrientation == 0/);
  assert.match(renderer, /uSliceWidthPx/);
  assert.match(renderer, /input\.mode === "slice"/);
});

test("Time-Slice exposes only its three useful knobs plus orientation", () => {
  assert.match(ui, /function TimeSliceControls/);
  assert.match(ui, /SLIT WIDTH/);
  assert.match(ui, /TIME DRIFT/);
  assert.match(ui, /SCAN SPEED/);
  assert.match(ui, /VERT/);
  assert.match(ui, /HORIZ/);
  assert.match(ui, /store\.mode === "slice" && <TimeSliceControls/);
});

test("Time-Slice survives Procession persistence", () => {
  const restored = normalizeSavedProcession({
    version: 1,
    loop: false,
    steps: [{ id: "time-knife", mode: "slice", duration: 7.5 }],
  });
  assert.deepEqual(restored?.steps, [
    { id: "time-knife", mode: "slice", duration: 7.5 },
  ]);
});
