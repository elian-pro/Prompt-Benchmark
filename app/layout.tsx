import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZEBRA · LEAD STRESS",
  description:
    "Herramienta interna de red-teaming / pruebas de estrés conversacional para chatbots de perfilamiento de leads.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
