import assert from "node:assert/strict";
import test from "node:test";
import { curveWindow } from "../lib/chain/curve-window";

const period = 403200;

test("nearby markers get a focused interval while keeping their exact elapsed times", () => {
  const now = 18 * 1200 + 24 * 20;
  const forecast = now + 10 * 20;
  const window = curveWindow(period, now, forecast);
  assert.equal(window.focused, true);
  assert.ok(window.start < now && forecast < window.end);
  assert.ok((forecast - now) / (window.end - window.start) >= 0.3);
  assert.equal(window.showSeconds, false);
});

test("the user can always restore the full decision period", () => {
  const window = curveWindow(period, 22080, 22280, "full");
  assert.equal(window.focused, false);
  assert.equal(window.start, 0);
  assert.equal(window.end, period);
});

test("well separated markers keep the overview by default", () => {
  assert.equal(curveWindow(period, period / 4, period * 0.9).focused, false);
  assert.equal(curveWindow(period, period / 4, period * 0.9, "focus").focused, true);
});

test("missing, coincident or expired forecasts do not produce an invalid zoom", () => {
  for (const forecast of [null, 1000, 999]) {
    const window = curveWindow(period, 1000, forecast, "focus");
    assert.equal(window.focused, false);
    assert.equal(window.canFocus, false);
    assert.ok(window.end > window.start);
  }
});

test("seconds distinguish markers near the final block", () => {
  const window = curveWindow(period, 1000, 1001);
  assert.equal(window.focused, true);
  assert.equal(window.showSeconds, true);
  assert.ok(window.start <= 1000 && window.end >= 1001);
  assert.ok((1001 - 1000) / (window.end - window.start) >= 0.1);
});

test("confirmation beyond the decision deadline stays visible in both views", () => {
  for (const view of ["auto", "full", "focus"] as const) {
    const window = curveWindow(period, period - 100, period + 200, view);
    assert.ok(window.start <= period - 100);
    assert.ok(window.end >= period + 200);
  }
});
