import { IconBrandGoogle } from "@tabler/icons-react";
import { allowedDomain } from "@/lib/auth/session";

export const metadata = {
  title: "Entrar · ZEBRA Prompt Studio",
};

// Reasons the callback (or start) route can bounce back here, mapped to a
// message. Kept in Spanish per the project's UI language rule.
const ERROR_MESSAGES: Record<string, string> = {
  domain: `Solo se permite el acceso con una cuenta @${
    process.env.AUTH_ALLOWED_DOMAIN || "zebradigital.marketing"
  }.`,
  state: "El inicio de sesión expiró o no es válido. Intenta de nuevo.",
  google: "No se pudo completar el inicio con Google. Intenta de nuevo.",
  config: "El inicio de sesión no está configurado. Avisa al administrador.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERROR_MESSAGES[error] ?? ERROR_MESSAGES.google : null;

  return (
    <div className="login-screen">
      <div className="login-card">
        <span className="pill-logo">Zebra · Prompt Studio</span>
        <div className="login-copy">
          <h1>Acceso del equipo</h1>
          <p>
            Herramienta interna del equipo de Inteligencia Artificial (IA).
            Entra con tu cuenta de Google del dominio{" "}
            <strong>@{allowedDomain()}</strong>.
          </p>
        </div>

        {message && (
          <p className="login-error" role="alert">
            {message}
          </p>
        )}

        <a className="btn btn-primary login-google" href="/api/auth/google">
          <IconBrandGoogle size={16} stroke={2} />
          Entrar con Google
        </a>
      </div>
    </div>
  );
}
