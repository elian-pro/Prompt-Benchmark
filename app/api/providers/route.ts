import { NextRequest, NextResponse } from "next/server";
import { listProviders, createProvider } from "@/lib/db/providers";
import { createProviderSchema } from "@/lib/schemas/providers";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listProviders());
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = createProviderSchema.parse(await req.json());
    const created = await createProvider(input);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
