import { NextRequest, NextResponse } from "next/server";
import { setRoleDefault } from "@/lib/db/role-defaults";
import { roleNameSchema, setRoleDefaultSchema } from "@/lib/schemas/providers";
import { handleError, jsonError } from "@/lib/http";

type Params = { params: Promise<{ role: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { role } = await params;
    const parsedRole = roleNameSchema.safeParse(role);
    if (!parsedRole.success) {
      return jsonError("Rol no válido.", 404);
    }
    const input = setRoleDefaultSchema.parse(await req.json());
    const saved = await setRoleDefault(parsedRole.data, input);
    return NextResponse.json(saved);
  } catch (err) {
    return handleError(err);
  }
}
