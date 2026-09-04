import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MOSH_FRAG } from "../src/smoosh/engine/shaders.ts";
import { DEFAULT_MACRO, MODE_META } from "../src/smoosh/types.ts";
import { normalizeSavedProcession } from "../src/smoosh/procession.ts";

const ui = readFileSync(
  new URL("../src/smoosh/ui/SmooshApp.tsx", import.meta.url),
  "utf8",
);
const renderer = readFileSync(
  new URL("../src/smoosh/engine/renderer.ts", import.meta.url),
  "utf8",
);

test("Macroblock Theft ships with an opinionated sweet spot and oracle", () => {
  assert.deepEqual(DEFAULT_MACRO, {
    blockSize: 24,
    theft: 0.58,
    memory: 0.72,
  });
  assert.equal(MODE_META.macro.label, "MACROBLOCK THEFT");
  assert.equal(
    MODE_META.macro.hint,
    "A steals rectangular chunks from B and its own past. The blocks remember.",
  );
});

test("the shader steals persistent rectangular cells from donor and history", () => {
  assert.match(MOSH_FRAG, /uMacroMode == 1/);
  assert.match(MOSH_FRAG, /floor\(vUv \/ blockUv\)/);
  assert.match(MOSH_FRAG, /uniform sampler2D uDonor/);
  assert.match(MOSH_FRAG, /stolenPast/);
  assert.match(MOSH_FRAG, /stolenDonor/);
  assert.match(MOSH_FRAG, /uMacroMemory/);
  assert.match(
    renderer,
    /input\.mode === "cross" \|\|[\s\S]*?input\.mode === "macro"/,
  );
});

test("the mobile-first mode UI exposes exactly three macro controls", () => {
  assert.match(ui, /function MacroblockControls/);
  assert.match(ui, /BLOCK SIZE/);
  assert.match(ui, /THEFT/);
  assert.match(ui, /MEMORY/);
  assert.match(ui, /SWEET SPOT/);
  assert.match(ui, /store\.mode === "macro" && <MacroblockControls/);
});

test("Macroblock Theft survives Procession save and restore", () => {
  const restored = normalizeSavedProcession({
    version: 1,
    loop: true,
    steps: [{ id: "crime", mode: "macro", duration: 6.5 }],
  });
  assert.deepEqual(restored?.steps, [
    { id: "crime", mode: "macro", duration: 6.5 },
  ]);
});
