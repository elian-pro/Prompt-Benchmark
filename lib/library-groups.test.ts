/**
 * Run with: node --test --experimental-strip-types lib/library-groups.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { groupByAccount } from "./library-groups.ts";

const c = (name: string, account: string | null = null) => ({ name, account });

test("an account's block sits where its first client falls, members in order", () => {
  const blocks = groupByAccount([
    c("Londres 107"),
    c("Badell Law Mail", "Badell Law"),
    c("Chapur"),
    c("Badell Law", "Badell Law"),
  ]);
  assert.deepEqual(blocks, [
    { kind: "client", client: c("Londres 107") },
    {
      kind: "account",
      name: "Badell Law",
      clients: [c("Badell Law Mail", "Badell Law"), c("Badell Law", "Badell Law")],
    },
    { kind: "client", client: c("Chapur") },
  ]);
});

test("the same account typed differently is still one group", () => {
  const blocks = groupByAccount([c("A", "Badell Law"), c("B", " badell law ")]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind === "account" && blocks[0].clients.length, 2);
});

test("a blank account is no account", () => {
  assert.deepEqual(groupByAccount([c("A", "  ")]), [{ kind: "client", client: c("A", "  ") }]);
});
