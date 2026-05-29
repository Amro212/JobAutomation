export type ApplicationStageTiming = {
  name: string;
  durationMs: number;
};

export function createApplicationStageTimer(): {
  timePhase: <T>(name: string, operation: () => Promise<T>) => Promise<T>;
  snapshot: () => ApplicationStageTiming[];
} {
  const timings: ApplicationStageTiming[] = [];

  return {
    async timePhase<T>(name: string, operation: () => Promise<T>): Promise<T> {
      const startedAt = Date.now();
      try {
        return await operation();
      } finally {
        timings.push({
          name,
          durationMs: Date.now() - startedAt
        });
      }
    },
    snapshot() {
      return timings.slice();
    }
  };
}
