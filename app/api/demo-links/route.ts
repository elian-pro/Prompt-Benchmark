import { NextRequest, NextResponse } from "next/server";

import { createLink, listLinks } from "@/lib/db/demo-links";
import { createDemoLinkSchema } from "@/lib/schemas/demo-links";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The user's side of demo links. Behind the login, unlike everything under
 *  `/api/prueba`. */
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
    return NextResponse.json(await listLinks(clientId));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = createDemoLinkSchema.parse(await req.json());
    return NextResponse.json(await createLink(input), { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
