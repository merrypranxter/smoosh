import assert from "node:assert/strict";
import test from "node:test";

import {
  bufferPersistence,
  crossBalanceForWeather,
  needsSourceForMode,
  routeModeSources,
} from "../src/smoosh/engine/mode-contracts.ts";
import { MODE_META } from "../src/smoosh/types.ts";

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
