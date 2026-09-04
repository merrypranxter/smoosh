import assert from "node:assert/strict";
import test from "node:test";

import {
  bufferPersistence,
  crossBalanceForWeather,
  needsSourceForMode,
  routeModeSources,
} from "../src/smoosh/engine/mode-contracts.ts";
import { MODE_META } from "../src/smoosh/types.ts";
import {
  clampProcessionDuration,
  defaultProcession,
  moveProcessionStep,
  nextProcessionIndex,
  normalizeSavedProcession,
  shouldPrimeForMode,
} from "../src/smoosh/procession.ts";
import { MOSH_FRAG } from "../src/smoosh/engine/shaders.ts";

test("the mode oracle uses exactly nine contracts", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(MODE_META).map(([mode, meta]) => [mode, meta.hint]),
    ),
    {
      transfer: "A supplies the pixels. B supplies the wind. Both stay live.",
      cross: "They infect each other. Watch the handoff.",
      freeze: "A is the corpse. B is the disease. Don't pause the disease.",
      self: "One source is paint and wind. Feed it anything.",
      buffer: "Stop reading new frames. Keep dragging the sludge.",
      hold: "Keep the body. Keep applying new wind. This is the keyframe murder.",
      chroma:
        "Red, green, and blue catch different winds. Registration is a lie.",
      macro:
        "A steals rectangular chunks from B and its own past. The blocks remember.",
      slice: "Each strip lives at a different moment. Drag time sideways.",
    },
  );
  assert.equal(Object.keys(MODE_META).length, 9);
});

test("moving transfer and cross route A pixels against B motion", () => {
  assert.deepEqual(routeModeSources("transfer", true, true), {
    pixels: "a",
    motion: "b",
    pixelsB: "b",
    effectiveMode: "transfer",
  });
  assert.deepEqual(routeModeSources("cross", true, true), {
    pixels: "a",
    motion: "b",
    pixelsB: "b",
    effectiveMode: "cross",
  });
});

test("cross falls back to self and self prefers A, then B", () => {
  assert.equal(routeModeSources("cross", true, false).effectiveMode, "self");
  assert.equal(routeModeSources("cross", false, true).pixels, "b");
  assert.deepEqual(routeModeSources("self", true, true), {
    pixels: "a",
    motion: "a",
    pixelsB: "a",
    effectiveMode: "self",
  });
  assert.equal(routeModeSources("self", false, true).motion, "b");
});

test("cross weather visibly favors the advertised direction", () => {
  assert.equal(crossBalanceForWeather(0.5, "b"), 0.12);
  assert.equal(crossBalanceForWeather(0.5, "a"), 0.88);
});

test("buffer decay is frame-normalized and remains user-controlled", () => {
  const lowDecay = bufferPersistence(0.995);
  const defaultDecay = bufferPersistence(0.92);
  const highDecay = bufferPersistence(0.2);
  assert.ok(lowDecay > defaultDecay);
  assert.ok(defaultDecay > highDecay);
  assert.ok(lowDecay > 0.999);
  assert.ok(highDecay < 0.9);
});

test("source requirements match the one-source fallbacks", () => {
  assert.equal(needsSourceForMode("self", true, false, false), false);
  assert.equal(needsSourceForMode("self", false, true, false), false);
  assert.equal(needsSourceForMode("cross", true, false, true), true);
  assert.equal(needsSourceForMode("transfer", true, false, true), true);
  assert.equal(needsSourceForMode("buffer", false, false, true), false);
  assert.equal(needsSourceForMode("hold", true, false, false), false);
  assert.equal(needsSourceForMode("chroma", false, true, false), false);
  assert.equal(needsSourceForMode("macro", true, false, false), false);
  assert.equal(needsSourceForMode("slice", false, true, false), false);
  assert.equal(needsSourceForMode("hold", false, false, true), true);
});

test("one-source modes prefer B motion but fall back to a solo source", () => {
  assert.deepEqual(routeModeSources("hold", true, true), {
    pixels: "a",
    motion: "b",
    pixelsB: "b",
    effectiveMode: "hold",
  });
  assert.deepEqual(routeModeSources("hold", true, false), {
    pixels: "a",
    motion: "a",
    pixelsB: "a",
    effectiveMode: "hold",
  });
  assert.deepEqual(routeModeSources("chroma", false, true), {
    pixels: "b",
    motion: "b",
    pixelsB: "b",
    effectiveMode: "chroma",
  });
  assert.deepEqual(routeModeSources("macro", true, true), {
    pixels: "a",
    motion: "b",
    pixelsB: "b",
    effectiveMode: "macro",
  });
  assert.deepEqual(routeModeSources("macro", true, false), {
    pixels: "a",
    motion: "a",
    pixelsB: "a",
    effectiveMode: "macro",
  });
  assert.deepEqual(routeModeSources("slice", true, true), {
    pixels: "a",
    motion: "b",
    pixelsB: "b",
    effectiveMode: "slice",
  });
  assert.deepEqual(routeModeSources("slice", false, true), {
    pixels: "b",
    motion: "b",
    pixelsB: "b",
    effectiveMode: "slice",
  });
});

test("chroma flow uses one field with visibly separated RGB scales", () => {
  assert.match(MOSH_FRAG, /flow \* 1\.35/);
  assert.match(MOSH_FRAG, /base - flow \+ tear/);
  assert.match(MOSH_FRAG, /flow \* 0\.65/);
  assert.match(MOSH_FRAG, /uChromaMode == 1/);
});

test("procession starts with the requested three-step possession", () => {
  assert.deepEqual(
    defaultProcession().map(({ mode, duration }) => ({ mode, duration })),
    [
      { mode: "transfer", duration: 4 },
      { mode: "freeze", duration: 3 },
      { mode: "buffer", duration: 5 },
    ],
  );
});

test("procession restore clamps durations and caps the chain at eight", () => {
  const restored = normalizeSavedProcession({
    version: 1,
    loop: true,
    steps: Array.from({ length: 10 }, (_, index) => ({
      id: `saved-${index}`,
      mode: index === 0 ? "self" : "transfer",
      duration: index === 0 ? 99 : 0.1,
    })),
  });
  assert.equal(restored?.steps.length, 8);
  assert.equal(restored?.steps[0]?.duration, 30);
  assert.equal(restored?.steps[1]?.duration, 0.5);
  assert.equal(restored?.loop, true);
  assert.equal(clampProcessionDuration(4.24), 4);
  assert.equal(clampProcessionDuration(4.26), 4.5);
});

test("procession restores added modes without accepting unknown modes", () => {
  const restored = normalizeSavedProcession({
    version: 1,
    loop: false,
    steps: [
      { id: "hold", mode: "hold", duration: 2 },
      { id: "chroma", mode: "chroma", duration: 3 },
      { id: "macro", mode: "macro", duration: 2.5 },
      { id: "slice", mode: "slice", duration: 4.5 },
      { id: "nope", mode: "dice", duration: 4 },
    ],
  });
  assert.deepEqual(
    restored?.steps.map((step) => step.mode),
    ["hold", "chroma", "macro", "slice"],
  );
});

test("procession steps reorder without mutating the original chain", () => {
  const original = defaultProcession();
  const moved = moveProcessionStep(original, 2, 0);
  assert.deepEqual(
    moved.map((step) => step.mode),
    ["buffer", "transfer", "freeze"],
  );
  assert.deepEqual(
    original.map((step) => step.mode),
    ["transfer", "freeze", "buffer"],
  );
});

test("procession advances, loops, and holds on the last step", () => {
  assert.equal(nextProcessionIndex(0, 3, false), 1);
  assert.equal(nextProcessionIndex(2, 3, true), 0);
  assert.equal(nextProcessionIndex(2, 3, false), null);
});

test("procession mode changes preserve a primed feedback buffer", () => {
  assert.equal(shouldPrimeForMode("self", true, true, true, true), false);
  assert.equal(shouldPrimeForMode("freeze", true, true, true, true), false);
  assert.equal(shouldPrimeForMode("buffer", true, true, true, true), false);
  assert.equal(shouldPrimeForMode("hold", true, true, true, true), false);
  assert.equal(shouldPrimeForMode("chroma", true, true, true, true), false);
  assert.equal(shouldPrimeForMode("macro", true, true, true, true), false);
  assert.equal(shouldPrimeForMode("slice", true, true, true, true), false);
  assert.equal(shouldPrimeForMode("transfer", true, false, true, true), true);
  assert.equal(shouldPrimeForMode("self", false, true, true, true), true);
});
