import { test } from "node:test";
import assert from "node:assert/strict";

import { resError } from "./res-error.ts";

const html = new Response("<!DOCTYPE html><html><body>504</body></html>", {
  status: 504,
  headers: { "content-type": "text/html" },
});

test("prefers the API's error envelope", async () => {
  const res = Response.json({ error: "Esta conversación ya no admite más mensajes." }, { status: 409 });
  assert.equal(await resError(res, "No se pudo enviar."), "Esta conversación ya no admite más mensajes.");
});

test("an HTML error page falls back to the caller's text plus the status", async () => {
  assert.equal(await resError(html, "No se pudo enviar."), "No se pudo enviar. (HTTP 504)");
});

test("JSON without an error field falls back too", async () => {
  const res = Response.json({ ok: false }, { status: 500 });
  assert.equal(await resError(res, "No se pudo enviar."), "No se pudo enviar. (HTTP 500)");
});
