import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { routeModeSources } from "../src/smoosh/engine/mode-contracts.ts";
import { MOSH_FRAG } from "../src/smoosh/engine/shaders.ts";
import { normalizeSavedProcession } from "../src/smoosh/procession.ts";
import { DEFAULT_FLOW_SORT, MODE_META } from "../src/smoosh/types.ts";

const ui = readFileSync(
  new URL("../src/smoosh/ui/SmooshApp.tsx", import.meta.url),
  "utf8",
);

test("Flow-Sort Advection starts at a useful motion-combing sweet spot", () => {
  assert.deepEqual(DEFAULT_FLOW_SORT, {
    trigger: 0.58,
    length: 0.72,
    polarity: 0.62,
  });
  assert.equal(MODE_META.flowsort.label, "FLOW-SORT ADVECTION");
  assert.match(MODE_META.flowsort.hint, /combs A along its motion/);
});

test("the shader ranks source samples along locally changing optical flow", () => {
  assert.match(MOSH_FRAG, /uFlowSortMode == 1/);
  assert.match(
    MOSH_FRAG,
    /for \(int sortIndex = 0; sortIndex < 9; sortIndex\+\+\)/,
  );
  assert.match(
    MOSH_FRAG,
    /localFlow = decodeFlow\(texture\(uFlow, initialProbe\)/,
  );
  assert.match(MOSH_FRAG, /candidateDistance < chosenDistance/);
  assert.match(
    MOSH_FRAG,
    /oldSorted = texture\(uFeedback, oldUv\)\.rgb \* uPersist/,
  );
  assert.doesNotMatch(MOSH_FRAG, /\b(?:float|int|bool|vec[234])\s+active\b/);
});

test("Flow-Sort has exactly Trigger, Length, and Polarity controls", () => {
  assert.match(ui, /function FlowSortControls/);
  for (const label of ["TRIGGER", "LENGTH", "POLARITY"]) {
    assert.match(ui, new RegExp(label));
  }
  assert.match(ui, /store\.mode === "flowsort" && <FlowSortControls/);
});

test("Flow-Sort accepts one source, prefers B wind, and survives Procession", () => {
  assert.deepEqual(routeModeSources("flowsort", true, false), {
    pixels: "a",
    motion: "a",
    pixelsB: "a",
    effectiveMode: "flowsort",
  });
  assert.deepEqual(routeModeSources("flowsort", true, true), {
    pixels: "a",
    motion: "b",
    pixelsB: "b",
    effectiveMode: "flowsort",
  });
  assert.equal(
    normalizeSavedProcession({
      version: 1,
      loop: true,
      steps: [{ id: "comb", mode: "flowsort", duration: 4 }],
    })?.steps[0]?.mode,
    "flowsort",
  );
});
