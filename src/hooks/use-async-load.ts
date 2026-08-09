/**
 * @feature shell
 * @layer ui
 *
 * Async load helper hook.
 */

import { useCallback, useState } from "react";
import { formatApiError } from "@/web/api/format-error";

/**
 * Generic hook for load-with-loading/error state.
 *
 * `data` starts as null; call sites that need a non-null default should use
 * `?? []` (or similar) at the render site — avoids an `initialData` param
 * while keeping the diff minimal.
 */
function useAsyncLoad<T>(
  load: () => Promise<T>,
  fallbackMessage: string
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  reset: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await load());
    } catch (err) {
      setError(formatApiError(err, fallbackMessage));
    } finally {
      setLoading(false);
    }
  }, [load, fallbackMessage]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, reload, reset };
}

export { useAsyncLoad };
