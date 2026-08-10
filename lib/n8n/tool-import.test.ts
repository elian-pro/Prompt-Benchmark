import { test } from "node:test";
import assert from "node:assert/strict";

import { parseToolNodes, parseJsonBody } from "./tool-import.ts";

/**
 * The fixture is the real pair of nodes from the Bad Boys Toys agent (keys
 * replaced), copied out of n8n the way a user would. If the parser ever stops
 * understanding these two, the import is worthless.
 */
const CLIPBOARD = JSON.stringify({
  nodes: [
    {
      parameters: {
        method: "POST",
        url: "https://abc.supabase.co/rest/v1/rpc/buscar_modelo_por_nombre",
        sendBody: true,
        specifyBody: "json",
        jsonBody:
          '={\n  "termino": "={{ $fromAI(\'searchTerm\', \'nombre del modelo de moto que pidió el lead, ej KPT 200 o Punk\') }}",\n  "max_resultados": 8\n}',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "apikey", value: "eyJ.fake.key" },
            { name: "Authorization", value: "Bearer eyJ.fake.key" },
            { name: "Content-Type", value: "application/json" },
          ],
        },
        toolDescription:
          "Busca un modelo de moto específico por su nombre cuando el lead lo menciona.",
        options: {},
      },
      type: "n8n-nodes-base.httpRequestTool",
      typeVersion: 4.4,
      name: "buscar_modelo_por_nombre",
    },
    {
      parameters: {
        method: "POST",
        url: "https://abc.supabase.co/rest/v1/rpc/recomendar_vehiculos",
        jsonBody:
          "={\n" +
          "  \"p_tipo\": {{ JSON.stringify($fromAI('tipo', 'tipo de vehiculo: moto, scooter, utv, atv o monopatin. Cadena vacia si no se sabe', 'string') || null) }},\n" +
          "  \"p_uso\": {{ JSON.stringify($fromAI('uso', 'uso que le dara el lead. Cadena vacia si no lo dijo', 'string') || null) }},\n" +
          "  \"p_presupuesto_max\": {{ JSON.stringify(Number($fromAI('presupuesto_max', 'presupuesto maximo en pesos MXN. 0 si no lo dijo', 'number')) || null) }},\n" +
          "  \"max_resultados\": 5\n" +
          "}",
        headerParameters: {
          parameters: [{ name: "apikey", value: "eyJ.fake.key" }],
        },
        toolDescription: "Recomienda vehículos del catálogo con filtros exactos.",
      },
      type: "n8n-nodes-base.httpRequestTool",
      name: "recomendar_vehiculos",
    },
    // Not a tool: must be ignored rather than imported as a broken one.
    { parameters: {}, type: "@n8n/n8n-nodes-langchain.agent", name: "AI Agent1" },
  ],
});

test("both tools come out of a copied pair of nodes", () => {
  const tools = parseToolNodes(CLIPBOARD);
  assert.deepEqual(
    tools.map((t) => t.name),
    ["buscar_modelo_por_nombre", "recomendar_vehiculos"],
  );
});

test("the key travels with the node, Content-Type does not", () => {
  const [search] = parseToolNodes(CLIPBOARD);
  assert.deepEqual(search.headers, {
    apikey: "eyJ.fake.key",
    Authorization: "Bearer eyJ.fake.key",
  });
  assert.equal(search.url, "https://abc.supabase.co/rest/v1/rpc/buscar_modelo_por_nombre");
  assert.match(search.description, /^Busca un modelo/);
});

test("a $fromAI becomes a parameter named after the key the endpoint expects", () => {
  const [search] = parseToolNodes(CLIPBOARD);
  // n8n calls it 'searchTerm' for itself; the RPC argument is `termino`.
  assert.deepEqual(search.params, [
    {
      name: "termino",
      description: "nombre del modelo de moto que pidió el lead, ej KPT 200 o Punk",
      type: "string",
    },
  ]);
  assert.deepEqual(search.bodyTemplate, { max_resultados: 8 });
});

test("`|| null` marks the parameter optional, and Number() makes it a number", () => {
  const [, recommend] = parseToolNodes(CLIPBOARD);
  assert.deepEqual(
    recommend.params.map((p) => [p.name, p.type, p.required]),
    [
      ["p_tipo", "string", false],
      ["p_uso", "string", false],
      ["p_presupuesto_max", "number", false],
    ],
  );
  assert.deepEqual(recommend.bodyTemplate, { max_resultados: 5 });
});

test("a lone node and a whole workflow are both accepted", () => {
  const { nodes } = JSON.parse(CLIPBOARD);
  assert.equal(parseToolNodes(JSON.stringify(nodes[0])).length, 1);
  assert.equal(parseToolNodes(JSON.stringify({ name: "wf", nodes })).length, 2);
});

test("junk and tool-less JSON say what to do instead of throwing something cryptic", () => {
  assert.throws(() => parseToolNodes("no soy json"), /Copia el nodo/);
  assert.throws(() => parseToolNodes('{"nodes":[]}'), /HTTP Request Tool/);
});

test("an expression we cannot read is skipped, not saved as text", () => {
  const { params, bodyTemplate } = parseJsonBody(
    '={\n  "cliente": "={{ $json.cliente }}",\n  "limite": 3\n}',
  );
  assert.deepEqual(params, []);
  assert.deepEqual(bodyTemplate, { limite: 3 });
});
