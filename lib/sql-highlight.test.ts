/**
 * Unit tests for tokenizeSql.
 * Run with: node --test --experimental-strip-types lib/sql-highlight.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { tokenizeSql } from "./sql-highlight.ts";
import { buildCreateChatsTableSql } from "./chats-table-name.ts";

const kindOf = (sql: string, text: string) =>
  tokenizeSql(sql).find((t) => t.text === text)?.kind;

test("what is shown is exactly what is copied", () => {
  const sql = buildCreateChatsTableSql("Badell Law Mail", { grants: false });
  assert.equal(
    tokenizeSql(sql)
      .map((t) => t.text)
      .join(""),
    sql,
  );
});

test("tells apart keywords, quoted names, strings, numbers and comments", () => {
  const sql = `-- nota\ncreate table "Badell Law Mail".chats (n integer default 0);\nselect 'texto';`;
  assert.equal(kindOf(sql, "create"), "keyword");
  assert.equal(kindOf(sql, "table"), "keyword");
  assert.equal(kindOf(sql, '"Badell Law Mail"'), "ident");
  assert.equal(kindOf(sql, "chats"), "plain");
  assert.equal(kindOf(sql, "0"), "number");
  assert.equal(kindOf(sql, "'texto'"), "string");
  assert.equal(kindOf(sql, "-- nota"), "comment");
});

test("a keyword inside a string or a comment stays inside it", () => {
  const sql = "select 'create table' -- create table\n";
  const kinds = tokenizeSql(sql)
    .filter((t) => t.kind !== "plain")
    .map((t) => `${t.kind}:${t.text}`);
  assert.deepEqual(kinds, ["keyword:select", "string:'create table'", "comment:-- create table"]);
});
