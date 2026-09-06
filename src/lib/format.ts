const nf = new Intl.NumberFormat("ru-RU");
const df = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
});
const tf = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});
const dtf = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return nf.format(n);
}

export function fmtDateTime(ms: number | string | null | undefined): string {
  if (!ms) return "—";
  const d = typeof ms === "string" ? new Date(ms) : new Date(ms);
  return dtf.format(d);
}

export function fmtDate(ms: number | null | undefined): string {
  if (!ms) return "—";
  return df.format(new Date(ms));
}

export function fmtTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  return tf.format(new Date(ms));
}

export function relTime(iso: string | null): string {
  if (!iso) return "никогда";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}
