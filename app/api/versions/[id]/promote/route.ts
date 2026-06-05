import { NextRequest, NextResponse } from "next/server";
import { promoteToProduction } from "@/lib/db/versions";
import { handleError } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    return NextResponse.json(await promoteToProduction(id));
  } catch (err) {
    return handleError(err);
  }
}
