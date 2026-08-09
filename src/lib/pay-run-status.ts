/**
 * @feature pay-run
 * @layer lib
 *
 * Pure lifecycle bucketing for pay-run summaries.
 *
 * Shared by the dashboard and the pay-run list so both read the same
 * governance language. No I/O, no React — safe to import anywhere.
 */

export interface StatusBuckets {
  draft: number;
  computed: number;
  reviewed: number;
  approved: number;
  sealed: number;
  released: number;
  other: number;
}

function bucketStatus(status: string): keyof StatusBuckets {
  switch (status) {
    case "DRAFT":
      return "draft";
    case "COMPUTED":
      return "computed";
    case "REVIEWED":
      return "reviewed";
    case "APPROVED":
      return "approved";
    case "SEALED":
      return "sealed";
    case "RELEASED":
      return "released";
    default:
      return "other";
  }
}

export function deriveBuckets(
  runs: readonly { readonly status: string }[]
): StatusBuckets {
  const buckets: StatusBuckets = {
    draft: 0,
    computed: 0,
    reviewed: 0,
    approved: 0,
    sealed: 0,
    released: 0,
    other: 0,
  };
  for (const run of runs) {
    const key = bucketStatus(run.status);
    buckets[key] += 1;
  }
  return buckets;
}

/** Runs still moving through draft → approved (anything not sealed/released). */
export function countOpen(buckets: StatusBuckets): number {
  return (
    buckets.draft +
    buckets.computed +
    buckets.reviewed +
    buckets.approved +
    buckets.other
  );
}

/** Runs past the closure boundary. */
export function countClosed(buckets: StatusBuckets): number {
  return buckets.sealed + buckets.released;
}
