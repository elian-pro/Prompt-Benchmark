import { NextRequest, NextResponse } from "next/server";
import { listConnections, createConnection } from "@/lib/db/n8n-connections";
import { createConnectionSchema } from "@/lib/schemas/n8n";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listConnections());
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = createConnectionSchema.parse(await req.json());
    const created = await createConnection(input);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
