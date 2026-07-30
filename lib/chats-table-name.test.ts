import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCreateChatsTableSql, chatsTableName, isValidChatsTable } from "./chats-table-name.ts";

test("chatsTableName drops spaces and keeps capitalization", () => {
  assert.equal(chatsTableName("Bad Boys Toys"), "chats_BadBoysToys");
  assert.equal(chatsTableName("SIW Copackers"), "chats_SIWCopackers");
  assert.equal(chatsTableName("Acalai"), "chats_Acalai");
});

test("chatsTableName strips accents and punctuation", () => {
  assert.equal(chatsTableName("Acalái"), "chats_Acalai");
  assert.equal(chatsTableName("Café Ñoño"), "chats_CafeNono");
  assert.equal(chatsTableName("O'Brien & Co."), "chats_OBrienCo");
  assert.equal(chatsTableName("Vero-Lozano"), "chats_VeroLozano");
});

test("chatsTableName keeps a leading digit (the prefix carries the identifier)", () => {
  assert.equal(chatsTableName("3M Latam"), "chats_3MLatam");
});

test("chatsTableName returns null when nothing survives", () => {
  assert.equal(chatsTableName("!!!"), null);
  assert.equal(chatsTableName("   "), null);
  assert.equal(chatsTableName(""), null);
});

test("every suggested name is a valid table name", () => {
  for (const name of ["Bad Boys Toys", "Acalái", "O'Brien & Co.", "3M Latam", "Ramón Losa"]) {
    assert.ok(isValidChatsTable(chatsTableName(name)!), name);
  }
});

test("buildCreateChatsTableSql emits the six columns and RLS", () => {
  const sql = buildCreateChatsTableSql("chats_ZebraQA");
  assert.match(sql, /create table if not exists public\."chats_ZebraQA"/);
  assert.match(sql, /turnos jsonb/);
  for (const col of ["id", "created_at", "numero_de_mensajes", "id_de_kommo", "historial"]) {
    assert.ok(sql.includes(col), col);
  }
  assert.match(sql, /enable row level security/);
  assert.match(sql, /notify pgrst/);
});

test("buildCreateChatsTableSql rejects anything that is not a chats_ table", () => {
  assert.throws(() => buildCreateChatsTableSql('chats_X"; drop table "chats_Acalai'));
  assert.throws(() => buildCreateChatsTableSql("clients"));
  assert.throws(() => buildCreateChatsTableSql("chats_"));
  assert.throws(() => buildCreateChatsTableSql("chats_Zebra QA"));
});
