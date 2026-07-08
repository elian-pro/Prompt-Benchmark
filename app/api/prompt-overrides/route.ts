import { NextResponse } from "next/server";
import { listPromptOverrides } from "@/lib/db/prompt-overrides";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** All persisted system-prompt overrides (roles without a row use the code
 *  default, so they're simply absent from this list). */
export async function GET() {
  try {
    return NextResponse.json(await listPromptOverrides());
  } catch (err) {
    return handleError(err);
  }
}
