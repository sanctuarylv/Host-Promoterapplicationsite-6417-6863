import { useMutation, useQueryClient, type QueryKey, type UseMutationOptions } from "@tanstack/react-query";

/**
 * Wrap an oRPC mutationOptions() so every success invalidates the listed query
 * keys (server state is re-read; nothing is updated optimistically).
 */
export function useInvalidating<TData, TError, TVars, TCtx>(
  options: UseMutationOptions<TData, TError, TVars, TCtx>,
  keys: QueryKey[],
) {
  const qc = useQueryClient();
  return useMutation({
    ...options,
    retry: false,
    onSuccess: async (...args) => {
      await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
      return options.onSuccess?.(...args);
    },
  });
}
