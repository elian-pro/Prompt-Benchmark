/**
 * Unit tests for the schema-naming rules.
 * Run with: node --test --experimental-strip-types lib/chats-table-name.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCreateChatsTableSql,
  chatsTableName,
  isValidChatsTable,
  isLegacyChatsTable,
  quoteIdent,
} from "./chats-table-name.ts";
import { updateClientSchema } from "./schemas/clients.ts";

test("chatsTableName keeps the client name as written, accents and spaces included", () => {
  assert.equal(chatsTableName("Bad Boys Toys"), "Bad Boys Toys");
  assert.equal(chatsTableName("Sofía"), "Sofía");
  assert.equal(chatsTableName("SIW Copacker"), "SIW Copacker");
  assert.equal(chatsTableName("Verónica Lozano Hermosillo"), "Verónica Lozano Hermosillo");
});

test("chatsTableName trims and collapses whitespace", () => {
  assert.equal(chatsTableName("  Acalai  "), "Acalai");
  assert.equal(chatsTableName("Grupo   de  la Torre"), "Grupo de la Torre");
});

test("chatsTableName returns null when nothing usable survives", () => {
  assert.equal(chatsTableName("   "), null);
  assert.equal(chatsTableName(""), null);
});

test("chatsTableName returns null past the 63-byte identifier limit", () => {
  // Accented characters are two bytes, so 40 of them exceed the limit while
  // being only 40 characters long: the check has to be on bytes.
  assert.equal(chatsTableName("á".repeat(40)), null);
  assert.equal(chatsTableName("a".repeat(63)), "a".repeat(63));
  assert.equal(chatsTableName("a".repeat(64)), null);
});

test("isValidChatsTable rejects control characters and non-strings", () => {
  assert.equal(isValidChatsTable("Cliente\u0000"), false);
  assert.equal(isValidChatsTable("Cliente\n"), false);
  assert.equal(isValidChatsTable(" Cliente"), false);
  assert.equal(isValidChatsTable(null), false);
  assert.equal(isValidChatsTable(123), false);
});

test("every suggested name is a valid identifier", () => {
  for (const name of ["Bad Boys Toys", "Sofía", "O'Brien & Co.", "3M Latam", "Ramón Losa"]) {
    assert.ok(isValidChatsTable(chatsTableName(name)!), name);
  }
});

test("quoteIdent doubles inner quotes, which is what defuses injection", () => {
  assert.equal(quoteIdent("Sofía"), '"Sofía"');
  assert.equal(quoteIdent('a"; drop schema x; --'), '"a""; drop schema x; --"');
});

test("isLegacyChatsTable spots a value migration 029 did not remap", () => {
  assert.equal(isLegacyChatsTable("chats_Sofia"), true);
  assert.equal(isLegacyChatsTable("Sofía"), false);
});

test("buildCreateChatsTableSql emits the schema, the table and the grants", () => {
  const sql = buildCreateChatsTableSql("Zebra QA");
  assert.match(sql, /create schema if not exists "Zebra QA"/);
  assert.match(sql, /create table if not exists "Zebra QA"\.chats/);
  for (const col of ["id", "created_at", "numero_de_mensajes", "id_de_kommo", "historial", "turnos"]) {
    assert.ok(sql.includes(col), col);
  }
  assert.match(sql, /create index if not exists chats_kommo_idx/);
  assert.match(sql, /grant select, insert, update on "Zebra QA"\.chats to n8n_writer/);
});

test("buildCreateChatsTableSql neutralizes a quote-breaking name", () => {
  // The dangerous input does not throw (it is a legal identifier) but comes out
  // as ONE quoted identifier, so the injected statement never executes.
  const sql = buildCreateChatsTableSql('X"; drop schema "Sofía"; --');
  assert.match(sql, /create schema if not exists "X""; drop schema ""Sofía""; --"/);
  assert.ok(!/drop schema "Sofía";/.test(sql));
});

test("buildCreateChatsTableSql rejects what quoting cannot save", () => {
  assert.throws(() => buildCreateChatsTableSql("Zebra\u0000QA"));
  assert.throws(() => buildCreateChatsTableSql("Zebra\nQA"));
  assert.throws(() => buildCreateChatsTableSql(" Zebra"));
  assert.throws(() => buildCreateChatsTableSql(""));
  assert.throws(() => buildCreateChatsTableSql("á".repeat(40)));
});

test("a client name matches an existing schema regardless of case or accents", () => {
  // The Arkai case: the client already had a schema with its 12 reporting
  // tables, provisioning used the client's own spelling, and a second schema
  // appeared next to it differing only in capitalization.
  const enBase = ["Arkai", "Grupo Tactical", "Sofía", "Bad Boys Toys"];
  const norm = (v: string) =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const casa = (cliente: string) => enBase.filter((e) => norm(e) === norm(cliente));

  assert.deepEqual(casa("ARKAI"), ["Arkai"]);
  assert.deepEqual(casa("arkai"), ["Arkai"]);
  assert.deepEqual(casa("GRUPO TACTICAL"), ["Grupo Tactical"]);
  assert.deepEqual(casa("Sofia"), ["Sofía"]);
  assert.deepEqual(casa("Cliente Nuevo"), []);
});

test("the update schema accepts a real schema name, not just the legacy chats_*", () => {
  // The bug: connecting "Samuel Maya" answered 400 "Nombre de tabla de
  // historial no válido." because the Zod field still carried the pre-migration
  // /^chats_[A-Za-z0-9_]+$/, which no schema name can match.
  const ok = (v: unknown) => updateClientSchema.safeParse({ chats_table: v }).success;
  assert.equal(ok("Samuel Maya"), true);
  assert.equal(ok("Sofía"), true);
  assert.equal(ok("chats_BadBoysToys"), true); // legacy values still parse
  assert.equal(ok(null), true); // disconnecting
  assert.equal(ok("a".repeat(64)), false); // past the identifier limit
  assert.equal(ok("mal\u0000nombre"), false);
});
