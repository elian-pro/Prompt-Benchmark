/**
 * Unit tests for the chats DDL module (no network, no database).
 * Run with: node --test --experimental-strip-types lib/chats-admin.test.ts
 *
 * This used to stub `fetch` because creating a table went through the Supabase
 * Management API. It now goes over the pg driver, so the interesting surface
 * moved: the SQL itself, including the injection cases, is covered in
 * lib/chats-table-name.test.ts (buildCreateChatsTableSql). What is left here is
 * configuration handling, which is what decides whether the provisioning step
 * is offered at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { ChatsAdminError, createChatsTable, isChatsAdminConfigured } from "./chats-admin.ts";

function withoutConfig<T>(fn: () => T): T {
  const saved = process.env.CHATS_DB_PASSWORD;
  delete process.env.CHATS_DB_PASSWORD;
  try {
    return fn();
  } finally {
    if (saved !== undefined) process.env.CHATS_DB_PASSWORD = saved;
  }
}

test("isChatsAdminConfigured follows CHATS_DB_PASSWORD", () => {
  withoutConfig(() => {
    assert.equal(isChatsAdminConfigured(), false);
    process.env.CHATS_DB_PASSWORD = "x";
    assert.equal(isChatsAdminConfigured(), true);
    delete process.env.CHATS_DB_PASSWORD;
  });
});

test("createChatsTable fails with a ChatsAdminError when unconfigured", async () => {
  await withoutConfig(async () => {
    // Never opens a connection: the guard runs first, so this test needs no
    // database. The message is the one the UI shows.
    await assert.rejects(() => createChatsTable("Zebra QA"), (err: unknown) => {
      assert.ok(err instanceof ChatsAdminError);
      assert.match((err as Error).message, /CHATS_DB_PASSWORD/);
      return true;
    });
  });
});

test("an invalid schema name is refused before any connection is attempted", async () => {
  const saved = process.env.CHATS_DB_PASSWORD;
  process.env.CHATS_DB_PASSWORD = "x";
  try {
    // Not a ChatsAdminError: quoteIdent throws first, which is the point. If
    // this ever reached the pool the test would hang on a real connection.
    await assert.rejects(() => createChatsTable(" Zebra"), /Identificador no válido/);
  } finally {
    if (saved === undefined) delete process.env.CHATS_DB_PASSWORD;
    else process.env.CHATS_DB_PASSWORD = saved;
  }
});
