// Root landing placeholder.
// TODO (S1-T9): once /library exists, replace this with redirect("/library").
export default function HomePage() {
  return (
    <div>
      <p className="section-label">Sprint 1 · En construcción</p>
      <h1 style={{ fontSize: 28, marginTop: 12 }}>Prompt Studio</h1>
      <p style={{ color: "var(--muted)", marginTop: 12, maxWidth: 480 }}>
        Diseña, edita, prueba y versiona los prompts de calificación de leads.
        Las secciones se irán habilitando a lo largo del sprint.
      </p>
    </div>
  );
}
