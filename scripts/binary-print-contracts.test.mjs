import assert from "node:assert/strict";
import test from "node:test";

import { routeModeSources } from "../src/smoosh/engine/mode-contracts.ts";
import { MOSH_FRAG } from "../src/smoosh/engine/shaders.ts";
import { DEFAULT_BINARY_PRINT, MODE_META } from "../src/smoosh/types.ts";

test("Binary Print Violence starts at an opinionated usable sweet spot", () => {
  assert.deepEqual(DEFAULT_BINARY_PRINT, {
    crush: 0.78,
    dotScale: 0.46,
    migration: 0.74,
  });
  assert.equal(MODE_META.print.label, "BINARY PRINT VIOLENCE");
  assert.match(MODE_META.print.hint, /printing matrix crawl/);
});

test("the print shader migrates a Bayer matrix with real optical flow", () => {
  assert.match(MOSH_FRAG, /float bayer4\(vec2 p\)/);
  assert.match(MOSH_FRAG, /uPrintMode == 1/);
  assert.match(MOSH_FRAG, /phaseShift = \(flow/);
  assert.match(MOSH_FRAG, /gl_FragCoord\.xy \/ dotPx \+ phaseShift/);
  assert.match(MOSH_FRAG, /oldPrint \*= uPersist/);
  assert.doesNotMatch(MOSH_FRAG, /\b(?:float|int|bool|vec[234])\s+active\b/);
});

test("print mode accepts one source and prefers B as wind", () => {
  assert.deepEqual(routeModeSources("print", true, false), {
    pixels: "a",
    motion: "a",
    pixelsB: "a",
    effectiveMode: "print",
  });
  assert.deepEqual(routeModeSources("print", true, true), {
    pixels: "a",
    motion: "b",
    pixelsB: "b",
    effectiveMode: "print",
  });
});
