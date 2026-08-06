import { NextResponse } from "next/server";

import { listSpaces } from "@/lib/google-chat/client";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Its own route because it is a network call: the card only makes it when
 *  someone opens the picker. */
export async function GET() {
  try {
    return NextResponse.json(await listSpaces());
  } catch (err) {
    return handleError(err);
  }
}
