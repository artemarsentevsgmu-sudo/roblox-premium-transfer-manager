"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  CircleAlert,
  Info,
  X,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------- Robux icon ------------------------------- */

export function RobuxIcon({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 1.8c.4 0 .8.1 1.1.4l8.3 8.3c.6.6.6 1.6 0 2.2l-8.3 8.3c-.6.6-1.6.6-2.2 0l-8.3-8.3a1.55 1.55 0 0 1 0-2.2l8.3-8.3c.3-.3.7-.4 1.1-.4Z"
        fill="currentColor"
      />
      <rect x="8.9" y="8.9" width="6.2" height="6.2" rx="1.2" fill="#fff" />
    </svg>
  );
}

/* --------------------------------- Modal ---------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-[#0c1b33]/40 backdrop-blur-[6px]"
        onClick={onClose}
      />
      <div
        className={`anim-pop relative w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-t-3xl bg-white p-6 shadow-[var(--shadow-pop)] sm:rounded-3xl sm:p-7`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {Icon && (
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                <Icon className="h-5 w-5" />
              </span>
            )}
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[var(--color-ink)]">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-0.5 text-[13px] text-[var(--color-ink-mute)]">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-press rounded-lg p-2 text-[var(--color-ink-mute)] hover:bg-slate-100 hover:text-[var(--color-ink)]"
            aria-label="Закрыть"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------ Progress bar ------------------------------ */

export function LimitBar({
  used,
  limit,
  gradient,
}: {
  used: number;
  limit: number;
  gradient: string;
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="h-[7px] w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="bar-fill h-full rounded-full"
        style={{ width: `${pct}%`, background: gradient }}
      />
    </div>
  );
}

/* --------------------------------- Toasts --------------------------------- */

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
type ToastCtx = { push: (kind: Toast["kind"], text: string) => void };

const ToastContext = createContext<ToastCtx>({ push: () => {} });
export const useToast = () => useContext(ToastContext);

const toastIcons: Record<Toast["kind"], LucideIcon> = {
  success: CheckCircle2,
  error: CircleAlert,
  info: Info,
};
const toastColors: Record<Toast["kind"], string> = {
  success: "text-emerald-600",
  error: "text-red-500",
  info: "text-[var(--color-brand)]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4600);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((t) => {
          const Icon = toastIcons[t.kind];
          return (
            <div
              key={t.id}
              className="anim-toast pointer-events-auto flex items-start gap-2.5 rounded-xl border border-[var(--color-line)] bg-white/95 px-4 py-3 shadow-[var(--shadow-pop)] backdrop-blur"
            >
              <Icon className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${toastColors[t.kind]}`} />
              <p className="text-[13px] leading-snug whitespace-pre-line text-[var(--color-ink)]">
                {t.text}
              </p>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/* --------------------------------- Chips ---------------------------------- */

export function Chip({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "blue" | "sky" | "red" | "green" | "violet";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)]",
    sky: "bg-sky-50 text-sky-700",
    red: "bg-red-50 text-red-600",
    green: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
