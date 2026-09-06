import { NextRequest, NextResponse } from "next/server";
import { addAccount, listAccounts } from "@/lib/accounts-service";
import { InvalidCookieError, RobloxApiError } from "@/lib/roblox";

export const dynamic = "force-dynamic";

export function jsonError(err: unknown) {
  if (err instanceof InvalidCookieError) {
    return NextResponse.json(
      { error: err.message, code: "INVALID_COOKIE" },
      { status: 401 },
    );
  }
  if (err instanceof RobloxApiError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 400;
    return NextResponse.json(
      { error: err.message, code: "ROBLOX_ERROR" },
      { status: status === 401 ? 401 : Math.max(status, 200) >= 500 ? 502 : status },
    );
  }
  console.error("[api] unexpected error:", err);
  const message = err instanceof Error ? err.message : "Внутренняя ошибка";
  return NextResponse.json({ error: message, code: "INTERNAL" }, { status: 500 });
}

/** Fails fast with a readable message instead of a silently cut off response. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

export async function GET() {
  try {
    const accounts = await listAccounts();
    return NextResponse.json({ accounts });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      cookie?: string;
    } | null;
    if (!body?.cookie) {
      return NextResponse.json(
        { error: "Передайте поле cookie", code: "BAD_REQUEST" },
        { status: 400 },
      );
    }
    const account = await withTimeout(
      addAccount(body.cookie),
      25000,
      "Roblox отвечает слишком долго. Подождите пару секунд и нажмите «Проверить и добавить» ещё раз.",
    );
    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
