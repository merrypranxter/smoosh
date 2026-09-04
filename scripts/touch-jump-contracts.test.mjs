import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ui = read("src/smoosh/ui/SmooshApp.tsx");
const engine = read("src/smoosh/engine/engine.ts");
const ring = read("src/smoosh/engine/frame-ring.ts");
const renderer = read("src/smoosh/engine/renderer.ts");
const sources = read("src/smoosh/media/sources.ts");
const demos = read("src/smoosh/media/demo-source.ts");

test("Touch Jump routes A, B, both, and the output loop without adding a mosh mode", () => {
  for (const label of ["A · BODY", "B · WIND", "BOTH", "OUTPUT LOOP"]) {
    assert.match(ui, new RegExp(label.replace("·", "·")));
  }
  const modes = ui.match(/const MODES:[\s\S]*?\];/)?.[0] ?? "";
  assert.equal([...modes.matchAll(/^\s*"[a-z]+",$/gm)].length, 11);
});

test("the preview maps backward and forward zones to the promised frame jumps", () => {
  assert.match(ui, /const leftSteps = \[10, 20, 30, 40, 50\]/);
  assert.match(ui, /const rightSteps = \[20, 30, 40, 50\]/);
  assert.match(ui, /x < 0\.5/);
  assert.match(ui, /LEFT = BACK · RIGHT = FORWARD · LOWER = FARTHER/);
  assert.match(ui, /setPointerCapture/);
  assert.match(ui, /setInterval[\s\S]*220/);
  assert.match(ui, /setTimeout[\s\S]*340/);
});

test("video and generated demo sources can jump without forcing a buffer reset", () => {
  assert.match(sources, /jumpFrames\(/);
  assert.match(sources, /video\.currentTime = next/);
  assert.match(sources, /opts\.loop/);
  assert.match(demos, /jump\(seconds: number\)/);
  assert.match(ui, /forcePrime: !engine\.primed/);
  assert.doesNotMatch(
    ui.match(/function performTouchJump[\s\S]*?function engageMode/)?.[0] ?? "",
    /ignite\(\)/,
  );
});

test("output loop keeps a 50-frame canvas history and can be explicitly released", () => {
  assert.match(engine, /new FrameRing\(50, 240, 426\)/);
  assert.match(engine, /startOutputLoop\(/);
  assert.match(engine, /stopOutputLoop\(/);
  assert.match(engine, /1 \/ 30/);
  assert.match(ring, /Math\.min\(60, max\)/);
  assert.match(ring, /setWindowSize\(/);
  assert.match(renderer, /presentExternal\(/);
  assert.match(ui, /RELEASE LOOP/);
});

test("Touch Jump yields the canvas gesture surface to Compare and Symmetry", () => {
  assert.match(ui, /compare && !touchJump/);
  assert.match(ui, /store\.symmetry\.enabled && !compare && !touchJump/);
  assert.match(ui, /if \(enabled\) setCompare\(false\)/);
  assert.match(ui, /else releaseOutputLoop\(\)/);
});
