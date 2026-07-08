import Link from "next/link";
import { IconMessage2, IconTarget } from "@tabler/icons-react";

/**
 * Lab hub: two ways to put a client's prompt to the test before publishing.
 * "IA vs IA" is the existing Adversarial run (lives at /adversarial,
 * untouched). "Playground" (you converse with the prompt yourself) lives at
 * /lab/playground. Tagging messages and sending feedback notes to the
 * Editor land later this sprint (T3-T4).
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
      </div>
    </div>
  );
}
