type MessageHandler = (message: unknown) => void;

export type ChildLifecycleApp = {
  close: () => Promise<void>;
};

export type ChildLifecycleProcess = {
  send?: (message: unknown) => void;
  on: (event: 'message', handler: MessageHandler) => void;
  off?: (event: 'message', handler: MessageHandler) => void;
  exit: (code?: number) => never;
};

export function installChildProcessLifecycle(
  app: ChildLifecycleApp,
  proc: ChildLifecycleProcess = process
): {
  notifyReady: () => void;
  dispose: () => void;
} {
  const messageHandler: MessageHandler = async (message) => {
    const type =
      typeof message === 'string'
        ? message
        : typeof message === 'object' && message !== null && 'type' in message
          ? (message as { type?: unknown }).type
          : undefined;

    if (type !== 'shutdown') {
      return;
    }

    try {
      await app.close();
      proc.exit(0);
    } catch {
      proc.exit(1);
    }
  };

  proc.on('message', messageHandler);

  return {
    notifyReady: () => {
      proc.send?.({ type: 'ready' });
    },
    dispose: () => {
      proc.off?.('message', messageHandler);
    }
  };
}
