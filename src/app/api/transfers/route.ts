import { NextRequest, NextResponse } from "next/server";
import { listTransfers, performSend } from "@/lib/send-service";
import { jsonError, withTimeout } from "../accounts/route";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    const transfers = await listTransfers();
    return NextResponse.json({ transfers });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      recipient?: string;
      amount?: number;
      accountId?: string | null;
    } | null;
    if (!body?.recipient || body.amount === undefined) {
      return NextResponse.json(
        {
          error: "Передайте recipient (ник или ID) и amount",
          code: "BAD_REQUEST",
        },
        { status: 400 },
      );
    }
    const result = await withTimeout(
      performSend({
        recipientInput: String(body.recipient),
        amountRaw: Number(body.amount),
        accountId: body.accountId ?? null,
      }),
      45000,
      "Roblox отвечает слишком долго. Проверьте баланс получателя и повторите попытку.",
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
