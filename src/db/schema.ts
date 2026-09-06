import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

export type UsageSnapshot = {
  sentToday: number;
  sentThisMonth: number;
  remainingToday: number;
  remainingThisMonth: number;
  dailyResetMs: number | null;
  monthStartMs: number | null;
  monthEndMs: number | null;
  computedAt: number;
};

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  robloxUserId: bigint("roblox_user_id", { mode: "number" }).notNull().unique(),
  username: text("username").notNull(),
  displayName: text("display_name").notNull().default(""),
  avatarUrl: text("avatar_url"),
  robuxBalance: integer("robux_balance").notNull().default(0),
  hasPlus: boolean("has_plus").notNull().default(false),
  // 'elevated' (5000/10000) | 'standard' (500/1000) | 'no_plus' | 'unknown'
  tier: text("tier").notNull().default("unknown"),
  dailyLimit: integer("daily_limit"),
  monthlyLimit: integer("monthly_limit"),
  perTransferLimit: integer("per_transfer_limit"),
  usage: jsonb("usage").$type<UsageSnapshot>(),
  cookieCipher: text("cookie_cipher").notNull(),
  // 'active' | 'invalid' | 'error'
  status: text("status").notNull().default("active"),
  lastError: text("last_error"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const transfers = pgTable("transfers", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  recipientUserId: bigint("recipient_user_id", { mode: "number" }).notNull(),
  recipientUsername: text("recipient_username").notNull().default(""),
  amount: integer("amount").notNull(),
  transferRequestId: text("transfer_request_id"),
  // 'success' | 'failed'
  status: text("status").notNull().default("success"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AccountRow = typeof accounts.$inferSelect;
export type TransferRow = typeof transfers.$inferSelect;
