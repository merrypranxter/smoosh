import assert from "node:assert/strict";
import test from "node:test";

import { routeModeSources } from "../src/smoosh/engine/mode-contracts.ts";
import { MOSH_FRAG } from "../src/smoosh/engine/shaders.ts";
import {
  DEFAULT_LABYRINTH,
  DEFAULT_VORTEX,
  MODE_META,
} from "../src/smoosh/types.ts";

test("feedback labyrinth ships in a useful sweet spot", () => {
  assert.deepEqual(DEFAULT_LABYRINTH, { depth: 0.58, twist: 0.42, gate: 0.5 });
  assert.match(MODE_META.labyrinth.hint, /folds inward and echoes itself/);
  assert.match(MOSH_FRAG, /uLabyrinthMode == 1/);
  assert.match(MOSH_FRAG, /echoUvA/);
  assert.match(MOSH_FRAG, /echoUvC/);
});

test("curl vortex derives rotation from neighboring flow", () => {
  assert.deepEqual(DEFAULT_VORTEX, { swirl: 0.76, radius: 0.48, turbulence: 0.36 });
  assert.match(MODE_META.vortex.hint, /local whirlpools/);
  assert.match(MOSH_FRAG, /float curl = \(flowR\.y - flowL\.y\) - \(flowU\.x - flowD\.x\)/);
  assert.match(MOSH_FRAG, /rotate\(local, angle\)/);
  assert.doesNotMatch(MOSH_FRAG, /\b(?:float|int|bool|vec[234])\s+active\b/);
});

test("both new modes accept one source and prefer B as wind", () => {
  assert.deepEqual(routeModeSources("labyrinth", true, false), {
    pixels: "a", motion: "a", pixelsB: "a", effectiveMode: "labyrinth",
  });
  assert.deepEqual(routeModeSources("vortex", true, true), {
    pixels: "a", motion: "b", pixelsB: "b", effectiveMode: "vortex",
  });
});
