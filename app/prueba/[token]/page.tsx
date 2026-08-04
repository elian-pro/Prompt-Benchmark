import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { getLinkByToken } from "@/lib/db/demo-links";
import { getClient } from "@/lib/db/clients";
import { baseUrlFromHeaders } from "@/lib/base-url";
import { DemoClient } from "@/components/demo/DemoClient";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/**
 * The page the client opens. Public: the middleware does not guard `/prueba`.
 *
 * It resolves the token server side for two reasons. An unknown token should be
 * a plain 404 rather than a chat that fails on its first message, and the link
 * preview (WhatsApp, Slack, a mail client) needs the client's name before any
 * JavaScript runs.
 *
 * Nothing about the prompt or the version reaches this component. The client is
 * testing the agent, not looking at how it is built.
 */
async function resolve(token: string) {
  const link = await getLinkByToken(token);
  if (!link) return null;
  const client = await getClient(link.client_id);
  return { link, clientName: client?.name ?? null };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const resolved = await resolve(token);

  if (!resolved) {
    return { title: "Link no disponible", robots: { index: false, follow: false } };
  }

  const title = resolved.clientName
    ? `Prueba el agente de ${resolved.clientName}`
    : "Prueba el agente";
  const description =
    "Conversa con el agente, repórtanos lo que no cuadre y ayúdanos a afinarlo antes de que salga a producción.";

  // Derived from the request, not from AUTH_BASE_URL alone. WhatsApp fetches
  // og:image from wherever this points, so if it were left at the localhost
  // fallback the card would render with no image at all, which is exactly what
  // was happening. The image itself is opengraph-image.png in this folder; Next
  // turns it into og:image and resolves it against this base.
  const base = baseUrlFromHeaders(await headers());

  return {
    ...(base ? { metadataBase: new URL(base) } : {}),
    title,
    description,
    // A demo link is private by convention, not by secrecy. Keeping it out of
    // search results means a token that leaks does not also get indexed.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "ZEBRA",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DemoLinkPage({ params }: Params) {
  const { token } = await params;
  const resolved = await resolve(token);
  if (!resolved) notFound();

  return <DemoClient token={token} clientName={resolved.clientName} />;
}
