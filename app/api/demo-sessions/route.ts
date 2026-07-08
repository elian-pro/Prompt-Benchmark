import { NextRequest, NextResponse } from "next/server";
import { listSessions, createSession } from "@/lib/db/demo-sessions";
import { createDemoSessionSchema } from "@/lib/schemas/demo-sessions";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
    return NextResponse.json(await listSessions({ clientId }));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = createDemoSessionSchema.parse(await req.json());
    const session = await createSession(input);
    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
