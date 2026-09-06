/**
 * Thin Roblox Web API client authenticated with a .ROBLOSECURITY cookie.
 *
 * Endpoints verified against the live site feature set ("Send Robux"):
 *  - GET  users.roblox.com/v1/users/authenticated
 *  - GET  economy.roblox.com/v1/users/{userId}/currency
 *  - GET  premiumfeatures.roblox.com/v1/users/{userId}/validate-membership
 *  - GET  apis.roblox.com/transfer/v1/robux-transfer/user-transfer-limit
 *  - GET  apis.roblox.com/subscriptions/v2/user/subscriptions?ProductType=Blackbird&...
 *  - GET  apis.roblox.com/transaction-records/v1/users/{userId}/transactions?transactionType=CurrencyTransfer
 *  - POST apis.roblox.com/transfer/v1/robux-transfer/initiate-transfer
 *  - POST apis.roblox.com/transfer/v1/robux-transfer/process-transfer/{transferRequestId}
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export class InvalidCookieError extends Error {
  constructor(message = "Куки недействительна или сессия истекла") {
    super(message);
    this.name = "InvalidCookieError";
  }
}

export class RobloxApiError extends Error {
  status: number;
  code?: number | string;
  constructor(message: string, status: number, code?: number | string) {
    super(message);
    this.name = "RobloxApiError";
    this.status = status;
    this.code = code;
  }
}

function extractRobloxError(body: unknown, fallback: string): string {
  try {
    const b = body as {
      errors?: Array<{ message?: string; code?: number | string }>;
      failureReason?: string;
      error?: string;
      message?: string;
    };
    if (b?.errors?.length) {
      return b.errors.map((e) => e.message || `Ошибка ${e.code}`).join("; ");
    }
    if (b?.failureReason) return String(b.failureReason);
    if (b?.error) return String(b.error);
    if (b?.message) return String(b.message);
  } catch {
    /* ignore */
  }
  return fallback;
}

export type AuthedUser = { id: number; name: string; displayName: string };

export type TransferLimits = {
  dailyLimit: number;
  monthlyLimit: number;
  perTransferLimit: number | null;
};

export type SubscriptionWindow = { start: number; end: number } | null;

export type CurrencyTransaction = {
  created: string;
  currency?: { amount?: number };
  details?: {
    senderTargetId?: number | string;
    receiverTargetId?: number | string;
    transferRole?: string;
    transferRequestId?: string;
  };
  idHash?: string;
};

export class RobloxClient {
  private cookie: string;
  private csrfToken: string | null = null;

  constructor(cookie: string) {
    this.cookie = cookie;
  }

  private async request<T = unknown>(
    url: string,
    init: { method?: string; body?: unknown } = {},
    allowCsrfRetry = true,
  ): Promise<T> {
    const method = init.method ?? "GET";
    const headers: Record<string, string> = {
      Cookie: `.ROBLOSECURITY=${this.cookie}`,
      Accept: "application/json",
      "User-Agent": UA,
      Referer: "https://www.roblox.com/my/account",
      Origin: "https://www.roblox.com",
    };
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      if (this.csrfToken) headers["X-CSRF-TOKEN"] = this.csrfToken;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });

    // Roblox issues/rotates the CSRF token via a 403 response header.
    const newToken = res.headers.get("x-csrf-token");
    if (res.status === 403 && newToken) {
      this.csrfToken = newToken;
      if (allowCsrfRetry) return this.request<T>(url, init, false);
    }

    if (res.status === 401) {
      throw new InvalidCookieError();
    }

    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!res.ok) {
      const challengeId = res.headers.get("rblx-challenge-id");
      if (challengeId) {
        throw new RobloxApiError(
          "Roblox запросил подтверждение действия (challenge / 2FA). Выполните перевод с этого аккаунта в браузере один раз, затем повторите.",
          res.status,
        );
      }
      if (res.status === 429) {
        throw new RobloxApiError(
          "Слишком много запросов к Roblox (429). Подождите немного и повторите.",
          res.status,
        );
      }
      throw new RobloxApiError(
        extractRobloxError(body, `Roblox вернул ошибку ${res.status}`),
        res.status,
      );
    }

    return body as T;
  }

  /** Warm up CSRF token (optional; happens lazily on first POST anyway). */
  async ensureCsrf(): Promise<void> {
    if (this.csrfToken) return;
    try {
      await fetch("https://auth.roblox.com/v2/logout", {
        method: "POST",
        headers: {
          Cookie: `.ROBLOSECURITY=${this.cookie}`,
          "User-Agent": UA,
        },
        cache: "no-store",
      }).then(async (res) => {
        const token = res.headers.get("x-csrf-token");
        if (token) this.csrfToken = token;
      });
    } catch {
      /* lazy retry will handle it */
    }
  }

  async getAuthenticatedUser(): Promise<AuthedUser> {
    return this.request<AuthedUser>(
      "https://users.roblox.com/v1/users/authenticated",
    );
  }

  async getRobuxBalance(userId: number): Promise<number> {
    const body = await this.request<{ robux?: number }>(
      `https://economy.roblox.com/v1/users/${userId}/currency`,
    );
    const robux = Number(body?.robux);
    return Number.isFinite(robux) ? robux : 0;
  }

  async getHasPlus(userId: number): Promise<boolean> {
    try {
      const body = await this.request<boolean>(
        `https://premiumfeatures.roblox.com/v1/users/${userId}/validate-membership`,
      );
      return body === true;
    } catch {
      return false;
    }
  }

  /** Transfer limits. Throws RobloxApiError when unavailable (e.g. no Plus). */
  async getTransferLimits(): Promise<TransferLimits> {
    const body = await this.request<Record<string, unknown>>(
      "https://apis.roblox.com/transfer/v1/robux-transfer/user-transfer-limit",
    );
    const dailyLimit = Number(body?.dailyLimit);
    const monthlyLimit = Number(body?.monthlyLimit);
    if (!Number.isFinite(dailyLimit) || !Number.isFinite(monthlyLimit)) {
      throw new RobloxApiError(
        "Roblox не вернул лимиты переводов (возможно, на аккаунте нет Roblox Plus).",
        200,
      );
    }
    const perTransfer = Number(body?.perTransferLimit);
    return {
      dailyLimit,
      monthlyLimit,
      perTransferLimit: Number.isFinite(perTransfer) ? perTransfer : null,
    };
  }

  /**
   * Active Roblox Plus ("Blackbird") subscription — defines the monthly
   * billing window used by Roblox for the monthly transfer limit.
   */
  async getSubscriptionWindow(): Promise<SubscriptionWindow> {
    try {
      const body = await this.request<{ subscriptions?: unknown[] }>(
        `https://apis.roblox.com/subscriptions/v2/user/subscriptions?ProductType=Blackbird&ExpirationTimestampMsStart=${Date.now()}&ResultsPerPage=100`,
      );
      const sub = Array.isArray(body?.subscriptions)
        ? (body.subscriptions[0] as Record<string, unknown> | undefined)
        : undefined;
      if (!sub) return null;
      const activation = Number(sub.activationTimestampMs);
      const expiration = Number(sub.expirationTimestampMs);
      const renewal = Number(sub.nextRenewalTimestampMs);
      const now = Date.now();
      const end =
        Number.isFinite(renewal) && renewal > now
          ? renewal
          : Number.isFinite(expiration) && expiration > now
            ? expiration
            : null;
      if (!end) return null;
      const periodCount =
        Number(
          (sub.productInfo as Record<string, unknown> | undefined)
            ?.periodCount,
        ) || 1;
      const periodType = String(
        sub.periodType ??
          (sub.productInfo as Record<string, unknown> | undefined)
            ?.periodType ??
          "Month",
      );
      let start: number;
      if (periodType === "Year") start = addMonths(end, -12 * periodCount);
      else if (periodType === "Week") start = end - 7 * 86400000 * periodCount;
      else start = addMonths(end, -periodCount);
      if (Number.isFinite(activation) && start < activation) start = activation;
      return { start, end };
    } catch {
      return null;
    }
  }

  /**
   * CurrencyTransfer history (sent/received via Send Robux), newest first.
   * Stops paging early once we pass `stopOlderThanMs` — older records cannot
   * affect the daily/monthly usage windows, so no reason to keep fetching.
   */
  async getCurrencyTransfers(
    userId: number,
    stopOlderThanMs = 0,
    maxPages = 8,
  ): Promise<CurrencyTransaction[]> {
    const all: CurrencyTransaction[] = [];
    let cursor = "";
    for (let page = 0; page < maxPages; page++) {
      const body = await this.request<{
        data?: CurrencyTransaction[];
        nextPageCursor?: string | null;
      }>(
        `https://apis.roblox.com/transaction-records/v1/users/${userId}/transactions?cursor=${encodeURIComponent(cursor)}&limit=100&transactionType=CurrencyTransfer&itemPricingType=PaidAndLimited`,
      );
      const items = Array.isArray(body?.data) ? body.data : [];
      all.push(...items);
      if (!body?.nextPageCursor || items.length === 0) break;
      // Early stop: oldest record in this page is already out of the window.
      if (stopOlderThanMs > 0) {
        const oldestMs = Date.parse(items[items.length - 1]?.created ?? "");
        if (Number.isFinite(oldestMs) && oldestMs < stopOlderThanMs) break;
      }
      cursor = body.nextPageCursor;
    }
    return all;
  }

  /** Step 1 of Send Robux: reserves a transfer request. */
  async initiateTransfer(
    recipientId: number,
  ): Promise<{ transferRequestId: string; raw: unknown }> {
    const body = await this.request<Record<string, unknown>>(
      "https://apis.roblox.com/transfer/v1/robux-transfer/initiate-transfer",
      {
        method: "POST",
        body: { transferOrigin: 1, recipientId },
      },
    );
    const transferRequestId = body?.transferRequestId;
    if (!transferRequestId || typeof transferRequestId !== "string") {
      throw new RobloxApiError(
        extractRobloxError(
          body,
          "Roblox не создал запрос на перевод (initiate-transfer).",
        ),
        200,
      );
    }
    return { transferRequestId, raw: body };
  }

  /** Step 2 of Send Robux: executes the reserved transfer. */
  async processTransfer(
    transferRequestId: string,
    robuxAmount: number,
  ): Promise<unknown> {
    return this.request(
      `https://apis.roblox.com/transfer/v1/robux-transfer/process-transfer/${encodeURIComponent(transferRequestId)}`,
      { method: "POST", body: { robuxAmount } },
    );
  }

  async getAvatarHeadshot(userId: number): Promise<string | null> {
    try {
      const body = await this.request<{
        data?: Array<{ imageUrl?: string }>;
      }>(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`,
      );
      return body?.data?.[0]?.imageUrl ?? null;
    } catch {
      return null;
    }
  }
}

function addMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const daysInTarget = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, daysInTarget));
  return date.getTime();
}

/** Resolve a username to a Roblox user (public endpoint, no cookie needed). */
export async function getUserByUsername(
  username: string,
): Promise<{ id: number; name: string; displayName: string } | null> {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    data?: Array<{ id: number; name: string; displayName: string }>;
  };
  return body?.data?.[0] ?? null;
}

/** Resolve a user id to a Roblox user (public endpoint, no cookie needed). */
export async function getUserById(
  userId: number,
): Promise<{ id: number; name: string; displayName: string } | null> {
  try {
    const res = await fetch(`https://users.roblox.com/v1/users/${userId}`, {
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      id: number;
      name: string;
      displayName: string;
    };
    return body?.id ? body : null;
  } catch {
    return null;
  }
}
