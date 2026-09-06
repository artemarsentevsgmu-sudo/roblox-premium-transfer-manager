import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, type AccountRow, type UsageSnapshot } from "@/db/schema";
import { decryptCookie, encryptCookie, normalizeCookieInput } from "./crypto";
import {
  InvalidCookieError,
  RobloxApiError,
  RobloxClient,
  type CurrencyTransaction,
  type SubscriptionWindow,
  type TransferLimits,
} from "./roblox";
import { classifyTier, computeUsage } from "./limits";

export type AccountView = {
  id: string;
  robloxUserId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  robuxBalance: number;
  hasPlus: boolean;
  tier: string;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  perTransferLimit: number | null;
  usage: UsageSnapshot | null;
  status: string;
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
};

export function toAccountView(row: AccountRow): AccountView {
  return {
    id: row.id,
    robloxUserId: row.robloxUserId,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    robuxBalance: row.robuxBalance,
    hasPlus: row.hasPlus,
    tier: row.tier,
    dailyLimit: row.dailyLimit,
    monthlyLimit: row.monthlyLimit,
    perTransferLimit: row.perTransferLimit,
    usage: row.usage ?? null,
    status: row.status,
    lastError: row.lastError,
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAccounts(): Promise<AccountView[]> {
  const rows = await db.select().from(accounts).orderBy(accounts.createdAt);
  return rows.map(toAccountView);
}

type Snapshot = {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  balance: number;
  hasPlus: boolean;
  limits: TransferLimits | null;
  subscriptionWindow: SubscriptionWindow;
  transactions: CurrencyTransaction[];
  limitsError: string | null;
};

export async function fetchAccountSnapshot(
  client: RobloxClient,
): Promise<Snapshot> {
  const user = await client.getAuthenticatedUser(); // throws InvalidCookieError
  const userId = user.id;

  // Everything independent fan-outs in parallel to keep the request fast.
  const [balance, hasPlus, avatarUrl, limitsResult] = await Promise.all([
    client.getRobuxBalance(userId).catch(() => 0),
    client.getHasPlus(userId),
    client.getAvatarHeadshot(userId),
    client
      .getTransferLimits()
      .then((limits) => ({ limits, error: null as string | null }))
      .catch((err: unknown) => {
        if (err instanceof InvalidCookieError) throw err;
        return {
          limits: null,
          error:
            err instanceof RobloxApiError
              ? err.message
              : "Не удалось получить лимиты переводов",
        };
      }),
  ]);

  const limits = limitsResult.limits;
  const limitsError = limitsResult.error;

  let subscriptionWindow: SubscriptionWindow = null;
  let transactions: CurrencyTransaction[] = [];
  if (limits) {
    // Monthly usage needs the billing window first; then we only page
    // transfer history back to the earliest relevant timestamp.
    subscriptionWindow = await client.getSubscriptionWindow();
    const stopOlderThan = Math.min(
      subscriptionWindow?.start ?? Date.now() - 30 * 86400000,
      Date.now() - 25 * 3600000,
    );
    transactions = await client
      .getCurrencyTransfers(userId, stopOlderThan, 8)
      .catch(() => [] as CurrencyTransaction[]);
  }

  return {
    userId,
    username: user.name,
    displayName: user.displayName,
    avatarUrl,
    balance,
    hasPlus,
    limits,
    subscriptionWindow,
    transactions,
    limitsError,
  };
}

export async function addAccount(rawCookie: string): Promise<AccountView> {
  const cookie = normalizeCookieInput(rawCookie);
  if (!cookie) {
    throw new RobloxApiError(
      "Не похоже на .ROBLOSECURITY куки. Вставьте значение куки целиком.",
      400,
    );
  }

  const client = new RobloxClient(cookie);
  const snap = await fetchAccountSnapshot(client); // throws InvalidCookieError

  const usage = snap.limits
    ? computeUsage(
        snap.transactions,
        snap.userId,
        snap.limits,
        snap.subscriptionWindow,
      )
    : null;
  const tier = classifyTier(snap.hasPlus, snap.limits);

  const values = {
    robloxUserId: snap.userId,
    username: snap.username,
    displayName: snap.displayName,
    avatarUrl: snap.avatarUrl,
    robuxBalance: snap.balance,
    hasPlus: snap.hasPlus,
    tier,
    dailyLimit: snap.limits?.dailyLimit ?? null,
    monthlyLimit: snap.limits?.monthlyLimit ?? null,
    perTransferLimit: snap.limits?.perTransferLimit ?? null,
    usage,
    cookieCipher: encryptCookie(cookie),
    status: "active",
    lastError: snap.limitsError,
    lastCheckedAt: new Date(),
  };

  const [row] = await db
    .insert(accounts)
    .values(values)
    .onConflictDoUpdate({
      target: accounts.robloxUserId,
      set: values,
    })
    .returning();

  return toAccountView(row);
}

export async function refreshAccount(accountId: string): Promise<AccountView> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!row) throw new RobloxApiError("Аккаунт не найден", 404);

  let cookie: string;
  try {
    cookie = decryptCookie(row.cookieCipher);
  } catch {
    throw new RobloxApiError(
      "Не удалось расшифровать куки (сменился ключ?). Добавьте аккаунт заново.",
      500,
    );
  }

  const client = new RobloxClient(cookie);
  try {
    const snap = await fetchAccountSnapshot(client);
    const usage = snap.limits
      ? computeUsage(
          snap.transactions,
          snap.userId,
          snap.limits,
          snap.subscriptionWindow,
        )
      : null;
    const tier = classifyTier(snap.hasPlus, snap.limits);

    const [updated] = await db
      .update(accounts)
      .set({
        username: snap.username,
        displayName: snap.displayName,
        avatarUrl: snap.avatarUrl,
        robuxBalance: snap.balance,
        hasPlus: snap.hasPlus,
        tier,
        dailyLimit: snap.limits?.dailyLimit ?? null,
        monthlyLimit: snap.limits?.monthlyLimit ?? null,
        perTransferLimit: snap.limits?.perTransferLimit ?? null,
        usage,
        status: "active",
        lastError: snap.limitsError,
        lastCheckedAt: new Date(),
      })
      .where(eq(accounts.id, row.id))
      .returning();
    return toAccountView(updated);
  } catch (err) {
    const invalid = err instanceof InvalidCookieError;
    const message = err instanceof Error ? err.message : "Ошибка обновления";
    const [updated] = await db
      .update(accounts)
      .set({
        status: invalid ? "invalid" : "error",
        lastError: message,
        lastCheckedAt: new Date(),
      })
      .where(eq(accounts.id, row.id))
      .returning();
    if (invalid) {
      const e = new InvalidCookieError(message);
      (e as Error & { view?: AccountView }).view = toAccountView(updated);
      throw e;
    }
    return toAccountView(updated);
  }
}

export async function deleteAccount(accountId: string): Promise<void> {
  await db.delete(accounts).where(eq(accounts.id, accountId));
}

export function clientForAccount(row: AccountRow): RobloxClient {
  return new RobloxClient(decryptCookie(row.cookieCipher));
}

export async function getAccountRow(
  accountId: string,
): Promise<AccountRow | null> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  return row ?? null;
}

export async function getAllAccountRows(): Promise<AccountRow[]> {
  return db.select().from(accounts).orderBy(accounts.createdAt);
}
