import { NextRequest, NextResponse } from "next/server";
import { listVersions } from "@/lib/db/versions";
import { createVersion } from "@/lib/db/versions";
import { createVersionSchema } from "@/lib/schemas/versions";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    return NextResponse.json(await listVersions(id));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const input = createVersionSchema.parse(await req.json());
    const changeSummary = input.changeSummary?.trim() || null;
    const version = await createVersion(id, input.content, {
      bumpType: input.bumpType,
      source: input.source,
      versionNumberOverride: input.versionNumberOverride,
      changeSummary,
    });
    return NextResponse.json(version, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
