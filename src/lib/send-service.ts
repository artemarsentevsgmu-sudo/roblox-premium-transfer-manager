import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transfers, type AccountRow } from "@/db/schema";
import {
  clientForAccount,
  getAllAccountRows,
  getAccountRow,
  refreshAccount,
  toAccountView,
  type AccountView,
} from "./accounts-service";
import {
  getUserById,
  getUserByUsername,
  RobloxApiError,
  type RobloxClient,
} from "./roblox";

export type TransferView = {
  id: string;
  accountId: string;
  accountUsername: string;
  recipientUserId: number;
  recipientUsername: string;
  amount: number;
  status: string;
  error: string | null;
  transferRequestId: string | null;
  createdAt: string;
};

export async function listTransfers(limit = 100): Promise<TransferView[]> {
  const rows = await db
    .select({
      t: transfers,
      accountUsername: accounts.username,
    })
    .from(transfers)
    .leftJoin(accounts, eq(transfers.accountId, accounts.id))
    .orderBy(desc(transfers.createdAt))
    .limit(limit);

  return rows.map(({ t, accountUsername }) => ({
    id: t.id,
    accountId: t.accountId,
    accountUsername: accountUsername ?? "—",
    recipientUserId: t.recipientUserId,
    recipientUsername: t.recipientUsername,
    amount: t.amount,
    status: t.status,
    error: t.error,
    transferRequestId: t.transferRequestId,
    createdAt: t.createdAt.toISOString(),
  }));
}

export async function resolveRecipient(input: string): Promise<{
  id: number;
  name: string;
}> {
  const trimmed = input.trim().replace(/^@/, "");
  if (!trimmed) throw new RobloxApiError("Укажите ник или ID получателя", 400);

  if (/^\d+$/.test(trimmed)) {
    const user = await getUserById(Number(trimmed));
    if (!user) {
      throw new RobloxApiError(`Пользователь с ID ${trimmed} не найден`, 404);
    }
    return { id: user.id, name: user.name };
  }

  const user = await getUserByUsername(trimmed);
  if (!user) {
    throw new RobloxApiError(`Пользователь «${trimmed}» не найден`, 404);
  }
  return { id: user.id, name: user.name };
}

// --- per-account send mutex -------------------------------------------------

const sendLocks = new Map<string, Promise<unknown>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = sendLocks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  sendLocks.set(key, next);
  try {
    return await next;
  } finally {
    if (sendLocks.get(key) === next) sendLocks.delete(key);
  }
}

// -----------------------------------------------------------------------------

function fitsSnapshot(view: AccountView, amount: number): boolean {
  if (!view.hasPlus || view.status === "invalid") return false;
  if (view.robuxBalance < amount) return false;
  if (!view.usage) return false;
  if (view.usage.remainingToday < amount) return false;
  if (view.usage.remainingThisMonth < amount) return false;
  if (view.perTransferLimit !== null && view.perTransferLimit < amount)
    return false;
  return true;
}

async function executeTransfer(
  row: AccountRow,
  client: RobloxClient,
  recipient: { id: number; name: string },
  amount: number,
): Promise<{ transferRequestId: string | null }> {
  const init = await client.initiateTransfer(recipient.id);
  await client.processTransfer(init.transferRequestId, amount);
  return { transferRequestId: init.transferRequestId };
}

export type SendResult = {
  transfer: TransferView;
  account: AccountView;
};

export async function performSend(params: {
  recipientInput: string;
  amountRaw: number;
  accountId?: string | null;
}): Promise<SendResult> {
  const amount = Math.floor(Number(params.amountRaw));
  if (!Number.isFinite(amount) || amount < 10) {
    throw new RobloxApiError("Минимальная сумма перевода — 10 R$", 400);
  }
  if (amount > 1_000_000) {
    throw new RobloxApiError("Слишком большая сумма", 400);
  }

  const [recipient, rows] = await Promise.all([
    resolveRecipient(params.recipientInput),
    getAllAccountRows(),
  ]);

  if (rows.length === 0) {
    throw new RobloxApiError("Нет добавленных аккаунтов", 400);
  }

  let candidates: AccountRow[];
  if (params.accountId) {
    const row = await getAccountRow(params.accountId);
    if (!row) throw new RobloxApiError("Выбранный аккаунт не найден", 404);
    candidates = [row];
  } else {
    // Auto-pick: spread load — prefer the biggest remaining daily limit.
    candidates = rows
      .map((row) => ({ row, view: toAccountView(row) }))
      .filter(({ view }) => fitsSnapshot(view, amount))
      .sort((a, b) => {
        const ra = a.view.usage?.remainingToday ?? 0;
        const rb = b.view.usage?.remainingToday ?? 0;
        if (rb !== ra) return rb - ra;
        return b.view.robuxBalance - a.view.robuxBalance;
      })
      .map(({ row }) => row);
    if (candidates.length === 0) {
      throw new RobloxApiError(
        "Нет аккаунта с достаточным балансом и остатком лимита для этой суммы",
        400,
      );
    }
  }

  const failures: string[] = [];

  for (const row of candidates.slice(0, 3)) {
    const outcome = await withLock(row.id, async () => {
      // Live refresh before sending — snapshots may be stale.
      let view: AccountView;
      try {
        view = await refreshAccount(row.id);
      } catch (err) {
        failures.push(
          `${row.username}: ${err instanceof Error ? err.message : "ошибка обновления"}`,
        );
        return null;
      }

      if (view.status === "invalid") {
        failures.push(`${row.username}: куки недействительна`);
        return null;
      }
      if (!view.hasPlus || !view.usage || view.dailyLimit === null) {
        failures.push(`${row.username}: нет Roblox Plus или лимиты недоступны`);
        return null;
      }
      if (view.robuxBalance < amount) {
        failures.push(
          `${row.username}: недостаточно робуксов (баланс ${view.robuxBalance} R$)`,
        );
        return null;
      }
      if (view.usage.remainingToday < amount) {
        failures.push(
          `${row.username}: дневной лимит почти исчерпан (осталось ${view.usage.remainingToday} R$)`,
        );
        return null;
      }
      if (view.usage.remainingThisMonth < amount) {
        failures.push(
          `${row.username}: месячный лимит почти исчерпан (осталось ${view.usage.remainingThisMonth} R$)`,
        );
        return null;
      }
      if (view.perTransferLimit !== null && view.perTransferLimit < amount) {
        failures.push(
          `${row.username}: лимит на один перевод ${view.perTransferLimit} R$`,
        );
        return null;
      }
      if (recipient.id === view.robloxUserId) {
        failures.push(`${row.username}: нельзя перевести самому себе`);
        return null;
      }

      const client = clientForAccount(row);
      try {
        const { transferRequestId } = await executeTransfer(
          row,
          client,
          recipient,
          amount,
        );
        const [recorded] = await db
          .insert(transfers)
          .values({
            accountId: row.id,
            recipientUserId: recipient.id,
            recipientUsername: recipient.name,
            amount,
            transferRequestId,
            status: "success",
          })
          .returning();

        // Refresh usage/balance after the send (best effort).
        let finalView = view;
        try {
          finalView = await refreshAccount(row.id);
        } catch {
          /* keep pre-send view */
        }

        return {
          transfer: {
            id: recorded.id,
            accountId: row.id,
            accountUsername: row.username,
            recipientUserId: recipient.id,
            recipientUsername: recipient.name,
            amount,
            status: "success",
            error: null,
            transferRequestId,
            createdAt: recorded.createdAt.toISOString(),
          },
          account: finalView,
        } satisfies SendResult;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Неизвестная ошибка перевода";
        await db.insert(transfers).values({
          accountId: row.id,
          recipientUserId: recipient.id,
          recipientUsername: recipient.name,
          amount,
          status: "failed",
          error: message,
        });
        failures.push(`${row.username}: ${message}`);
        return null;
      }
    });

    if (outcome) return outcome;
    if (params.accountId) break; // explicit account — no fallback
  }

  throw new RobloxApiError(
    failures.length
      ? failures.join("\n")
      : "Перевод не выполнен. Попробуйте позже.",
    400,
  );
}
