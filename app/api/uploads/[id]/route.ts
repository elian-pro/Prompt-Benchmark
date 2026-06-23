import { NextRequest, NextResponse } from "next/server";
import { deleteUpload } from "@/lib/db/uploads";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Removes an upload's DB row and its Storage object (idempotent). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await deleteUpload(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
