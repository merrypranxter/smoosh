import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const recorder = read("src/smoosh/record/recorder.ts");
const ui = read("src/smoosh/ui/SmooshApp.tsx");

test("Audio Mosh extends the one existing recorder and records its mixed track", () => {
  assert.match(recorder, /class OutputRecorder/);
  assert.match(recorder, /createMediaStreamDestination\(\)/);
  assert.match(recorder, /this\.mixDest\?\.stream\.getAudioTracks\(\)/);
  assert.equal((recorder.match(/class OutputRecorder/g) ?? []).length, 1);
});

test("the live graph mixes two sources through gates, filters, echo, and a limiter", () => {
  for (const node of [
    "createGain",
    "createBiquadFilter",
    "createDelay",
    "createDynamicsCompressor",
  ]) {
    assert.match(recorder, new RegExp(`${node}\\(`));
  }
  assert.match(recorder, /this\.filterA\.connect\(this\.delay\)/);
  assert.match(recorder, /this\.filterB\.connect\(this\.delay\)/);
  assert.match(recorder, /this\.compressor\.connect\(this\.mixDest\)/);
  assert.match(recorder, /this\.compressor\.connect\(this\.monitor\)/);
});

test("the sweet spot keeps A forward and B ghosted while leaving controls editable", () => {
  assert.match(recorder, /aLevel: 0\.92/);
  assert.match(recorder, /bLevel: 0\.42/);
  assert.match(recorder, /stutter: 0\.46/);
  assert.match(recorder, /echo: 0\.34/);
  for (const label of ["A BODY", "B GHOST", "STUTTER", "ECHO"]) {
    assert.match(ui, new RegExp(label));
  }
  assert.match(ui, /SWEET SPOT/);
});

test("Touch Jump and hold-to-smear damage audio through the same live graph", () => {
  assert.match(ui, /punchJump\("output", frames\)/);
  assert.match(ui, /punchJump\(touchJumpTarget, frames\)/);
  assert.match(ui, /setSmear\(true\)/);
  assert.match(ui, /setSmear\(false\)/);
  assert.match(recorder, /target === "a"/);
  assert.match(recorder, /target === "b"/);
  assert.match(recorder, /cancelScheduledValues/);
  assert.match(recorder, /exponentialRampToValueAtTime/);
});

test("A, B, both, and silence are explicit and swapping can reuse media nodes", () => {
  for (const label of ["A ONLY", "B ONLY", "BOTH", "SILENT"]) {
    assert.match(ui, new RegExp(label));
  }
  assert.match(recorder, /WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>/);
  assert.match(recorder, /private nodeFor\(/);
  assert.match(ui, /if \(audioMosh\.enabled\) void bindCurrentAudio\(\)/);
});

test("Audio Mosh is an organ, not an eighth visual mode", () => {
  assert.match(ui, /AUDIO MOSH/);
  const modes = ui.match(/const MODES:[\s\S]*?\];/)?.[0] ?? "";
  assert.equal([...modes.matchAll(/^\s*"[a-z]+",$/gm)].length, 7);
});

