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

test("the mode oracle uses the five exact contracts", () => {
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
    },
  );
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

test("procession steps reorder without mutating the original chain", () => {
  const original = defaultProcession();
  const moved = moveProcessionStep(original, 2, 0);
  assert.deepEqual(moved.map((step) => step.mode), ["buffer", "transfer", "freeze"]);
  assert.deepEqual(original.map((step) => step.mode), ["transfer", "freeze", "buffer"]);
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
  assert.equal(shouldPrimeForMode("transfer", true, false, true, true), true);
  assert.equal(shouldPrimeForMode("self", false, true, true, true), true);
});
