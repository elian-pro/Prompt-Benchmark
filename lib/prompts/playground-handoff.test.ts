import { test } from "node:test";
import assert from "node:assert/strict";

import type { DemoMessageRow } from "../db/demo-sessions.ts";
import type { DemoNoteRow } from "../db/demo-notes.ts";
import { approvedNotes, buildHandoffMessage } from "./playground-handoff.ts";

const message = (id: string, role: "human" | "bot", content: string): DemoMessageRow => ({
  id,
  session_id: "s1",
  turn_number: 1,
  round: 1,
  role,
  content,
  version_number_snapshot: "1.0",
  created_at: "2026-08-04T10:00:00Z",
});

const note = (over: Partial<DemoNoteRow> = {}): DemoNoteRow => ({
  id: "n1",
  session_id: "s1",
  text: "El precio está mal.",
  expected: null,
  message_ids: [],
  source: "admin",
  status: "approved",
  created_at: "2026-08-04T10:00:00Z",
  updated_at: "2026-08-04T10:00:00Z",
  ...over,
});

test("a pending note never reaches the Editor", () => {
  const out = buildHandoffMessage(
    "1.0",
    [note({ id: "a", text: "Aprobada", status: "approved" }), note({ id: "b", text: "Sin revisar", status: "pending" })],
    [],
  );
  assert.ok(out.includes("Aprobada"));
  assert.ok(!out.includes("Sin revisar"));
});

test("a rejected note never reaches the Editor", () => {
  const out = buildHandoffMessage("1.0", [note({ text: "Descartada", status: "rejected" })], []);
  assert.ok(!out.includes("Descartada"));
});

test("approvedNotes is the single gate", () => {
  const notes = [
    note({ id: "a", status: "approved" }),
    note({ id: "b", status: "pending" }),
    note({ id: "c", status: "rejected" }),
  ];
  assert.deepEqual(approvedNotes(notes).map((n) => n.id), ["a"]);
});

test("carries what the bot should have answered", () => {
  const out = buildHandoffMessage(
    "1.0",
    [note({ text: "Dijo que abre a las 9.", expected: "Abre a las 8." })],
    [],
  );
  assert.ok(out.includes('Debió responder: "Abre a las 8."'));
});

test("omits the expected line when there is none", () => {
  const out = buildHandoffMessage("1.0", [note()], []);
  assert.ok(!out.includes("Debió responder"));
});

test("quotes the tagged messages", () => {
  const out = buildHandoffMessage(
    "1.0",
    [note({ message_ids: ["m1"] })],
    [message("m1", "bot", JSON.stringify({ estado: "activo", mensajes: ["Abrimos a las 9."] }))],
  );
  assert.ok(out.includes('Bot del cliente: "Abrimos a las 9."'));
});

test("numbering counts only the approved notes", () => {
  const out = buildHandoffMessage(
    "1.0",
    [
      note({ id: "a", text: "Primera", status: "pending" }),
      note({ id: "b", text: "Segunda", status: "approved" }),
    ],
    [],
  );
  assert.ok(out.includes("1. Segunda"), "la aprobada debe numerarse como 1, no como 2");
});

test("a demo link handoff says where it came from", () => {
  const out = buildHandoffMessage("2.1", [note()], [], {
    source: "demo-link",
    clientName: "Chapur",
  });
  assert.ok(out.includes("Reportes del cliente (Chapur)"));
  assert.ok(out.includes("versión 2.1"));
});

test("a report with only the fix leads with it instead of an empty line", () => {
  const out = buildHandoffMessage(
    "1.0",
    [note({ text: null, expected: "Abre a las 8." })],
    [],
  );
  assert.ok(out.includes('1. Debió responder: "Abre a las 8."'));
  assert.ok(!out.includes("1. \n"), "no debe quedar una línea numerada vacía");
});

test("a report with both keeps the complaint first and the fix under it", () => {
  const out = buildHandoffMessage(
    "1.0",
    [note({ text: "Dijo que abre a las 9.", expected: "Abre a las 8." })],
    [],
  );
  const lines = out.split("\n");
  const i = lines.findIndex((l) => l.startsWith("1. "));
  assert.equal(lines[i], "1. Dijo que abre a las 9.");
  assert.equal(lines[i + 1], '   Debió responder: "Abre a las 8."');
});
