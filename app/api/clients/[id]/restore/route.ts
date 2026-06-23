import { NextRequest, NextResponse } from "next/server";
import { restoreClient } from "@/lib/db/clients";
import { handleError } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    return NextResponse.json(await restoreClient(id));
  } catch (err) {
    return handleError(err);
  }
}
