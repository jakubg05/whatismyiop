import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastTone = "error" | "warning" | "info";

type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastState = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const Context = createContext<ToastState | null>(null);
const TOAST_DURATION_MS = 5_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismissToast = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, message, tone }]);
    timers.current.set(id, window.setTimeout(() => dismissToast(id), TOAST_DURATION_MS));
  }, [dismissToast]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return <Context.Provider value={value}>
    {children}
    <div className="toast-stack" aria-label="Notifications">
      {toasts.map((toast) => <div
        key={toast.id}
        className={`toast toast--${toast.tone}`}
        role={toast.tone === "error" ? "alert" : "status"}
      >
        <span>{toast.message}</span>
        <button type="button" aria-label="Dismiss notification" onClick={() => dismissToast(toast.id)}>×</button>
      </div>)}
    </div>
  </Context.Provider>;
}

export function useToast(): ToastState {
  const value = useContext(Context);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
