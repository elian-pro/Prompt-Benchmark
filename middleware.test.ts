import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/**
 * The matcher decides what is behind the Google login and what answers the open
 * internet. Getting it wrong exposes routes that talk to Supabase with the
 * service_role key, so it is worth a test.
 *
 * The pattern is read out of the file rather than copied here: Next needs it to
 * be a literal inside `config`, so a copy in this test would drift the moment
 * someone edits one and not the other.
 */
const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
const pattern = source.match(/"(\/\(\(\?!.*?\)\.\*\))"/)?.[1];

test("the matcher pattern is still where the test expects it", () => {
  assert.ok(pattern, "no se encontró el matcher en middleware.ts");
});

const matches = (path: string) => new RegExp(`^${pattern}$`).test(path);

test("guards the app, the API and anything unrecognized", () => {
  for (const path of ["/", "/editor", "/lab/demo", "/api/clients", "/api/demo-sessions"]) {
    assert.equal(matches(path), true, `${path} debería estar protegido`);
  }
});

test("lets the login flow through", () => {
  for (const path of ["/login", "/auth/callback", "/api/auth/google"]) {
    assert.equal(matches(path), false, `${path} no debería pedir sesión`);
  }
});

test("lets the client demo link through", () => {
  for (const path of [
    "/prueba/abc123",
    "/api/prueba/abc123/session",
    "/api/prueba/abc123/messages",
    "/api/prueba/abc123/notes",
  ]) {
    assert.equal(matches(path), false, `${path} es público y no debería pedir sesión`);
  }
});

test("no route shares a prefix with an excluded one", () => {
  // The lookahead is not anchored to a path segment: excluding "prueba" also
  // excludes "/pruebas-internas". So the danger is not the pattern, it is a
  // future route whose name starts with an excluded prefix and which would
  // silently answer without a login. This walks the real route tree and fails
  // when one appears.
  const EXCLUDED = ["login", "auth/callback", "api/auth", "prueba", "api/prueba"];

  const routes = [
    ...readdirSync(new URL("./app", import.meta.url), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("(") && !e.name.startsWith("_"))
      .map((e) => e.name),
    ...readdirSync(new URL("./app/api", import.meta.url), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `api/${e.name}`),
  ];

  for (const route of routes) {
    for (const excluded of EXCLUDED) {
      if (route === excluded) continue; // the excluded route itself
      if (route.startsWith(`${excluded}/`)) continue; // a child of it, also public on purpose
      assert.ok(
        !route.startsWith(excluded),
        `«${route}» empieza con «${excluded}», que el matcher excluye, así que quedaría fuera del login. Renómbrala.`,
      );
    }
  }
});
