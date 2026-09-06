import type { AccountView } from "@/lib/accounts-service";
import type { TransferView, SendResult } from "@/lib/send-service";

async function parse<T>(res: Response): Promise<T> {
  const raw = await res.text().catch(() => "");
  let body: (T & { error?: string }) | null = null;
  if (raw) {
    try {
      body = JSON.parse(raw) as T & { error?: string };
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    throw new Error(body?.error || `Ошибка запроса (${res.status})`);
  }
  if (body === null) {
    throw new Error(
      "Сервер вернул пустой ответ — вероятно, запрос к Roblox занял слишком много времени. Попробуйте ещё раз.",
    );
  }
  return body;
}

export const api = {
  async getAccounts(): Promise<AccountView[]> {
    const res = await fetch("/api/accounts", { cache: "no-store" });
    return (await parse<{ accounts: AccountView[] }>(res)).accounts;
  },

  async addAccount(cookie: string): Promise<AccountView> {
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookie }),
    });
    return (await parse<{ account: AccountView }>(res)).account;
  },

  async refreshAccount(id: string): Promise<AccountView> {
    const res = await fetch(`/api/accounts/${id}/refresh`, { method: "POST" });
    const body = (await res.json().catch(() => null)) as {
      account?: AccountView;
      error?: string;
    } | null;
    if (!res.ok) {
      const err = new Error(body?.error || "Ошибка обновления");
      (err as Error & { account?: AccountView }).account = body?.account;
      throw err;
    }
    if (!body?.account) throw new Error("Пустой ответ сервера");
    return body.account;
  },

  async refreshAll(): Promise<{ accounts: AccountView[]; failures: number }> {
    const res = await fetch("/api/accounts/refresh-all", { method: "POST" });
    return parse<{ accounts: AccountView[]; failures: number }>(res);
  },

  async deleteAccount(id: string): Promise<void> {
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    await parse<{ ok: boolean }>(res);
  },

  async getTransfers(): Promise<TransferView[]> {
    const res = await fetch("/api/transfers", { cache: "no-store" });
    return (await parse<{ transfers: TransferView[] }>(res)).transfers;
  },

  async sendRobux(payload: {
    recipient: string;
    amount: number;
    accountId: string | null;
  }): Promise<SendResult> {
    const res = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return parse<SendResult>(res);
  },
};
