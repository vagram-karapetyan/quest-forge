export type PositionPatch = {
  sceneId: string;
  posX: number;
  posY: number;
};

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error';

export class LayoutSaveQueue {
  private pending = new Map<string, PositionPatch>();
  private inFlight = false;
  private activeQuestId: string | null = null;
  private debounceTimer: number | null = null;
  private readonly persistFn: (questId: string, positions: PositionPatch[]) => Promise<void>;
  private readonly onStatus?: (status: SaveStatus) => void;
  private readonly onError?: (err: unknown) => void;

  constructor(
    persistFn: (questId: string, positions: PositionPatch[]) => Promise<void>,
    callbacks: {
      onStatus?: (status: SaveStatus) => void;
      onError?: (err: unknown) => void;
    } = {},
  ) {
    this.persistFn = persistFn;
    this.onStatus = callbacks.onStatus;
    this.onError = callbacks.onError;
  }

  public enqueue(questId: string, patch: PositionPatch, debounceMs = 180): void {
    if (this.activeQuestId && this.activeQuestId !== questId) {
      this.pending.clear();
    }
    this.activeQuestId = questId;
    this.pending.set(patch.sceneId, {
      sceneId: patch.sceneId,
      posX: Math.round(patch.posX),
      posY: Math.round(patch.posY),
    });

    this.onStatus?.('dirty');

    if (this.debounceTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (debounceMs <= 0 || typeof window === 'undefined') {
      void this.flush();
      return;
    }

    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, debounceMs);
  }

  public clear(questId?: string): void {
    if (!questId || this.activeQuestId === questId) {
      this.pending.clear();
      if (this.debounceTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
    }
  }

  public async flush(): Promise<void> {
    if (this.debounceTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.inFlight || this.pending.size === 0 || !this.activeQuestId) {
      return;
    }

    this.inFlight = true;
    const questId = this.activeQuestId;

    try {
      while (this.pending.size > 0 && this.activeQuestId === questId) {
        const batch = [...this.pending.values()];
        this.pending.clear();
        this.onStatus?.('saving');
        await this.persistFn(questId, batch);
      }
      if (this.pending.size === 0) {
        this.onStatus?.('saved');
      }
    } catch (err) {
      this.onStatus?.('error');
      this.onError?.(err);
    } finally {
      this.inFlight = false;
    }
  }
}

export class SerializedSaveRunner {
  private queues = new Map<string, Promise<unknown>>();

  public run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(task);
    this.queues.set(key, next);
    void next.finally(() => {
      if (this.queues.get(key) === next) {
        this.queues.delete(key);
      }
    });
    return next;
  }

  public async flushAll(): Promise<void> {
    while (this.queues.size > 0) {
      await Promise.all([...this.queues.values()].map((p) => p.catch(() => undefined)));
    }
  }
}
