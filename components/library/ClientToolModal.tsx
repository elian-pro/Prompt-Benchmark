"use client";

import { useEffect, useState } from "react";
import { IconPlus, IconTrash, IconClipboard } from "@tabler/icons-react";
import type { MaskedTool } from "@/lib/db/client-tools";
import type { ToolParam } from "@/lib/providers/types";
import { parseToolNodes } from "@/lib/n8n/tool-import";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type HeaderRow = { key: string; value: string };

type Props = {
  open: boolean;
  clientId: string;
  /** Null creates, a tool edits it. Header values are never loaded back: the
   *  server only ever hands out masked ones. */
  tool: MaskedTool | null;
  onClose: () => void;
  onSaved: () => void;
};

const EMPTY_PARAM: ToolParam = { name: "", description: "", type: "string" };

/**
 * Same fields as an n8n HTTP Request Tool node: what the model sees (name,
 * description, parameters) and what the request is (URL, headers, fixed body).
 */
export function ClientToolModal({ open, clientId, tool, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<HeaderRow[]>([{ key: "apikey", value: "" }]);
  const [params, setParams] = useState<ToolParam[]>([{ ...EMPTY_PARAM }]);
  const [bodyTemplate, setBodyTemplate] = useState("{}");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [imported, setImported] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPasted("");
    setImported(null);
    setName(tool?.name ?? "");
    setDescription(tool?.description ?? "");
    setUrl(tool?.url ?? "");
    // Editing shows the header names with empty values: filling one in
    // replaces the whole set, leaving them all empty keeps what is stored.
    setHeaders(
      tool
        ? Object.keys(tool.headers_masked).map((k) => ({ key: k, value: "" }))
        : [{ key: "apikey", value: "" }],
    );
    setParams(tool?.params.length ? tool.params : [{ ...EMPTY_PARAM }]);
    setBodyTemplate(JSON.stringify(tool?.body_template ?? {}, null, 2));
  }, [open, tool]);

  /** Fills the form from a node copied in n8n. Never saves on its own: what it
   *  understood has to be visible before it becomes a tool. */
  function fillFromN8n() {
    setError(null);
    setImported(null);
    try {
      const tools = parseToolNodes(pasted);
      const [first, ...rest] = tools;
      setName(first.name);
      setDescription(first.description);
      setUrl(first.url);
      setHeaders(Object.entries(first.headers).map(([key, value]) => ({ key, value })));
      setParams(first.params.length ? first.params : [{ ...EMPTY_PARAM }]);
      setBodyTemplate(JSON.stringify(first.bodyTemplate, null, 2));
      setImported(
        rest.length
          ? `Cargué «${first.name}». El JSON traía ${tools.length} herramientas: guarda esta y pega el resto una a una.`
          : `Cargué «${first.name}». Revisa los campos y guarda.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude leer ese JSON.");
    }
  }

  async function save() {
    setError(null);
    let parsedBody: Record<string, unknown>;
    try {
      parsedBody = bodyTemplate.trim() ? JSON.parse(bodyTemplate) : {};
      if (Array.isArray(parsedBody) || typeof parsedBody !== "object") {
        throw new Error("El cuerpo fijo debe ser un objeto JSON.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "El cuerpo fijo no es JSON válido.");
      return;
    }

    const filledHeaders = headers.filter((h) => h.key.trim() && h.value.trim());
    const cleanParams = params
      .filter((p) => p.name.trim())
      .map((p) => ({ ...p, name: p.name.trim(), description: p.description.trim() }));

    const payload: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim(),
      url: url.trim(),
      params: cleanParams,
      body_template: parsedBody,
    };
    if (filledHeaders.length) {
      payload.headers = Object.fromEntries(filledHeaders.map((h) => [h.key.trim(), h.value]));
    } else if (!tool) {
      setError("Añade al menos un header con su valor.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        tool ? `/api/clients/${clientId}/tools/${tool.id}` : `/api/clients/${clientId}/tools`,
        {
          method: tool ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo guardar la herramienta.");
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tool ? `Editar ${tool.name}` : "Nueva herramienta"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      {error && <p className="form-error">{error}</p>}

      <details className="field" open={!tool}>
        <summary className="field-label" style={{ cursor: "pointer" }}>
          Pegar desde n8n
        </summary>
        <textarea
          className="textarea"
          rows={3}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="Selecciona el nodo en n8n, cópialo y pégalo aquí…"
        />
        <div className="row-between" style={{ marginTop: 6 }}>
          <span className="field-hint" style={{ margin: 0 }}>
            {imported ?? "Trae la URL, los headers con su llave y los parámetros del $fromAI."}
          </span>
          <Button
            size="sm"
            variant="secondary"
            icon={<IconClipboard size={13} />}
            onClick={fillFromN8n}
            disabled={!pasted.trim()}
          >
            Rellenar campos
          </Button>
        </div>
      </details>

      <div className="field">
        <label className="field-label">Nombre</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="buscar_modelo_por_nombre"
        />
        <p className="field-hint">Sin espacios ni acentos. Es el nombre que usa el modelo.</p>
      </div>

      <div className="field">
        <label className="field-label">Cuándo usarla</label>
        <textarea
          className="textarea"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Busca un modelo por su nombre cuando el lead lo menciona…"
        />
        <p className="field-hint">
          Esto lo lee el modelo y decide si la llama. Es tan parte del prompt como el prompt.
        </p>
      </div>

      <div className="field">
        <label className="field-label">URL</label>
        <input
          className="input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://xxxx.supabase.co/rest/v1/rpc/buscar_modelo_por_nombre"
        />
        <p className="field-hint">Se envía por POST. Solo https y hosts permitidos.</p>
      </div>

      <div className="field">
        <label className="field-label">Headers</label>
        {headers.map((h, i) => (
          <div key={i} className="tool-row">
            <input
              className="input"
              value={h.key}
              onChange={(e) =>
                setHeaders(headers.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
              }
              placeholder="apikey"
            />
            <input
              className="input"
              type="password"
              value={h.value}
              onChange={(e) =>
                setHeaders(headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
              }
              placeholder={tool ? "sin cambios" : "eyJhbGciOi…"}
            />
            <Button
              size="sm"
              variant="ghost"
              icon={<IconTrash size={13} />}
              onClick={() => setHeaders(headers.filter((_, j) => j !== i))}
              aria-label="Quitar header"
            />
          </div>
        ))}
        <Button
          size="sm"
          variant="secondary"
          icon={<IconPlus size={13} />}
          onClick={() => setHeaders([...headers, { key: "", value: "" }])}
        >
          Añadir header
        </Button>
        {tool && (
          <p className="field-hint">
            Los valores guardados no se muestran. Deja los campos vacíos para conservarlos.
          </p>
        )}
      </div>

      <div className="field">
        <label className="field-label">Parámetros que rellena el modelo</label>
        {params.map((p, i) => (
          <div key={i} className="tool-row">
            <input
              className="input"
              value={p.name}
              onChange={(e) =>
                setParams(params.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
              }
              placeholder="termino"
            />
            <input
              className="input"
              value={p.description}
              onChange={(e) =>
                setParams(
                  params.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                )
              }
              placeholder="El nombre del modelo tal como lo dijo el lead"
            />
            <select
              className="input"
              value={p.type}
              onChange={(e) =>
                setParams(
                  params.map((x, j) =>
                    j === i ? { ...x, type: e.target.value as ToolParam["type"] } : x,
                  ),
                )
              }
            >
              <option value="string">texto</option>
              <option value="number">número</option>
              <option value="boolean">sí/no</option>
            </select>
            <label className="tool-optional" title="El modelo puede omitirlo">
              <input
                type="checkbox"
                checked={p.required === false}
                onChange={(e) =>
                  setParams(
                    params.map((x, j) => (j === i ? { ...x, required: !e.target.checked } : x)),
                  )
                }
              />
              opcional
            </label>
            <Button
              size="sm"
              variant="ghost"
              icon={<IconTrash size={13} />}
              onClick={() => setParams(params.filter((_, j) => j !== i))}
              aria-label="Quitar parámetro"
            />
          </div>
        ))}
        <p className="field-hint">
          Marca «opcional» el que la función acepte vacío. Si el modelo no lo sabe, no se envía y
          la función usa su valor por defecto, en vez de filtrar por vacío y no devolver nada.
        </p>
        <Button
          size="sm"
          variant="secondary"
          icon={<IconPlus size={13} />}
          onClick={() => setParams([...params, { ...EMPTY_PARAM }])}
        >
          Añadir parámetro
        </Button>
      </div>

      <div className="field">
        <label className="field-label">Cuerpo fijo (JSON)</label>
        <textarea
          className="textarea"
          rows={3}
          value={bodyTemplate}
          onChange={(e) => setBodyTemplate(e.target.value)}
          placeholder={'{ "max_resultados": 8 }'}
        />
        <p className="field-hint">
          Se envía junto con los parámetros del modelo, que tienen prioridad si coinciden.
        </p>
      </div>
    </Modal>
  );
}
