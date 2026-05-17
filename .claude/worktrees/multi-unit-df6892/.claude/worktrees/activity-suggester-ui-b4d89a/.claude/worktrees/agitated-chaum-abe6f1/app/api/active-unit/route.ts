// app/api/active-unit/route.ts

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireUnitAccess } from "@/lib/auth/guards";
import { setActiveUnit } from "@/lib/auth/units";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { log } from "@/lib/log";

const BodySchema = z.object({
  unit_id: z.uuid(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "unit_id must be a valid UUID." },
      { status: 400 },
    );
  }
  const { unit_id } = parsed.data;

  try {
    await requireUnitAccess(unit_id);
    await setActiveUnit(unit_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json(
        { error: "You do not have access to that unit." },
        { status: 403 },
      );
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    log.error({ event: "active_unit_set_failed", err });
    return NextResponse.json(
      { error: "Internal error." },
      { status: 500 },
    );
  }
}
