import type { CurrencyTransaction, SubscriptionWindow, TransferLimits } from "./roblox";
import type { UsageSnapshot } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

type NetTransfer = { amount: number; createdMs: number };

/** Net per-request sent amounts (sent minus refunds), newest first. */
function buildNetSentTransfers(
  transactions: CurrencyTransaction[],
  userId: number,
): NetTransfer[] {
  const grouped = new Map<string, NetTransfer>();

  for (const tx of transactions) {
    const details = tx.details ?? {};
    if (String(details.senderTargetId) !== String(userId)) continue;
    if (details.transferRole !== "Sender" && details.transferRole !== "SenderRefund")
      continue;

    const amount = Number(tx.currency?.amount);
    const createdMs = Date.parse(tx.created);
    if (!Number.isFinite(amount) || !Number.isFinite(createdMs)) continue;

    const key =
      details.transferRequestId || tx.idHash || `${tx.created}:${amount}`;
    const current = grouped.get(key) ?? { amount: 0, createdMs };

    if (details.transferRole === "Sender" && amount < 0) {
      current.amount += Math.abs(amount);
      current.createdMs = Math.min(current.createdMs, createdMs);
    } else if (details.transferRole === "SenderRefund" && amount > 0) {
      current.amount -= amount;
    }
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((t) => ({ ...t, amount: Math.max(0, t.amount) }))
    .filter((t) => t.amount > 0)
    .sort((a, b) => b.createdMs - a.createdMs);
}

export function computeUsage(
  transactions: CurrencyTransaction[],
  userId: number,
  limits: TransferLimits,
  subscriptionWindow: SubscriptionWindow,
  now = Date.now(),
): UsageSnapshot {
  const transfers = buildNetSentTransfers(transactions, userId);

  // Daily: rolling 24 hours. The limit frees up 24h after the transfer that
  // saturated it.
  const dayStart = now - DAY_MS;
  const dailyTransfers = transfers.filter((t) => t.createdMs >= dayStart);
  const sentToday = dailyTransfers.reduce((sum, t) => sum + t.amount, 0);

  let dailyResetMs: number | null = null;
  let running = 0;
  for (const t of [...dailyTransfers].sort((a, b) => a.createdMs - b.createdMs)) {
    running += t.amount;
    if (running >= limits.dailyLimit) {
      dailyResetMs = t.createdMs + DAY_MS;
      break;
    }
  }

  // Monthly: subscription billing window, fallback — rolling 30 days.
  const monthStart = subscriptionWindow?.start ?? now - 30 * DAY_MS;
  const monthEnd = subscriptionWindow?.end ?? now;
  const monthlyTransfers = transfers.filter(
    (t) => t.createdMs >= monthStart && t.createdMs < monthEnd,
  );
  const sentThisMonth = monthlyTransfers.reduce((sum, t) => sum + t.amount, 0);

  return {
    sentToday,
    sentThisMonth,
    remainingToday: Math.max(0, limits.dailyLimit - sentToday),
    remainingThisMonth: Math.max(0, limits.monthlyLimit - sentThisMonth),
    dailyResetMs,
    monthStartMs: subscriptionWindow?.start ?? null,
    monthEndMs: subscriptionWindow?.end ?? null,
    computedAt: now,
  };
}

export type AccountTier = "elevated" | "standard" | "no_plus" | "unknown";

export function classifyTier(
  hasPlus: boolean,
  limits: TransferLimits | null,
): AccountTier {
  if (!hasPlus) return "no_plus";
  if (!limits) return "unknown";
  if (limits.dailyLimit >= 5000 || limits.monthlyLimit >= 10000) return "elevated";
  if (limits.dailyLimit > 0) return "standard";
  return "unknown";
}
