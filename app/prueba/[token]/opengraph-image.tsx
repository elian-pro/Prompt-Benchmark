import { ImageResponse } from "next/og";

import { getLinkByToken } from "@/lib/db/demo-links";
import { getClient } from "@/lib/db/clients";

/**
 * The card that shows up when the link is pasted into WhatsApp, which is where
 * these links actually travel. Drawn here rather than shipped as a file so it
 * carries the client's own name: a generic image would look like spam next to
 * the message asking them to test their agent.
 *
 * `ImageResponse` comes with Next, so this adds no dependency. It renders on
 * the server with a plain flex layout, no external fonts and no remote images,
 * which is all this needs and all it supports without extra work.
 */
export const runtime = "nodejs";
export const alt = "Prueba el agente";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#FFD602";
const BG = "#0A0A0A";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await getLinkByToken(token);
  const client = link ? await getClient(link.client_id) : null;
  const name = client?.name ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: BG,
          color: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 8, background: ACCENT, borderRadius: 100 }} />
          <div
            style={{
              fontSize: 22,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: "#8A8A8A",
            }}
          >
            Zebra
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 30, color: "#8A8A8A", letterSpacing: 4 }}>
            PRUEBAS Y VALIDACIÓN
          </div>
          <div style={{ fontSize: 68, lineHeight: 1.1, letterSpacing: -2 }}>
            {name ? `Prueba el agente de ${name}` : "Prueba el agente"}
          </div>
          <div style={{ fontSize: 30, color: "#8A8A8A", lineHeight: 1.4 }}>
            Conversa con él y repórtanos lo que no cuadre.
          </div>
        </div>

        <div style={{ display: "flex", height: 10, gap: 10 }}>
          <div style={{ flex: 1, background: ACCENT, borderRadius: 100 }} />
          <div style={{ flex: 3, background: "#1F1F1F", borderRadius: 100 }} />
        </div>
      </div>
    ),
    size,
  );
}
