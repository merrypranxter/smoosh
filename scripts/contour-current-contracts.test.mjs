import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { routeModeSources } from "../src/smoosh/engine/mode-contracts.ts";
import { normalizeSavedProcession } from "../src/smoosh/procession.ts";
import { DEFAULT_CONTOUR_CURRENT, MODE_META } from "../src/smoosh/types.ts";

const shader = readFileSync("src/smoosh/engine/shaders.ts", "utf8");
const renderer = readFileSync("src/smoosh/engine/renderer.ts", "utf8");
const ui = readFileSync("src/smoosh/ui/SmooshApp.tsx", "utf8");

test("Contour Current opens at a useful edge-hugging sweet spot", () => {
  assert.deepEqual(DEFAULT_CONTOUR_CURRENT, {
    edgeGrip: 0.62,
    run: 0.5,
    bleed: 0.42,
  });
  assert.equal(MODE_META.contour.label, "CONTOUR CURRENT");
  assert.match(MODE_META.contour.hint, /B finds A's edges/);
});

test("a Sobel gradient projects guided flow onto A's contour tangent", () => {
  assert.match(shader, /if \(uContourMode == 1\)/);
  assert.match(
    shader,
    /\(lTR \+ 2\.0 \* lR \+ lBR\) - \(lTL \+ 2\.0 \* lL \+ lBL\)/,
  );
  assert.match(shader, /vec2 tangent = vec2\(-gradient\.y, gradient\.x\)/);
  assert.match(
    shader,
    /vec2 guidedFlow = dot\(flow, tangentDir\) \* tangentDir/,
  );
  assert.match(
    shader,
    /effectiveFlow = mix\(flow, guidedFlow, uEdgeGrip \* edgeMask\)/,
  );
  assert.match(shader, /texture\(uFeedback, oldUv\)\.rgb \* uPersist/);
  assert.doesNotMatch(shader, /\b(?:float|int|bool|vec[234])\s+active\b/);
  assert.match(renderer, /input\.mode === "contour"/);
});

test("Contour Current exposes only Edge Grip, Run, and Bleed", () => {
  assert.match(ui, /aria-label="Contour Current controls"/);
  assert.match(ui, /\["EDGE GRIP", "edgeGrip"\]/);
  assert.match(ui, /\["RUN", "run"\]/);
  assert.match(ui, /\["BLEED", "bleed"\]/);
  const section = ui.match(/function ContourControls\(\)[\s\S]*?\n}\n?$/)?.[0];
  assert.ok(section);
  assert.equal((section.match(/type="range"/g) ?? []).length, 1);
});

test("Contour Current accepts one source using its own flow and survives Procession", () => {
  assert.deepEqual(routeModeSources("contour", true, false), {
    pixels: "a",
    motion: "a",
    pixelsB: "a",
    effectiveMode: "contour",
  });
  assert.deepEqual(routeModeSources("contour", true, true), {
    pixels: "a",
    motion: "b",
    pixelsB: "b",
    effectiveMode: "contour",
  });
  assert.equal(
    normalizeSavedProcession({
      version: 1,
      loop: false,
      steps: [{ id: "vein", mode: "contour", duration: 4 }],
    })?.steps[0]?.mode,
    "contour",
  );
});
