import { NextResponse } from "next/server";
import {
  getAllAccountRows,
  refreshAccount,
  type AccountView,
} from "@/lib/accounts-service";
import { jsonError } from "../route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST() {
  try {
    const rows = await getAllAccountRows();
    const views: AccountView[] = [];
    let failures = 0;
    for (const row of rows) {
      try {
        views.push(await refreshAccount(row.id));
      } catch (err) {
        failures++;
        const view = (err as Error & { view?: AccountView })?.view;
        if (view) views.push(view);
      }
      if (rows.length > 1) await sleep(500); // be gentle with Roblox rate limits
    }
    return NextResponse.json({ accounts: views, failures });
  } catch (err) {
    return jsonError(err);
  }
}
