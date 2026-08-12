import { test } from "node:test";
import assert from "node:assert/strict";

import type { DemoMessageRow } from "../db/demo-sessions.ts";
import type { DemoNoteRow, DemoNoteWithContext } from "../db/demo-notes.ts";
import {
  approvedNotes,
  buildClientBatchHandoff,
  buildHandoffMessage,
} from "./playground-handoff.ts";

const message = (id: string, role: "human" | "bot", content: string): DemoMessageRow => ({
  id,
  session_id: "s1",
  turn_number: 1,
  round: 1,
  role,
  content,
  tool_calls: null,
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
  sent_to_editor_at: null,
  editor_session_id: null,
  created_at: "2026-08-04T10:00:00Z",
  updated_at: "2026-08-04T10:00:00Z",
  ...over,
});

const clientNote = (over: Partial<DemoNoteWithContext> = {}): DemoNoteWithContext => ({
  ...note({ source: "client" }),
  link_id: "l1",
  link_label: "Ronda 1",
  version_id: "v1",
  version_number: "1.0",
  messages: [],
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
    note({ id: "d", status: "approved", sent_to_editor_at: "2026-08-11T10:00:00Z" }),
  ];
  assert.deepEqual(approvedNotes(notes).map((n) => n.id), ["a"]);
});

test("a note already sent never travels twice", () => {
  const out = buildHandoffMessage(
    "1.0",
    [
      note({ id: "a", text: "Ya enviada", sent_to_editor_at: "2026-08-11T10:00:00Z" }),
      note({ id: "b", text: "Todavía no" }),
    ],
    [],
  );
  assert.ok(!out.includes("Ya enviada"));
  assert.ok(out.includes("1. Todavía no"), "la que queda se numera como 1");
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

test("a batch groups by version and numbers straight through", () => {
  const out = buildClientBatchHandoff("Chapur", [
    clientNote({ id: "c", text: "Tercera", version_number: "1.1", created_at: "2026-08-06T10:00:00Z" }),
    clientNote({ id: "a", text: "Primera", version_number: "1.0", created_at: "2026-08-04T10:00:00Z" }),
    clientNote({ id: "b", text: "Segunda", version_number: "1.0", created_at: "2026-08-05T10:00:00Z" }),
  ]);
  const lines = out.split("\n").filter((l) => l.trim());
  assert.deepEqual(
    lines.filter((l) => l.startsWith("Sobre la versión")),
    ["Sobre la versión 1.0:", "Sobre la versión 1.1:"],
    "las versiones salen de la más vieja a la más nueva",
  );
  assert.deepEqual(
    lines.filter((l) => /^\d+\. /.test(l)),
    ["1. Primera", "2. Segunda", "3. Tercera"],
  );
});

test("a batch leaves out what is pending, rejected or already sent", () => {
  const out = buildClientBatchHandoff("Chapur", [
    clientNote({ id: "a", text: "Aprobada" }),
    clientNote({ id: "b", text: "Sin revisar", status: "pending" }),
    clientNote({ id: "c", text: "Descartada", status: "rejected" }),
    clientNote({ id: "d", text: "Ya enviada", sent_to_editor_at: "2026-08-11T10:00:00Z" }),
  ]);
  assert.ok(out.includes("1. Aprobada"));
  for (const excluded of ["Sin revisar", "Descartada", "Ya enviada"]) {
    assert.ok(!out.includes(excluded), `${excluded} no debe llegar al Editor`);
  }
});

test("a batch quotes each report's own turns", () => {
  const out = buildClientBatchHandoff("Chapur", [
    clientNote({
      id: "a",
      message_ids: ["m1"],
      messages: [
        message("m1", "bot", JSON.stringify({ estado: "activo", mensajes: ["Abrimos a las 9."] })),
      ],
    }),
  ]);
  assert.ok(out.includes('Bot del cliente: "Abrimos a las 9."'));
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
