import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync("src/smoosh/ui/SmooshApp.tsx", "utf8");
const camera = readFileSync("src/smoosh/media/camera.ts", "utf8");
const demos = readFileSync("src/smoosh/media/demo-source.ts", "utf8");
const sources = readFileSync("src/smoosh/media/sources.ts", "utf8");
const recorder = readFileSync("src/smoosh/record/recorder.ts", "utf8");

test("webcam B is video-only, reports errors in-card, and keeps a CAM control", () => {
  assert.match(camera, /audio:\s*false/);
  assert.doesNotMatch(camera, /audio:\s*true/);
  assert.match(ui, /cameraLabel="CAM"/);
  assert.match(ui, /patchSlot\(id, \{ error: message \}\)/);
});

test("the local seed pack exposes exactly six generated seed identities", () => {
  const block = demos.match(/SEED_OPTIONS[\s\S]*?^\];/m)?.[0] ?? "";
  assert.equal([...block.matchAll(/label: "/g)].length, 6);
  for (const label of ["GRID", "MOTION", "FACE", "WATER", "TYPE", "FIRE"]) {
    assert.match(block, new RegExp(`label: "${label}"`));
  }
  assert.match(ui, /SEED_OPTIONS\.map/);
});

test("snapshot stays in-browser and compare remains outside the recorded canvas", () => {
  assert.match(sources, /canvas\.toBlob/);
  assert.match(sources, /new File\(\[blob\], "smoosh-snapshot\.png"/);
  assert.doesNotMatch(sources, /fetch\(|XMLHttpRequest|FormData/);
  assert.match(ui, /<CompareOverlay/);
  assert.match(recorder, /proto\.captureStream\(30\)/);
});

test("the recording sheet keeps a real iPhone save action above the preview", () => {
  const saveButton = ui.indexOf("SAVE / SHARE VIDEO");
  const preview = ui.indexOf('className="preview-video"');
  assert.ok(saveButton > 0 && saveButton < preview);
  assert.match(ui, /Choose SAVE VIDEO in the iPhone share sheet/);
  assert.match(recorder, /nav\.share\(\{ files: \[file\]/);
});

test("Job 5 organs remain while new visual modes join the rail", () => {
  const modes = ui.match(/const MODES:[\s\S]*?\];/)?.[0] ?? "";
  assert.equal([...modes.matchAll(/^\s*"[a-z]+",$/gm)].length, 14);
  for (const action of ["SNAP TO A", "COMPARE", "CAM", "SEEDS"]) {
    assert.match(ui, new RegExp(action));
  }
});
