import { NextResponse } from "next/server";
import { refreshAccount } from "@/lib/accounts-service";
import { jsonError } from "../../route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const account = await refreshAccount(id);
    return NextResponse.json({ account });
  } catch (err) {
    // Invalid cookie → 401, but the account view is attached for the UI.
    const view = (err as Error & { view?: unknown })?.view;
    if (view) {
      const res = jsonError(err);
      const body = await res.json().catch(() => ({}));
      return NextResponse.json(
        { ...body, account: view },
        { status: res.status },
      );
    }
    return jsonError(err);
  }
}
