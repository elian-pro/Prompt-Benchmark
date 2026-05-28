import { NextRequest, NextResponse } from "next/server";
import { getPublicSettings, updateSettings } from "@/lib/keys";

// This route runs only on the server (Node runtime). It is the ONLY place
// the frontend talks to about keys — and it only ever returns masked values.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → masked status of both keys + their source + model settings.
export async function GET() {
  try {
    return NextResponse.json(getPublicSettings());
  } catch (err) {
    return NextResponse.json(
      { error: "No se pudo leer la configuración." },
      { status: 500 },
    );
  }
}

// POST → save keys (only if not env-locked) and model settings to the local
// file. Never echoes the raw key back; returns the masked status instead.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo JSON inválido." },
      { status: 400 },
    );
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const openaiKey = typeof b.openaiKey === "string" ? b.openaiKey : undefined;
  const anthropicKey =
    typeof b.anthropicKey === "string" ? b.anthropicKey : undefined;

  try {
    const { settings, ignored } = updateSettings({
      openaiKey,
      anthropicKey,
      models: b.models,
    });
    return NextResponse.json({ settings, ignored });
  } catch (err) {
    return NextResponse.json(
      { error: "No se pudo guardar la configuración." },
      { status: 500 },
    );
  }
}
