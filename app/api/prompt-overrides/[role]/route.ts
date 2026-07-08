import { NextRequest, NextResponse } from "next/server";
import { setPromptOverride, deletePromptOverride } from "@/lib/db/prompt-overrides";
import { promptRoleSchema, savePromptOverrideSchema } from "@/lib/schemas/prompt-overrides";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ role: string }> };

/** Saves (creates or replaces) the override for a role. */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const role = promptRoleSchema.parse((await params).role);
    const { content } = savePromptOverrideSchema.parse(await req.json());
    return NextResponse.json(await setPromptOverride(role, content));
  } catch (err) {
    return handleError(err);
  }
}

/** Removes the override so the role reverts to its code default. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const role = promptRoleSchema.parse((await params).role);
    await deletePromptOverride(role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
