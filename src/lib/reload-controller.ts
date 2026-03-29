export interface ReloadController {
  request: () => void;
  setSuppressed: (suppressed: boolean) => void;
  dispose: () => void;
}

export function createReloadController(load: () => Promise<void>): ReloadController {
  let disposed = false;
  let inFlight = false;
  let queued = false;
  let suppressed = false;

  async function run() {
    if (disposed || inFlight || suppressed) {
      return;
    }

    inFlight = true;

    try {
      await load();
    } finally {
      inFlight = false;

      if (disposed || suppressed || !queued) {
        return;
      }

      queued = false;
      void run();
    }
  }

  return {
    request() {
      if (disposed) {
        return;
      }

      if (suppressed || inFlight) {
        queued = true;
        return;
      }

      void run();
    },
    setSuppressed(nextSuppressed) {
      if (disposed) {
        return;
      }

      suppressed = nextSuppressed;

      if (!suppressed && queued && !inFlight) {
        queued = false;
        void run();
      }
    },
    dispose() {
      disposed = true;
      queued = false;
    },
  };
}
