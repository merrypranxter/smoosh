import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const types = read("src/smoosh/types.ts");
const store = read("src/smoosh/state/store.ts");
const engine = read("src/smoosh/engine/engine.ts");
const renderer = read("src/smoosh/engine/renderer.ts");
const shaders = read("src/smoosh/engine/shaders.ts");
const ui = read("src/smoosh/ui/SmooshApp.tsx");

test("Color Feed adds treatments without inventing an eighth mosh mode", () => {
  assert.match(types, /type ColorEffect =/);
  assert.match(types, /"false-color"/);
  assert.match(ui, /COLOR FEED/);
  assert.match(ui, /COLOR_EFFECT_META/);
  assert.doesNotMatch(types, /\| "color"/);
  assert.match(ui, /const MODES: SmooshMode\[\] = \[/);
});

test("BODY, WIND, and OUTPUT are real shader routes", () => {
  assert.match(types, /type ColorRoute = "body" \| "wind" \| "output"/);
  assert.match(renderer, /color\.route === "body"/);
  assert.match(renderer, /color\.route === "wind"/);
  assert.match(renderer, /color\.route === "output"/);
  assert.match(engine, /color: s\.color/);
});

test("all six treatments and three user knobs reach GLSL uniforms", () => {
  for (const effect of [
    "clean",
    "mono",
    "invert",
    "posterize",
    "solarize",
    "false-color",
  ]) {
    assert.match(types, new RegExp(`(?:\\"|^)${effect}(?:\\"|:)`));
  }
  for (const uniform of [
    "uColorEffect",
    "uColorSaturation",
    "uColorVibrance",
    "uColorSharpness",
  ]) {
    assert.match(shaders, new RegExp(uniform));
    assert.match(renderer, new RegExp(uniform));
  }
});

test("treatments begin at deliberate sweet spots but remain editable", () => {
  assert.match(ui, /SWEET SPOT/);
  assert.match(ui, /aria-label="Color Feed saturation"/);
  assert.match(ui, /aria-label="Color Feed vibrance"/);
  assert.match(ui, /aria-label="Color Feed sharpness"/);
  assert.match(store, /saturation: Math\.min/);
  assert.match(store, /vibrance: Math\.min/);
  assert.match(store, /sharpness: Math\.min/);
});

test("OUTPUT Color Feed stays in the recorded presentation path", () => {
  assert.match(
    renderer,
    /this\.present\(present, input\.symmetry, input\.color\)/,
  );
  assert.match(renderer, /color\.enabled && color\.route === "output"/);
  assert.match(
    renderer,
    /this\.setColorUniforms\(this\.blitProg, undefined, false\)/,
  );
});
