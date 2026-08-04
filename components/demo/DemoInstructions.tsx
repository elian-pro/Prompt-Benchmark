"use client";

import { IconMessage2, IconNotes, IconShieldLock } from "@tabler/icons-react";

import { Button } from "@/components/ui/Button";

/**
 * What the client reads before typing anything: the instructions that used to
 * live at the top of the Google Doc, plus the one thing the doc never said,
 * that the conversation is recorded.
 *
 * It is a hard gate, not a dismissible hint. Someone who starts testing without
 * knowing they can tag a message will go back to sending screenshots, which is
 * the exact habit this feature replaces.
 */
export function DemoInstructions({
  clientName,
  onStart,
}: {
  clientName: string | null;
  onStart: () => void;
}) {
  return (
    <div className="demo-gate">
      <div className="demo-gate-card">
        <p className="section-label">Pruebas y validación</p>
        <h1 className="demo-gate-title">
          Prueba el agente{clientName ? ` de ${clientName}` : ""}
        </h1>
        <p className="demo-gate-lead">
          Conversa con el agente como lo haría un cliente real. Pregunta de todo: dudas
          fáciles, dudas raras, precios, horarios, casos que creas que se le pueden complicar.
          Entre más lo pongas a prueba, mejor queda.
        </p>

        <ul className="demo-gate-steps">
          <li>
            <IconMessage2 size={18} stroke={1.5} />
            <div>
              <strong>Escribe abajo, como en WhatsApp.</strong> El agente responde con la
              información con la que fue entrenado.
            </div>
          </li>
          <li>
            <IconNotes size={18} stroke={1.5} />
            <div>
              <strong>¿Algo salió mal? Toca el mensaje</strong> y déjanos una nota. No necesitas
              capturas de pantalla: al tocar el mensaje ya sabemos exactamente de cuál hablas.
              Lo que más nos sirve es que nos digas <strong>qué debió responder</strong>. Si
              quieres explicar qué estuvo mal, hay espacio para eso también.
            </div>
          </li>
          <li>
            <IconShieldLock size={18} stroke={1.5} />
            <div>
              <strong>Todo queda guardado.</strong> La conversación, la fecha y el dispositivo
              desde el que escribes se registran, para que después podamos revisar juntos qué se
              pidió y cuándo. No pedimos tu nombre ni tu correo.
            </div>
          </li>
        </ul>

        <Button onClick={onStart}>Empezar a probar</Button>
      </div>
    </div>
  );
}
