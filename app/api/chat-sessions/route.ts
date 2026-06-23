import { NextRequest, NextResponse } from "next/server";
import { listSessions, createSession } from "@/lib/db/chat-sessions";
import { createSessionSchema, sessionTypeSchema } from "@/lib/schemas/chat-sessions";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const parsedType = sessionTypeSchema.safeParse(params.get("type") ?? "editor");
    if (!parsedType.success) return jsonError("Tipo de sesión no válido.", 400);
    const clientId = params.get("clientId") ?? undefined;
    return NextResponse.json(await listSessions({ type: parsedType.data, clientId }));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = createSessionSchema.parse(await req.json());
    const created = await createSession(input);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
