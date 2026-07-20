import { NextRequest, NextResponse } from "next/server";
import { getComposerSettings, updateComposerSettings } from "@/lib/db/composer-settings";
import { updateComposerSettingsSchema } from "@/lib/schemas/composer-settings";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getComposerSettings());
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const input = updateComposerSettingsSchema.parse(await req.json());
    return NextResponse.json(await updateComposerSettings(input));
  } catch (err) {
    return handleError(err);
  }
}
