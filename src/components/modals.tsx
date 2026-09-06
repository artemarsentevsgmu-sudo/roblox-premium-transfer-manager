"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  KeyRound,
  Loader2,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { AccountView } from "@/lib/accounts-service";
import type { SendResult } from "@/lib/send-service";
import { fmtNum } from "@/lib/format";
import { Chip, Modal, RobuxIcon } from "./ui";

/* --------------------------- Add account modal ---------------------------- */

export function AddAccountModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (cookie: string) => Promise<void>;
}) {
  const [cookie, setCookie] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCookie("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(cookie);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Добавить аккаунт"
      subtitle="Вставьте .ROBLOSECURITY куки — данные подтянутся автоматически"
      icon={KeyRound}
    >
      <div className="flex flex-col gap-4">
        <textarea
          value={cookie}
          onChange={(e) => setCookie(e.target.value)}
          placeholder='_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you...'
          rows={4}
          spellCheck={false}
          className="w-full resize-none rounded-xl border border-[var(--color-line)] bg-[var(--color-ground)] p-3.5 font-mono text-[12px] leading-relaxed text-[var(--color-ink)] placeholder:text-slate-400 focus:border-[var(--color-brand)]"
        />

        <details className="group rounded-xl border border-[var(--color-line)] bg-white open:bg-[var(--color-ground)]">
          <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-[var(--color-brand)] select-none">
            Как получить куки?
          </summary>
          <ol className="flex flex-col gap-1.5 px-4 pb-4 text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">
            <li>1. Войдите в нужный аккаунт на roblox.com в браузере.</li>
            <li>
              2. Нажмите F12 → вкладка <b>Application</b> → <b>Cookies</b> →
              https://www.roblox.com
            </li>
            <li>
              3. Скопируйте значение <b>.ROBLOSECURITY</b> и вставьте сюда
              (можно целиком <span className="font-mono">.ROBLOSECURITY=...</span>).
            </li>
            <li className="text-amber-600">
              Не нажимайте «Выйти» в браузере — это убьёт сессию и куки.
            </li>
          </ol>
        </details>

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-[12.5px] leading-snug whitespace-pre-line text-red-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-ink-mute)]">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Куки хранится зашифрованной (AES-256-GCM)
          </span>
          <button
            onClick={submit}
            disabled={busy || cookie.trim().length < 30}
            className="btn-press inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand)] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,0.7)] hover:bg-[var(--color-brand-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 spin" /> Проверяем у Roblox…
              </>
            ) : (
              <>
                Проверить и добавить <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------- Send robux modal ---------------------------- */

const QUICK_AMOUNTS = [100, 250, 500, 1000];

export function SendRobuxModal({
  open,
  onClose,
  accounts,
  initialAccountId,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  accounts: AccountView[];
  initialAccountId: string | null;
  onSend: (payload: {
    recipient: string;
    amount: number;
    accountId: string | null;
  }) => Promise<SendResult>;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  useEffect(() => {
    if (open) {
      setRecipient("");
      setAmount("");
      setAccountId(initialAccountId ?? "");
      setError(null);
      setResult(null);
      setBusy(false);
    }
  }, [open, initialAccountId]);

  const eligibleAccounts = useMemo(
    () =>
      accounts.filter((a) => a.hasPlus && a.status !== "invalid" && a.usage),
    [accounts],
  );

  const amountNum = Math.floor(Number(amount)) || 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await onSend({
        recipient: recipient.trim(),
        amount: amountNum,
        accountId: accountId || null,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Перевод не выполнен");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Отправить робуксы"
      subtitle="Моментальный перевод через функцию Send Robux (Roblox Plus)"
      icon={Send}
    >
      {result ? (
        <div className="anim-pop flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-7 w-7 text-emerald-500" />
          </span>
          <p className="text-[17px] font-semibold tracking-tight text-[var(--color-ink)]">
            Отправлено {fmtNum(result.transfer.amount)} R$
          </p>
          <p className="text-[13px] text-[var(--color-ink-soft)]">
            @{result.account.username} → @{result.transfer.recipientUsername}
          </p>
          {result.account.usage && (
            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
              <Chip tone="blue">
                день: осталось {fmtNum(result.account.usage.remainingToday)} R$
              </Chip>
              <Chip tone="violet">
                месяц: осталось {fmtNum(result.account.usage.remainingThisMonth)} R$
              </Chip>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setResult(null);
                setAmount("");
              }}
              className="btn-press rounded-xl bg-[var(--color-brand)] px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[var(--color-brand-deep)]"
            >
              Ещё один перевод
            </button>
            <button
              onClick={onClose}
              className="btn-press rounded-xl border border-[var(--color-line)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--color-ink-soft)] hover:bg-slate-50"
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* recipient */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold tracking-wide text-[var(--color-ink-soft)] uppercase">
              Получатель
            </span>
            <div className="relative">
              <UserRound className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-mute)]" />
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="ник или ID пользователя"
                className="w-full rounded-xl border border-[var(--color-line)] bg-white py-2.5 pr-3 pl-10 text-[14px] text-[var(--color-ink)] placeholder:text-slate-400 focus:border-[var(--color-brand)]"
              />
            </div>
          </label>

          {/* amount */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold tracking-wide text-[var(--color-ink-soft)] uppercase">
              Сумма
            </span>
            <div className="relative">
              <RobuxIcon className="absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-[var(--color-brand)]" />
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="минимум 10"
                inputMode="numeric"
                className="w-full rounded-xl border border-[var(--color-line)] bg-white py-2.5 pr-3 pl-10 text-[14px] font-semibold text-[var(--color-ink)] placeholder:font-normal placeholder:text-slate-400 focus:border-[var(--color-brand)]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_AMOUNTS.map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(String(v))}
                  className={`btn-press rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                    amountNum === v
                      ? "bg-[var(--color-brand)] text-white"
                      : "bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)] hover:bg-blue-100"
                  }`}
                >
                  {fmtNum(v)}
                </button>
              ))}
            </div>
          </label>

          {/* account */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold tracking-wide text-[var(--color-ink-soft)] uppercase">
              С аккаунта
            </span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full appearance-none rounded-xl border border-[var(--color-line)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-ink)] focus:border-[var(--color-brand)]"
            >
              <option value="">
                Автовыбор — аккаунт с наибольшим свободным лимитом
              </option>
              {eligibleAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.username} — баланс {fmtNum(a.robuxBalance)} R$ · сегодня
                   свободно {fmtNum(a.usage?.remainingToday ?? 0)} R$
                </option>
              ))}
            </select>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-[12.5px] leading-snug whitespace-pre-line text-red-700">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={submit}
            disabled={busy || !recipient.trim() || amountNum < 10}
            className="btn-press mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand)] px-4 py-3 text-[14px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,0.7)] hover:bg-[var(--color-brand-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-4.5 w-4.5 spin" /> Отправляем через Roblox…
              </>
            ) : (
              <>
                <Send className="h-4.5 w-4.5" /> Отправить {amountNum >= 10 ? `${fmtNum(amountNum)} R$` : ""}
              </>
            )}
          </button>
        </div>
      )}
    </Modal>
  );
}
