import { NextResponse } from "next/server";
import { listRoleDefaults } from "@/lib/db/role-defaults";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listRoleDefaults());
  } catch (err) {
    return handleError(err);
  }
}
