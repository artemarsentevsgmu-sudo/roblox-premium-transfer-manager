"use client";

import { useState } from "react";
import {
  CalendarDays,
  Crown,
  Gauge,
  RotateCw,
  Send,
  Timer,
  Trash2,
  TriangleAlert,
  Zap,
} from "lucide-react";
import type { AccountView } from "@/lib/accounts-service";
import { fmtDate, fmtNum, fmtTime, relTime } from "@/lib/format";
import { Chip, LimitBar, RobuxIcon } from "./ui";

const BLUE_GRADIENT = "linear-gradient(90deg,#2563eb,#60a5fa)";
const VIOLET_GRADIENT = "linear-gradient(90deg,#6366f1,#a5b4fc)";
const RED_GRADIENT = "linear-gradient(90deg,#f43f5e,#fb7185)";

export function tierChip(tier: string, daily: number | null, monthly: number | null) {
  if (tier === "elevated") {
    return (
      <Chip tone="blue">
        <Zap className="h-3 w-3" />
        Сильный · {fmtNum(daily)}/{fmtNum(monthly)}
      </Chip>
    );
  }
  if (tier === "standard") {
    return (
      <Chip tone="sky">
        <Gauge className="h-3 w-3" />
        Слабый · {fmtNum(daily)}/{fmtNum(monthly)}
      </Chip>
    );
  }
  if (tier === "no_plus") {
    return <Chip tone="slate">Без Plus</Chip>;
  }
  return <Chip tone="slate">Лимиты неизвестны</Chip>;
}

function LimitBlock({
  icon: Icon,
  label,
  used,
  limit,
  remaining,
  gradient,
}: {
  icon: typeof Timer;
  label: string;
  used: number;
  limit: number;
  remaining: number;
  gradient: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-ink-soft)]">
          <Icon className="h-3.5 w-3.5 text-[var(--color-ink-mute)]" />
          {label}
          <span className="text-[var(--color-ink-mute)]">
            {fmtNum(used)} / {fmtNum(limit)}
          </span>
        </span>
        <span
          className={`text-[12px] font-semibold ${remaining === 0 ? "text-rose-500" : "text-[var(--color-ink)]"}`}
        >
          осталось {fmtNum(remaining)} R$
        </span>
      </div>
      <LimitBar used={used} limit={limit} gradient={gradient} />
    </div>
  );
}

export function AccountCard({
  account: a,
  index,
  refreshing,
  onRefresh,
  onDelete,
  onSend,
}: {
  account: AccountView;
  index: number;
  refreshing: boolean;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onSend: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const usage = a.usage;
  const dailyRemaining = usage?.remainingToday ?? null;
  const monthlyRemaining = usage?.remainingThisMonth ?? null;

  const statusDot =
    a.status === "active"
      ? "bg-emerald-500 [animation:pulse-dot_2.4s_infinite]"
      : a.status === "invalid"
        ? "bg-red-500"
        : "bg-amber-400";

  return (
    <div
      className={`anim-fade-up card-hover relative flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-[var(--shadow-card)] ${
        a.status === "invalid" ? "border-red-200" : "border-[var(--color-line)]"
      }`}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      {/* header */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          {a.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={a.avatarUrl}
              alt={a.username}
              className="h-11 w-11 rounded-full bg-slate-100 ring-2 ring-[var(--color-brand-soft)]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[15px] font-bold text-[var(--color-brand)] ring-2 ring-[var(--color-brand-soft)]">
              {a.username.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span
            className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-white ${statusDot}`}
            title={
              a.status === "active"
                ? "Активен"
                : a.status === "invalid"
                  ? "Сессия недействительна"
                  : "Ошибка"
            }
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-tight text-[var(--color-ink)]">
            {a.displayName || a.username}
          </p>
          <p className="truncate text-[12.5px] text-[var(--color-ink-mute)]">
            @{a.username} · ID {a.robloxUserId}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onSend(a.id)}
            className="btn-press rounded-lg p-2 text-[var(--color-ink-mute)] hover:bg-[var(--color-brand-soft)] hover:text-[var(--color-brand)]"
            title="Отправить с этого аккаунта"
          >
            <Send className="h-4 w-4" />
          </button>
          <button
            onClick={() => onRefresh(a.id)}
            disabled={refreshing}
            className="btn-press rounded-lg p-2 text-[var(--color-ink-mute)] hover:bg-[var(--color-brand-soft)] hover:text-[var(--color-brand)] disabled:opacity-60"
            title="Обновить данные"
          >
            <RotateCw className={`h-4 w-4 ${refreshing ? "spin" : ""}`} />
          </button>
          <button
            onClick={() => {
              if (confirming) {
                onDelete(a.id);
                setConfirming(false);
              } else {
                setConfirming(true);
                setTimeout(() => setConfirming(false), 2600);
              }
            }}
            className={`btn-press rounded-lg p-2 ${
              confirming
                ? "bg-red-50 text-red-600"
                : "text-[var(--color-ink-mute)] hover:bg-red-50 hover:text-red-500"
            }`}
            title={confirming ? "Нажмите ещё раз для удаления" : "Удалить аккаунт"}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {tierChip(a.tier, a.dailyLimit, a.monthlyLimit)}
        {a.hasPlus ? (
          <Chip tone="green">
            <Crown className="h-3 w-3" /> Roblox Plus
          </Chip>
        ) : (
          <Chip tone="slate">
            <Crown className="h-3 w-3 opacity-60" /> Нет Plus
          </Chip>
        )}
        {a.perTransferLimit !== null && (
          <Chip tone="violet">до {fmtNum(a.perTransferLimit)} R$ за раз</Chip>
        )}
      </div>

      {/* balance */}
      <div className="flex items-end justify-between gap-2 rounded-xl bg-[var(--color-ground)] px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wider text-[var(--color-ink-mute)] uppercase">
            Баланс
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[22px] leading-none font-bold tracking-tight text-[var(--color-ink)]">
            <RobuxIcon className="h-5 w-5 text-[var(--color-brand)]" />
            {fmtNum(a.robuxBalance)}
            <span className="text-[13px] font-semibold text-[var(--color-ink-mute)]">
              R$
            </span>
          </p>
        </div>
      </div>

      {/* limits */}
      {usage && a.dailyLimit !== null && a.monthlyLimit !== null ? (
        <div className="flex flex-col gap-3.5">
          <LimitBlock
            icon={Timer}
            label="День"
            used={usage.sentToday}
            limit={a.dailyLimit}
            remaining={dailyRemaining ?? 0}
            gradient={dailyRemaining === 0 ? RED_GRADIENT : BLUE_GRADIENT}
          />
          <LimitBlock
            icon={CalendarDays}
            label="Месяц"
            used={usage.sentThisMonth}
            limit={a.monthlyLimit}
            remaining={monthlyRemaining ?? 0}
            gradient={monthlyRemaining === 0 ? RED_GRADIENT : VIOLET_GRADIENT}
          />
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-[12.5px] leading-snug text-[var(--color-ink-soft)]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            {a.hasPlus
              ? a.lastError ||
                "Roblox не вернул лимиты переводов. Нажмите «Обновить»."
              : "Переводы недоступны — на аккаунте нет Roblox Plus."}
          </span>
        </div>
      )}

      {a.status === "invalid" && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-[12.5px] leading-snug text-red-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Сессия недействительна. Удалите аккаунт и добавьте куки заново.</span>
        </div>
      )}

      {/* footer */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--color-line)] pt-3 text-[11.5px] text-[var(--color-ink-mute)]">
        <span>обновлено {relTime(a.lastCheckedAt)}</span>
        <span className="text-right">
          {usage?.dailyResetMs && dailyRemaining === 0
            ? `дневной лимит до ${fmtTime(usage.dailyResetMs)}`
            : usage?.monthEndMs
              ? `месяц до ${fmtDate(usage.monthEndMs)}`
              : "окно: 24ч / биллинг-период"}
        </span>
      </div>
    </div>
  );
}
