/**
 * Friendly, rotating welcome greetings for the Editor/Creator landing screens.
 *
 * A greeting is picked at random from the pool that matches the current local
 * time (the team works ~9:00–18:00): coffee in the morning, lunch around noon,
 * a final-push nudge late in the day, plus a set of general phrases that can
 * appear at any moment (this is where the weekday line lives). Always addresses
 * the team by name.
 */
const TEAM = "Equipo IA";

const WEEKDAYS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

/** Returns a random welcome greeting appropriate for the given moment. */
export function getGreeting(now: Date): string {
  const day = now.getDay(); // 0 = Sunday … 6 = Saturday
  const hour = now.getHours();
  const isWeekend = day === 0 || day === 6;

  // Shown regardless of the hour — keeps the rotation varied. The first one
  // builds the real weekday.
  const general = [
    `¡Feliz ${WEEKDAYS[day]}, ${TEAM}!`,
    `¡Hola de nuevo, ${TEAM}!`,
    `Qué gusto verte, ${TEAM}`,
    `Hora de pulir prompts, ${TEAM}`,
  ];

  let band: string[];
  if (isWeekend || hour < 9 || hour >= 18) {
    band = [
      `Trabajando hasta tarde, ${TEAM}`,
      `Aquí andamos fuera de horario, ${TEAM}`,
      `¿Fin de semana productivo, ${TEAM}?`,
    ];
  } else if (hour < 12) {
    band = [
      `Buenos días, ${TEAM}`,
      `Primer café y a darle, ${TEAM}`,
      `Café en mano, ${TEAM}`,
      `Arrancamos el día, ${TEAM}`,
    ];
  } else if (hour < 14) {
    band = [
      `Vamos a mitad del día, ${TEAM}`,
      `¿Ya con hambre, ${TEAM}?`,
      `Casi hora del almuerzo, ${TEAM}`,
    ];
  } else if (hour < 16) {
    band = [
      `De vuelta del almuerzo, ${TEAM}`,
      `Buenas tardes, ${TEAM}`,
      `Segundo aire, ${TEAM}`,
    ];
  } else {
    band = [
      `Solo queda un último empujón, ${TEAM}`,
      `Recta final, ${TEAM}`,
      `Cerramos con todo, ${TEAM}`,
    ];
  }

  const pool = [...band, ...general];
  return pool[Math.floor(Math.random() * pool.length)];
}
