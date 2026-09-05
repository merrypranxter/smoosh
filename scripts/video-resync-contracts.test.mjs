import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = readFileSync("src/smoosh/media/sources.ts", "utf8");
const engine = readFileSync("src/smoosh/engine/engine.ts", "utf8");

test("a paused-without-permission video is nudged back into playing every tick", () => {
  assert.match(sources, /resyncPlayback\(id: SlotId, shouldPlay: boolean\)/);
  assert.match(sources, /if \(!shouldPlay\) return;/);
  assert.match(
    sources,
    /slot\.kind !== "video" && slot\.kind !== "camera"\) return;/,
  );
  assert.match(sources, /v\.paused &&\s*\n\s*!v\.ended/);
  assert.match(sources, /v\.readyState >= HTMLMediaElement\.HAVE_CURRENT_DATA/);
});

test("the engine calls resyncPlayback for both slots every tick", () => {
  assert.match(
    engine,
    /this\.hub\.resyncPlayback\("a", s\.playing && !s\.slotA\.paused\)/,
  );
  assert.match(
    engine,
    /this\.hub\.resyncPlayback\("b", s\.playing && !s\.slotB\.paused\)/,
  );
});
