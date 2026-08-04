import Link from "next/link";
import { IconLink, IconMessage2, IconPlayerPlay, IconTarget } from "@tabler/icons-react";

/**
 * Lab hub: four ways to put a client's prompt to the test, ordered by how real
 * the lead is. "IA vs IA" is the Adversarial run (lives at /adversarial),
 * "Playground" is you conversing with the prompt, "Demo" hands the same chat to
 * the client behind a shareable link, and "Replay" works from conversations
 * that actually happened in production.
 */
export default function LabPage() {
  return (
    <div>
      <div className="library-header">
        <div>
          <h1 className="library-title">Lab</h1>
          <p className="section-label library-subtitle">
            Pon a prueba el prompt de un cliente antes de publicarlo
          </p>
        </div>
      </div>

      <div className="lab-grid">
        <Link href="/adversarial" className="lab-card">
          <IconTarget size={28} stroke={1.5} className="lab-card-icon" />
          <span className="lab-card-title">IA vs IA</span>
          <p className="lab-card-desc">
            Dos IAs conversan entre sí: un lead simulado y el bot del
            cliente. Un juez evalúa la conversación completa y genera un
            reporte de fallas por categoría.
          </p>
        </Link>

        <Link href="/lab/playground" className="lab-card">
          <IconMessage2 size={28} stroke={1.5} className="lab-card-icon" />
          <span className="lab-card-title">Playground</span>
          <p className="lab-card-desc">
            Conversa tú mismo con el prompt, como un lead real. Ideal para
            demos en vivo.
          </p>
        </Link>

        <Link href="/lab/demo" className="lab-card">
          <IconLink size={28} stroke={1.5} className="lab-card-icon" />
          <span className="lab-card-title">Demo</span>
          <p className="lab-card-desc">
            El que prueba es el cliente. Le mandas un link, conversa con su
            agente y reporta lo que no cuadra sobre el mensaje exacto. Tú
            revisas y apruebas antes de que nada llegue al Editor.
          </p>
        </Link>

        <Link href="/lab/replay" className="lab-card">
          <IconPlayerPlay size={28} stroke={1.5} className="lab-card-icon" />
          <span className="lab-card-title">Replay</span>
          <p className="lab-card-desc">
            El lead es real y la conversación ya ocurrió. Encuentra la que
            salió mal, márcala, y vuelve a correr ese turno contra el prompt
            corregido.
          </p>
        </Link>
      </div>
    </div>
  );
}
