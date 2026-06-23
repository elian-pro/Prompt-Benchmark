import { NextRequest, NextResponse } from "next/server";
import { listRuns, createRun } from "@/lib/db/runs";
import { createRunSchema } from "@/lib/schemas/runs";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
    return NextResponse.json(await listRuns({ clientId }));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = createRunSchema.parse(await req.json());
    const run = await createRun(input);
    return NextResponse.json(run, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
