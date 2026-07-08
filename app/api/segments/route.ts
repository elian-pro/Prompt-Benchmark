import { NextRequest, NextResponse } from "next/server";
import { listSegments, createSegment } from "@/lib/db/segments";
import { createSegmentSchema } from "@/lib/schemas/segments";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listSegments());
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = createSegmentSchema.parse(await req.json());
    const segment = await createSegment(input.name);
    return NextResponse.json(segment, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
