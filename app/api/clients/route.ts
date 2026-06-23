import { NextRequest, NextResponse } from "next/server";
import { listClients, createClient } from "@/lib/db/clients";
import { clientFilterSchema, createClientSchema } from "@/lib/schemas/clients";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const parsedFilter = clientFilterSchema.safeParse(params.get("filter") ?? "all");
    if (!parsedFilter.success) return jsonError("Filtro no válido.", 400);
    const search = params.get("search") ?? undefined;
    return NextResponse.json(await listClients({ filter: parsedFilter.data, search }));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = createClientSchema.parse(await req.json());
    const created = await createClient(input);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
