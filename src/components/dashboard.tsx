"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Gauge,
  Info,
  Layers,
  RefreshCw,
  Send,
  TriangleAlert,
  UserRoundPlus,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import type { AccountView } from "@/lib/accounts-service";
import type { SendResult, TransferView } from "@/lib/send-service";
import { api } from "@/lib/client-api";
import { fmtNum } from "@/lib/format";
import { AccountCard } from "./account-card";
import { AddAccountModal, SendRobuxModal } from "./modals";
import { TransferHistory } from "./history";
import { RobuxIcon, ToastProvider, useToast } from "./ui";

/* ------------------------------ stats blocks ------------------------------ */

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  delay,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
  delay: number;
}) {
  return (
    <div
      className="anim-fade-up relative overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-card)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#2563eb] to-[#7dd3fc]" />
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold tracking-wider text-[var(--color-ink-mute)] uppercase">
          {label}
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-[26px] leading-none font-bold tracking-tight text-[var(--color-ink)] tabular-nums">
        {value}
      </p>
      <p className="mt-1.5 text-[12px] text-[var(--color-ink-mute)]">{hint}</p>
    </div>
  );
}

/* --------------------------------- section -------------------------------- */

function Section({
  icon: Icon,
  title,
  desc,
  count,
  tone,
  children,
}: {
  icon: typeof Zap;
  title: string;
  desc: string;
  count: number;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-[var(--color-ink)]">
            {title}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-bold text-[var(--color-ink-soft)]">
              {count}
            </span>
          </h2>
          <p className="text-[12.5px] text-[var(--color-ink-mute)]">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/* -------------------------------- dashboard ------------------------------- */

function DashboardInner() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [transfers, setTransfers] = useState<TransferView[] | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendPreset, setSendPreset] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const upsertAccount = useCallback((acc: AccountView) => {
    setAccounts((prev) => {
      if (!prev) return [acc];
      const idx = prev.findIndex((a) => a.id === acc.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = acc;
        return copy;
      }
      return [...prev, acc];
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const [accs, txs] = await Promise.all([
        api.getAccounts(),
        api.getTransfers(),
      ]);
      setAccounts(accs);
      setTransfers(txs);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Ошибка загрузки");
    }
  }, []);

  useEffect(() => {
    load();
    // Silent DB-level refresh (does NOT call Roblox) to keep tabs in sync.
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  /* ------------------------------- handlers ------------------------------- */

  const handleAdd = async (cookie: string) => {
    const acc = await api.addAccount(cookie);
    upsertAccount(acc);
    const tierText =
      acc.tier === "elevated"
        ? `сильный аккаунт — лимит ${fmtNum(acc.dailyLimit)}/${fmtNum(acc.monthlyLimit)} R$`
        : acc.tier === "standard"
          ? `слабый аккаунт — лимит ${fmtNum(acc.dailyLimit)}/${fmtNum(acc.monthlyLimit)} R$`
          : acc.hasPlus
            ? "Plus есть, лимиты уточняются"
            : "без Roblox Plus";
    toast.push("success", `@${acc.username} добавлен: ${tierText}. Баланс: ${fmtNum(acc.robuxBalance)} R$`);
  };

  const handleRefresh = async (id: string) => {
    setRefreshingIds((s) => new Set(s).add(id));
    try {
      const acc = await api.refreshAccount(id);
      upsertAccount(acc);
      if (acc.status === "active") toast.push("info", `@${acc.username} обновлён`);
      else toast.push("error", `@${acc.username}: ${acc.lastError ?? "ошибка"}`);
    } catch (err) {
      const view = (err as Error & { account?: AccountView }).account;
      if (view) upsertAccount(view);
      toast.push("error", err instanceof Error ? err.message : "Ошибка обновления");
    } finally {
      setRefreshingIds((s) => {
        const copy = new Set(s);
        copy.delete(id);
        return copy;
      });
    }
  };

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    try {
      const res = await api.refreshAll();
      setAccounts(res.accounts);
      toast.push(
        res.failures ? "error" : "success",
        res.failures
          ? `Обновлено ${res.accounts.length} акк., ошибок: ${res.failures}`
          : `Обновлено аккаунтов: ${res.accounts.length}`,
      );
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Ошибка");
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleDelete = async (id: string) => {
    const acc = accounts?.find((a) => a.id === id);
    setAccounts((prev) => prev?.filter((a) => a.id !== id) ?? prev);
    try {
      await api.deleteAccount(id);
      toast.push("info", `@${acc?.username ?? "аккаунт"} удалён`);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Не удалось удалить");
      load();
    }
  };

  const handleSend = async (payload: {
    recipient: string;
    amount: number;
    accountId: string | null;
  }): Promise<SendResult> => {
    const res = await api.sendRobux(payload);
    upsertAccount(res.account);
    setTransfers((prev) => [res.transfer, ...(prev ?? [])]);
    toast.push(
      "success",
      `Отправлено ${fmtNum(res.transfer.amount)} R$ → @${res.transfer.recipientUsername} с @${res.account.username}`,
    );
    return res;
  };

  /* --------------------------------- stats -------------------------------- */

  const stats = useMemo(() => {
    const list = accounts ?? [];
    return {
      total: list.length,
      active: list.filter((a) => a.status === "active").length,
      balance: list.reduce((s, a) => s + a.robuxBalance, 0),
      dayLeft: list.reduce((s, a) => s + (a.usage?.remainingToday ?? 0), 0),
      monthLeft: list.reduce((s, a) => s + (a.usage?.remainingThisMonth ?? 0), 0),
      elevated: list.filter((a) => a.tier === "elevated"),
      standard: list.filter((a) => a.tier === "standard"),
      other: list.filter((a) => a.tier !== "elevated" && a.tier !== "standard"),
    };
  }, [accounts]);

  const renderCards = (list: AccountView[]) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {list.map((a, i) => (
        <AccountCard
          key={a.id}
          account={a}
          index={i}
          refreshing={refreshingIds.has(a.id)}
          onRefresh={handleRefresh}
          onDelete={handleDelete}
          onSend={(id) => {
            setSendPreset(id);
            setSendOpen(true);
          }}
        />
      ))}
    </div>
  );

  /* --------------------------------- render -------------------------------- */

  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-20 sm:px-6 lg:px-10">
      {/* header */}
      <header className="sticky top-0 z-40 -mx-4 border-b border-[var(--color-line)]/80 bg-white/75 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563eb] to-[#60a5fa] text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,0.8)]">
              <Layers className="h-4.5 w-4.5" />
            </span>
            <div className="leading-tight">
              <p className="text-[16px] font-bold tracking-tight text-[var(--color-ink)]">
                RobuxFlow
              </p>
              <p className="hidden text-[11.5px] text-[var(--color-ink-mute)] sm:block">
                продажа робуксов через Roblox Plus
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshAll}
              disabled={refreshingAll || !accounts?.length}
              className="btn-press inline-flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-[var(--color-ink-soft)] hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshingAll ? "spin" : ""}`} />
              <span className="hidden sm:inline">
                {refreshingAll ? "Обновляем…" : "Обновить всё"}
              </span>
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="btn-press inline-flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-[var(--color-ink-soft)] hover:bg-slate-50"
            >
              <UserRoundPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Аккаунт</span>
            </button>
            <button
              onClick={() => {
                setSendPreset(null);
                setSendOpen(true);
              }}
              disabled={!accounts?.length}
              className="btn-press inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.75)] hover:bg-[var(--color-brand-deep)] disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Отправить
            </button>
          </div>
        </div>
      </header>

      {/* hero stats */}
      <div className="pt-8">
        <h1 className="anim-fade-up text-[26px] font-bold tracking-tight text-[var(--color-ink)] sm:text-[30px]">
          Панель переводов
        </h1>
        <p
          className="anim-fade-up mt-1 text-[13.5px] text-[var(--color-ink-mute)]"
          style={{ animationDelay: "60ms" }}
        >
          Балансы, лимиты Roblox Plus и моментальная отправка робуксов со всех
          ваших аккаунтов — в одном месте.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard icon={Users} label="Аккаунты" value={fmtNum(stats.total)} hint={`активных: ${stats.active}`} delay={80} />
          <StatCard icon={Wallet} label="Общий баланс" value={`${fmtNum(stats.balance)} R$`} hint="сумма по всем аккаунтам" delay={130} />
          <StatCard icon={Zap} label="Свободно сегодня" value={`${fmtNum(stats.dayLeft)} R$`} hint="остаток дневных лимитов" delay={180} />
          <StatCard icon={CalendarDays} label="Свободно в месяце" value={`${fmtNum(stats.monthLeft)} R$`} hint="остаток месячных лимитов" delay={230} />
        </div>
      </div>

      {/* body */}
      {loadError && (
        <div className="mt-8 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {accounts === null ? (
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-[300px] rounded-2xl" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="anim-fade-up mt-12 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-[#c7d6ef] bg-white/70 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
            <UserRoundPlus className="h-7 w-7" />
          </span>
          <h3 className="text-[18px] font-semibold tracking-tight text-[var(--color-ink)]">
            Добавьте первый аккаунт
          </h3>
          <p className="max-w-md text-[13.5px] leading-relaxed text-[var(--color-ink-mute)]">
            Вставьте .ROBLOSECURITY куки — панель сама определит баланс, Roblox
            Plus и лимиты переводов (500/1 000 или 5 000/10 000 R$).
          </p>
          <button
            onClick={() => setAddOpen(true)}
            className="btn-press mt-2 inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand)] px-5 py-3 text-[14px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.75)] hover:bg-[var(--color-brand-deep)]"
          >
            <UserRoundPlus className="h-4.5 w-4.5" /> Добавить аккаунт
          </button>
        </div>
      ) : (
        <>
          {stats.elevated.length > 0 && (
            <Section
              icon={Zap}
              title="Сильные аккаунты"
              desc="2FA + хорошая репутация · лимит 5 000 R$ в день · 10 000 R$ в месяц"
              count={stats.elevated.length}
              tone="bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
            >
              {renderCards(stats.elevated)}
            </Section>
          )}

          {stats.standard.length > 0 && (
            <Section
              icon={Gauge}
              title="Слабые аккаунты"
              desc="без повышенного лимита · 500 R$ в день · 1 000 R$ в месяц"
              count={stats.standard.length}
              tone="bg-sky-50 text-sky-600"
            >
              {renderCards(stats.standard)}
            </Section>
          )}

          {stats.other.length > 0 && (
            <Section
              icon={TriangleAlert}
              title="Без Plus или с ошибками"
              desc="переводы недоступны — нет подписки, либо сессия устарела"
              count={stats.other.length}
              tone="bg-amber-50 text-amber-600"
            >
              {renderCards(stats.other)}
            </Section>
          )}
        </>
      )}

      {/* history */}
      <section className="mt-12">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
            <RobuxIcon className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-[var(--color-ink)]">
              История переводов
            </h2>
            <p className="text-[12.5px] text-[var(--color-ink-mute)]">
              последние отправки через панель
            </p>
          </div>
        </div>
        <TransferHistory transfers={transfers ?? []} loading={transfers === null} />
      </section>

      {/* footnote */}
      <footer className="mt-12 flex items-start gap-2 rounded-2xl border border-[var(--color-line)] bg-white/70 px-4 py-3.5 text-[12px] leading-relaxed text-[var(--color-ink-mute)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Лимиты Roblox Plus: 500 R$/день и 1 000 R$/мес по умолчанию; 5 000
          R$/день и 10 000 R$/мес с 2FA и хорошей репутацией. Дневной лимит
          считается по скользящим 24 часам, месячный — по биллинг-периоду
          подписки. Данные обновляются кнопкой «Обновить всё» или у каждой
          карточки.
        </p>
      </footer>

      {/* modals */}
      <AddAccountModal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleAdd} />
      <SendRobuxModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        accounts={accounts ?? []}
        initialAccountId={sendPreset}
        onSend={handleSend}
      />
    </div>
  );
}

export function Dashboard() {
  return (
    <ToastProvider>
      <DashboardInner />
    </ToastProvider>
  );
}
