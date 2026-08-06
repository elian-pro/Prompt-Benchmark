"use client";

import { useEffect, useState } from "react";
import { IconMessage2, IconNotes, IconShieldLock } from "@tabler/icons-react";

import { Button } from "@/components/ui/Button";
import { ZebraWordmark } from "@/components/ui/ZebraWordmark";

/**
 * What the client reads before typing anything: the instructions that used to
 * live at the top of the Google Doc, plus the one thing the doc never said,
 * that the conversation is recorded.
 *
 * It is a hard gate, not a dismissible hint. Someone who starts testing without
 * knowing they can tag a message will go back to sending screenshots, which is
 * the exact habit this feature replaces.
 *
 * On a first visit it arrives one step at a time: the three points start
 * blurred and each press of the button reveals the next. Clients were closing
 * the whole thing on reflex, the way anyone closes a wall of text, so the wall
 * is gone. The button also takes a moment to enable on each step, quietly,
 * because four buttons that are instantly clickable are dismissed as fast as
 * one.
 *
 * A client who has already been through it (`stepped={false}`) gets the whole
 * card at once and a single button: they are coming back, not learning.
 */
const STEP_COUNT = 3;

/** Long enough that the eye lands on the text before the button is live, short
 *  enough that nobody feels made to wait. No countdown: this reads as the card
 *  settling in, not as a test. */
const STEP_DELAY_MS = 1500;

export function DemoInstructions({
  clientName,
  stepped = true,
  onStart,
}: {
  clientName: string | null;
  /** False when the instructions are being shown again to someone who already
   *  read them: no blur, no steps. */
  stepped?: boolean;
  onStart: () => void;
}) {
  const [revealed, setRevealed] = useState(stepped ? 0 : STEP_COUNT);
  const [ready, setReady] = useState(!stepped);

  useEffect(() => {
    // `stepped` can arrive late: the page renders before it knows whether this
    // browser has been here. Returning early on false left the state seeded
    // from the first value, blurred and with a dead button, so it syncs
    // instead.
    if (!stepped) {
      setRevealed(STEP_COUNT);
      setReady(true);
      return;
    }
    setReady(false);
    const timer = setTimeout(() => setReady(true), STEP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stepped, revealed]);

  const done = revealed >= STEP_COUNT;

  return (
    <div className="demo-gate">
      <div className="demo-gate-card">
        {/* First thing they see is who made this (ZR-13 in spirit: a Zebra
            piece carries the wordmark, not the word). */}
        <ZebraWordmark height={16} />
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
          {[
            {
              Icon: IconMessage2,
              body: (
                <>
                  <strong>Escribe abajo, como en WhatsApp.</strong> El agente responde con la
                  información con la que fue entrenado.
                </>
              ),
            },
            {
              Icon: IconNotes,
              body: (
                <>
                  <strong>¿Algo salió mal? Toca el mensaje</strong> y déjanos una nota. No
                  necesitas capturas de pantalla: al tocar el mensaje ya sabemos exactamente de
                  cuál hablas. Lo que más nos sirve es que nos digas{" "}
                  <strong>qué debió responder</strong>. Si quieres explicar qué estuvo mal, hay
                  espacio para eso también.
                </>
              ),
            },
            {
              Icon: IconShieldLock,
              body: (
                <>
                  <strong>Todo queda guardado.</strong> La conversación, la fecha y el
                  dispositivo desde el que escribes se registran, para que después podamos
                  revisar juntos qué se pidió y cuándo. No pedimos tu nombre ni tu correo.
                </>
              ),
            },
          ].map(({ Icon, body }, i) => {
            const locked = i >= revealed;
            return (
              <li key={i} className={locked ? "is-locked" : undefined} aria-hidden={locked}>
                <Icon size={18} stroke={1.5} />
                <div>{body}</div>
              </li>
            );
          })}
        </ul>

        <Button
          variant="primary"
          disabled={!ready}
          onClick={() => (done ? onStart() : setRevealed((n) => n + 1))}
        >
          {done ? "Empezar a probar" : "Continuar"}
        </Button>
      </div>
    </div>
  );
}
