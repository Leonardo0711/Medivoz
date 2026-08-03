import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Save, TriangleAlert } from "lucide-react";

type DeferredAction = () => void | Promise<void>;

type UnsavedRecordGuard = {
  active: boolean;
  isSaving: boolean;
  onSave: () => Promise<boolean>;
};

type UnsavedRecordContextValue = {
  configureGuard: (guard: UnsavedRecordGuard | null) => void;
  requestAction: (action: DeferredAction) => boolean;
};

const inactiveGuard: UnsavedRecordGuard = {
  active: false,
  isSaving: false,
  onSave: async () => true,
};

const UnsavedRecordContext = createContext<UnsavedRecordContextValue | null>(null);

export function UnsavedRecordProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const guardRef = useRef<UnsavedRecordGuard>(inactiveGuard);
  const pendingActionRef = useRef<DeferredAction | null>(null);
  const bypassRef = useRef(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const configureGuard = useCallback((guard: UnsavedRecordGuard | null) => {
    guardRef.current = guard || inactiveGuard;
  }, []);

  const requestAction = useCallback((action: DeferredAction) => {
    if (bypassRef.current || !guardRef.current.active) {
      void action();
      return true;
    }

    pendingActionRef.current = action;
    setDialogOpen(true);
    return false;
  }, []);

  const runPendingAction = useCallback(async () => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setDialogOpen(false);
    if (!action) return;

    bypassRef.current = true;
    guardRef.current = inactiveGuard;
    try {
      await action();
    } finally {
      window.setTimeout(() => {
        bypassRef.current = false;
      }, 0);
    }
  }, []);

  const handleDiscardAndLeave = useCallback(() => {
    void runPendingAction();
  }, [runPendingAction]);

  const handleSaveAndLeave = useCallback(async () => {
    setIsProcessing(true);
    try {
      const saved = await guardRef.current.onSave();
      if (saved) await runPendingAction();
    } finally {
      setIsProcessing(false);
    }
  }, [runPendingAction]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      const current = `${location.pathname}${location.search}${location.hash}`;
      const next = `${destination.pathname}${destination.search}${destination.hash}`;
      if (current === next || !guardRef.current.active || bypassRef.current) return;

      event.preventDefault();
      event.stopPropagation();
      requestAction(() => navigate(next));
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [location.hash, location.pathname, location.search, navigate, requestAction]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!guardRef.current.active) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const value = useMemo(
    () => ({ configureGuard, requestAction }),
    [configureGuard, requestAction]
  );

  return (
    <UnsavedRecordContext.Provider value={value}>
      {children}
      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && !isProcessing) {
            pendingActionRef.current = null;
            setDialogOpen(false);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 text-amber-700">
              <TriangleAlert className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Hay una anamnesis pendiente de guardar</AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              Guardar consolida la ficha actual, crea una versión y registra este periodo de edición.
              Si sale sin guardar, se descartarán los cambios manuales que todavía no fueron consolidados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-wrap">
            <AlertDialogCancel disabled={isProcessing || guardRef.current.isSaving}>
              Seguir editando
            </AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={isProcessing || guardRef.current.isSaving}
              onClick={handleDiscardAndLeave}
            >
              Salir sin guardar
            </Button>
            <Button
              type="button"
              disabled={isProcessing || guardRef.current.isSaving}
              onClick={() => void handleSaveAndLeave()}
            >
              {isProcessing || guardRef.current.isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar ficha y salir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </UnsavedRecordContext.Provider>
  );
}

export function useUnsavedRecordGuard() {
  const context = useContext(UnsavedRecordContext);
  if (!context) {
    throw new Error("useUnsavedRecordGuard debe usarse dentro de UnsavedRecordProvider");
  }
  return context;
}
