import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shaders = readFileSync("src/smoosh/engine/shaders.ts", "utf8");
const renderer = readFileSync("src/smoosh/engine/renderer.ts", "utf8");
const store = readFileSync("src/smoosh/state/store.ts", "utf8");
const types = readFileSync("src/smoosh/types.ts", "utf8");
const ui = readFileSync("src/smoosh/ui/SmooshApp.tsx", "utf8");

test("symmetry remains a recorded modifier while the mode rail grows", () => {
  assert.match(
    renderer,
    /this\.present\(present, input\.symmetry, input\.color\)/,
  );
  assert.match(renderer, /uSymmetryEnabled, symmetry\.enabled \? 1 : 0/);
  assert.match(renderer, /uSymmetryEnabled, 0/);
  const modes = ui.match(/const MODES:[\s\S]*?\];/)?.[0] ?? "";
  assert.equal([...modes.matchAll(/^\s*"[a-z]+",$/gm)].length, 14);
});

test("the bilateral shader can reflect from either movable side", () => {
  assert.match(shaders, /uSymmetrySide == 0 && uv\.x > uSymmetryAxis/);
  assert.match(shaders, /uSymmetrySide == 1 && uv\.x < uSymmetryAxis/);
  assert.match(shaders, /2\.0 \* uSymmetryAxis - uv\.x/);
});

test("symmetry starts centered and the axis is kept thumb-usable", () => {
  assert.match(types, /axis: 0\.5/);
  assert.match(store, /Math\.min\(0\.88, Math\.max\(0\.12/);
  assert.match(ui, /aria-label="Symmetry axis position"/);
  assert.match(ui, /Move symmetry axis/);
  assert.match(ui, /Reset symmetry axis to center/);
});
