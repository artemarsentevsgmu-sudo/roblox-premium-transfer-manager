"use client";

import { ArrowRight, CheckCircle2, Inbox, XCircle } from "lucide-react";
import type { TransferView } from "@/lib/send-service";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { Chip, RobuxIcon } from "./ui";

export function TransferHistory({
  transfers,
  loading,
}: {
  transfers: TransferView[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-12 rounded-xl" />
        ))}
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--color-line)] bg-white/60 py-10 text-center">
        <Inbox className="h-6 w-6 text-[var(--color-ink-mute)]" />
        <p className="text-[13.5px] font-medium text-[var(--color-ink-soft)]">
          Переводов ещё не было
        </p>
        <p className="text-[12px] text-[var(--color-ink-mute)]">
          История отправленных робуксов появится здесь
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--color-line)] bg-white shadow-[var(--shadow-card)]">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-line)] text-[11px] tracking-wider text-[var(--color-ink-mute)] uppercase">
            <th className="px-4 py-3 font-semibold">Дата</th>
            <th className="px-4 py-3 font-semibold">Аккаунт</th>
            <th className="px-4 py-3 font-semibold">Получатель</th>
            <th className="px-4 py-3 text-right font-semibold">Сумма</th>
            <th className="px-4 py-3 font-semibold">Статус</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((t) => (
            <tr
              key={t.id}
              className="border-b border-[var(--color-line)]/60 last:border-0 hover:bg-[var(--color-ground)]/70"
            >
              <td className="px-4 py-3 whitespace-nowrap text-[var(--color-ink-soft)]">
                {fmtDateTime(t.createdAt)}
              </td>
              <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                @{t.accountUsername}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-[var(--color-ink-soft)]">
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--color-ink-mute)]" />
                  <span className="font-medium text-[var(--color-ink)]">
                    @{t.recipientUsername}
                  </span>
                  <span className="text-[11.5px] text-[var(--color-ink-mute)]">
                    {t.recipientUserId}
                  </span>
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="inline-flex items-center justify-end gap-1.5 font-semibold text-[var(--color-ink)]">
                  <RobuxIcon className="h-3.5 w-3.5 text-[var(--color-brand)]" />
                  {fmtNum(t.amount)}
                </span>
              </td>
              <td className="px-4 py-3">
                {t.status === "success" ? (
                  <Chip tone="green">
                    <CheckCircle2 className="h-3 w-3" /> успешно
                  </Chip>
                ) : (
                  <span title={t.error ?? undefined}>
                    <Chip tone="red">
                      <XCircle className="h-3 w-3" /> ошибка
                    </Chip>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
