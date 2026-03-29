import { describe, expect, it, vi } from "vitest";

import { createReloadController } from "../src/lib/reload-controller";

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("reload controller", () => {
  it("coalesces bursty requests into one active load plus one rerun", async () => {
    const first = createDeferred();
    const second = createDeferred();
    const load = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const controller = createReloadController(load);

    controller.request();
    controller.request();
    controller.request();

    expect(load).toHaveBeenCalledTimes(1);

    first.resolve();
    await flushMicrotasks();

    expect(load).toHaveBeenCalledTimes(2);

    second.resolve();
    await flushMicrotasks();

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("queues requests while suppressed without starting a load", async () => {
    const load = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const controller = createReloadController(load);

    controller.setSuppressed(true);
    controller.request();
    controller.request();

    expect(load).not.toHaveBeenCalled();

    controller.setSuppressed(false);
    await flushMicrotasks();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("waits for an in-flight load to finish before replaying suppressed work", async () => {
    const first = createDeferred();
    const second = createDeferred();
    const load = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const controller = createReloadController(load);

    controller.request();
    controller.setSuppressed(true);
    controller.request();

    expect(load).toHaveBeenCalledTimes(1);

    controller.setSuppressed(false);
    await flushMicrotasks();

    expect(load).toHaveBeenCalledTimes(1);

    first.resolve();
    await flushMicrotasks();

    expect(load).toHaveBeenCalledTimes(2);

    second.resolve();
    await flushMicrotasks();

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not rerun when no extra work was queued", async () => {
    const first = createDeferred();
    const load = vi.fn<() => Promise<void>>().mockImplementationOnce(() => first.promise);
    const controller = createReloadController(load);

    controller.request();
    expect(load).toHaveBeenCalledTimes(1);

    first.resolve();
    await flushMicrotasks();

    expect(load).toHaveBeenCalledTimes(1);
  });
});
