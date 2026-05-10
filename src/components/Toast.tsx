
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type ToastType = "success" | "info" | "error";

type ToastState = {
  message: string;
  type: ToastType;
} | null;

type ToastContextValue = (message: string, type?: ToastType) => void;

const toastStyles: Record<ToastType, string> = {
  success: "bg-[var(--green)] text-white border-transparent",
  info:
    "border-2 border-[var(--green)] bg-[var(--white)] text-[var(--text)] shadow-[0_8px_30px_rgba(0,0,0,0.08)]",
  error: "bg-red-600 text-white border-transparent",
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return () => {};
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const [visible, setVisible] = useState(false);

  const show = useCallback((message: string, type: ToastType = "success") => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    setVisible(false);
    const enter = window.requestAnimationFrame(() => setVisible(true));
    const dismiss = window.setTimeout(() => setVisible(false), 2800);
    const cleanup = window.setTimeout(() => setToast(null), 3000);
    return () => {
      window.cancelAnimationFrame(enter);
      window.clearTimeout(dismiss);
      window.clearTimeout(cleanup);
    };
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <div
          role="status"
          className={`fixed bottom-20 left-1/2 z-[120] max-w-[min(90vw,420px)] -translate-x-1/2 rounded-2xl px-4 py-3 text-sm shadow-lg transition-all duration-300 ${
            visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
          } ${toastStyles[toast.type]}`}
        >
          {toast.message}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
