import assert from "node:assert/strict";
import test from "node:test";

import { routeModeSources } from "../src/smoosh/engine/mode-contracts.ts";
import { MOSH_FRAG } from "../src/smoosh/engine/shaders.ts";
import { DEFAULT_BIT_PLANE, MODE_META } from "../src/smoosh/types.ts";

test("Bit-Plane Cross-Splice starts in a recognizable but contaminated sweet spot", () => {
  assert.deepEqual(DEFAULT_BIT_PLANE, {
    bones: 0.78,
    graft: 0.72,
    parity: 0.64,
  });
  assert.equal(MODE_META.bitsplice.label, "BIT-PLANE CROSS-SPLICE");
  assert.match(MODE_META.bitsplice.hint, /middle bits/);
});

test("the shader preserves A high bits, grafts B middle bits, and XORs low bits", () => {
  assert.match(MOSH_FRAG, /uBitSpliceMode == 1/);
  assert.match(MOSH_FRAG, /bodyBytes & uvec3\(192u\)/);
  assert.match(MOSH_FRAG, /donorBytes & uvec3\(60u\)/);
  assert.match(MOSH_FRAG, /\(bodyBytes \^ donorBytes\) & uvec3\(3u\)/);
  assert.match(MOSH_FRAG, /memoryMask|memoryAmount/);
  assert.doesNotMatch(MOSH_FRAG, /\b(?:float|int|bool|vec[234])\s+active\b/);
});

test("bit-splice accepts one source and prefers B as donor and wind", () => {
  assert.deepEqual(routeModeSources("bitsplice", true, false), {
    pixels: "a",
    motion: "a",
    pixelsB: "a",
    effectiveMode: "bitsplice",
  });
  assert.deepEqual(routeModeSources("bitsplice", true, true), {
    pixels: "a",
    motion: "b",
    pixelsB: "b",
    effectiveMode: "bitsplice",
  });
});
