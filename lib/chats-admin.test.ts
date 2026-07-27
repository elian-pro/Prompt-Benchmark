/**
 * Unit tests for the chats Management API client (fetch stubbed, no network).
 * Run with: node --test --experimental-strip-types lib/chats-admin.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { ChatsAdminError, createChatsTable, isChatsAdminConfigured } from "./chats-admin.ts";

function withEnv(fn: () => Promise<void>): Promise<void> {
  process.env.SUPABASE_ACCESS_TOKEN = "sbp_test";
  process.env.CHATS_SUPABASE_PROJECT_REF = "refabc";
  return fn().finally(() => {
    delete process.env.SUPABASE_ACCESS_TOKEN;
    delete process.env.CHATS_SUPABASE_PROJECT_REF;
  });
}

function stubFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, restore: () => void (globalThis.fetch = original) };
}

test("isChatsAdminConfigured needs both env vars", () => {
  delete process.env.SUPABASE_ACCESS_TOKEN;
  delete process.env.CHATS_SUPABASE_PROJECT_REF;
  assert.equal(isChatsAdminConfigured(), false);
  process.env.SUPABASE_ACCESS_TOKEN = "sbp_test";
  assert.equal(isChatsAdminConfigured(), false);
  process.env.CHATS_SUPABASE_PROJECT_REF = "refabc";
  assert.equal(isChatsAdminConfigured(), true);
  delete process.env.SUPABASE_ACCESS_TOKEN;
  delete process.env.CHATS_SUPABASE_PROJECT_REF;
});

test("createChatsTable posts the fixed DDL to the configured project", () =>
  withEnv(async () => {
    const { calls, restore } = stubFetch(201, {});
    try {
      await createChatsTable("chats_ZebraQA");
    } finally {
      restore();
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.supabase.com/v1/projects/refabc/database/query");
    assert.equal(calls[0].init.method, "POST");
    const sent = JSON.parse(calls[0].init.body as string);
    assert.match(sent.query, /create table if not exists public\."chats_ZebraQA"/);
  }));

test("createChatsTable never sends SQL for an invalid table name", () =>
  withEnv(async () => {
    const { calls, restore } = stubFetch(201, {});
    try {
      await assert.rejects(() => createChatsTable('chats_X"; drop table "chats_Acalai'));
    } finally {
      restore();
    }
    assert.equal(calls.length, 0, "the request must be refused before reaching fetch");
  }));

test("createChatsTable maps a rejected token to a readable error", () =>
  withEnv(async () => {
    const { restore } = stubFetch(401, { message: "Invalid token" });
    try {
      await assert.rejects(() => createChatsTable("chats_ZebraQA"), (err: unknown) => {
        assert.ok(err instanceof ChatsAdminError);
        assert.equal((err as ChatsAdminError).status, 401);
        assert.match((err as Error).message, /token/i);
        return true;
      });
    } finally {
      restore();
    }
  }));

test("createChatsTable explains that it is not configured", async () => {
  delete process.env.SUPABASE_ACCESS_TOKEN;
  delete process.env.CHATS_SUPABASE_PROJECT_REF;
  await assert.rejects(() => createChatsTable("chats_ZebraQA"), /no está configurada/);
});
