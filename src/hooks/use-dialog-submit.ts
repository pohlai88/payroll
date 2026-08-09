/**
 * @feature shell
 * @layer ui
 *
 * Dialog submit busy-state hook.
 */

import { useCallback, useState } from "react";
import { formatApiError } from "@/web/api/format-error";

/**
 * Manages submitting/error state for dialog confirm actions.
 *
 * `run` wraps an async action with the standard setSubmitting/setError/finally
 * skeleton so each dialog only supplies the action itself and a fallback
 * message. `reset` clears error (and submitting) — call it in handleOpenChange
 * when the dialog closes or is cancelled.
 */
function useDialogSubmit(): {
  submitting: boolean;
  error: string | null;
  reset: () => void;
  run: (action: () => Promise<void>, fallbackMessage: string) => Promise<void>;
} {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setSubmitting(false);
  }, []);

  const run = useCallback(
    async (action: () => Promise<void>, fallbackMessage: string) => {
      setSubmitting(true);
      setError(null);
      try {
        await action();
      } catch (err) {
        setError(formatApiError(err, fallbackMessage));
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  return { submitting, error, reset, run };
}

export { useDialogSubmit };
