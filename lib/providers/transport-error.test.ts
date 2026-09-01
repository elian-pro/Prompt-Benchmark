import { test } from "node:test";
import assert from "node:assert/strict";

import { withTransportContext } from "./transport-error.ts";

test("names the provider and the hidden cause", () => {
  const err = new TypeError("terminated", { cause: new Error("Premature close") });
  const out = withTransportContext(err, "Claude");
  assert.match(
    (out as Error).message,
    /Se cortó la conexión con el proveedor "Claude" mientras respondía \(Premature close\)\./,
  );
  assert.equal((out as Error).cause, err);
});

test("a transport failure without a cause still reads", () => {
  const out = withTransportContext(new TypeError("fetch failed"), "OpenAI");
  assert.match((out as Error).message, /proveedor "OpenAI" mientras respondía\. Vuelve a enviar/);
});

test("an application error passes through untouched", () => {
  const err = new Error("Error del proveedor (429): rate limit");
  assert.equal(withTransportContext(err, "OpenAI"), err);
});
