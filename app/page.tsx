import Link from "next/link";

// Placeholder home screen. The full Run screen (§5) is built in a later phase.
export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2rem",
        padding: "2rem",
      }}
    >
      <span className="pill">ZEBRA | LEAD STRESS</span>
      <p className="label" style={{ textAlign: "center", maxWidth: 480 }}>
        Pruebas de estrés conversacional para chatbots de perfilamiento
      </p>
      <Link href="/settings" className="btn-primary">
        Settings →
      </Link>
    </main>
  );
}
