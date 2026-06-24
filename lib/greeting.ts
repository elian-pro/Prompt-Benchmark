/**
 * Friendly, rotating welcome greetings for the Editor/Creator landing screens.
 *
 * A greeting is picked at random from the pool that matches the current local
 * time (the team works ~9:00–18:00): coffee in the morning, lunch around noon,
 * a final-push nudge late in the day, plus a set of general phrases that can
 * appear at any moment (this is where the weekday line lives). Always addresses
 * the team by name.
 */
export const TEAM_NAME = "Equipo IA";

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
    `¡Feliz ${WEEKDAYS[day]}, ${TEAM_NAME}!`,
    `¡Hola de nuevo, ${TEAM_NAME}!`,
    `Qué gusto verte, ${TEAM_NAME}`,
    `Hora de pulir prompts, ${TEAM_NAME}`,
  ];

  let band: string[];
  if (isWeekend || hour < 9 || hour >= 18) {
    band = [
      `Trabajando hasta tarde, ${TEAM_NAME}`,
      `Aquí andamos fuera de horario, ${TEAM_NAME}`,
      `¿Fin de semana productivo, ${TEAM_NAME}?`,
    ];
  } else if (hour < 12) {
    band = [
      `Buenos días, ${TEAM_NAME}`,
      `Primer café y a darle, ${TEAM_NAME}`,
      `Café en mano, ${TEAM_NAME}`,
      `Arrancamos el día, ${TEAM_NAME}`,
    ];
  } else if (hour < 14) {
    band = [
      `Vamos a mitad del día, ${TEAM_NAME}`,
      `¿Ya con hambre, ${TEAM_NAME}?`,
      `Casi hora del almuerzo, ${TEAM_NAME}`,
    ];
  } else if (hour < 16) {
    band = [
      `De vuelta del almuerzo, ${TEAM_NAME}`,
      `Buenas tardes, ${TEAM_NAME}`,
      `Segundo aire, ${TEAM_NAME}`,
    ];
  } else {
    band = [
      `Solo queda un último empujón, ${TEAM_NAME}`,
      `Recta final, ${TEAM_NAME}`,
      `Cerramos con todo, ${TEAM_NAME}`,
    ];
  }

  const pool = [...band, ...general];
  return pool[Math.floor(Math.random() * pool.length)];
}
