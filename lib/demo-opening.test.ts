/**
 * Run with: node --test --experimental-strip-types lib/demo-opening.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { openingSyncAction } from "./demo-opening.ts";

const greeting = { role: "bot", turn_number: 1 } as const;
const lead = { role: "human", turn_number: 2 } as const;

test("a conversation nobody wrote in yet shows the edited greeting", () => {
  assert.equal(openingSyncAction([], "Hola"), "insert");
  assert.equal(openingSyncAction([greeting], "Hola"), "update");
  assert.equal(openingSyncAction([greeting], null), "delete");
  assert.equal(openingSyncAction([], null), "keep");
});

test("once the visitor wrote, the greeting they answered to stays as it was", () => {
  assert.equal(openingSyncAction([greeting, lead], "Otro saludo"), "keep");
  assert.equal(openingSyncAction([{ role: "human", turn_number: 1 }], "Hola"), "keep");
});
