/**
 * Concurrency Manager
 *
 * Limits the number of concurrent async operations to prevent overwhelming
 * the backend API or external services (like OpenAI).
 *
 * Usage:
 * ```ts
 * const manager = new ConcurrencyManager(3); // max 3 concurrent
 * const result = await manager.run(() => fetchData());
 * ```
 */

export interface QueuedTask<T> {
  id: string;
  execute: (signal: AbortSignal) => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  abortController: AbortController;
}

export class ConcurrencyManager {
  private maxConcurrent: number;
  private running: number = 0;
  private queue: QueuedTask<any>[] = [];
  private activeControllers: Map<string, AbortController> = new Map();

  constructor(maxConcurrent: number = 5) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Run a task with concurrency limiting
   * Returns a promise that resolves when the task completes
   */
  async run<T>(id: string, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    console.log(`[ConcurrencyManager] Queueing task: ${id}`);

    return new Promise<T>((resolve, reject) => {
      const abortController = new AbortController();

      this.queue.push({
        id,
        execute: task,
        resolve,
        reject,
        abortController,
      });

      // Track the controller
      this.activeControllers.set(id, abortController);

      this.processQueue();
    });
  }

  /**
   * Process the queue, running tasks up to the concurrency limit
   */
  private async processQueue() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      this.running++;
      console.log(`[ConcurrencyManager] Starting task: ${task.id} (${this.running}/${this.maxConcurrent} running)`);

      // Execute the task with abort signal
      task
        .execute(task.abortController.signal)
        .then((result) => {
          console.log(`[ConcurrencyManager] Task completed: ${task.id}`);
          task.resolve(result);
        })
        .catch((error) => {
          if (error.name === 'AbortError') {
            console.log(`[ConcurrencyManager] Task aborted: ${task.id}`);
          } else {
            console.error(`[ConcurrencyManager] Task failed: ${task.id}`, error);
          }
          task.reject(error);
        })
        .finally(() => {
          this.running--;
          // Cleanup controller
          this.activeControllers.delete(task.id);
          console.log(`[ConcurrencyManager] Task finalized: ${task.id} (${this.running} still running)`);
          this.processQueue(); // Process next task
        });
    }
  }

  /**
   * Get current queue status
   */
  getStatus() {
    return {
      running: this.running,
      queued: this.queue.length,
      total: this.running + this.queue.length,
    };
  }

  /**
   * Get queued task IDs
   */
  getQueuedIds(): string[] {
    return this.queue.map((task) => task.id);
  }

  /**
   * Check if a specific ID is queued or running
   */
  isInProgress(id: string): boolean {
    return this.queue.some((task) => task.id === id);
  }

  /**
   * Cancel a specific task by ID
   * Aborts the request if running, or removes from queue if pending
   */
  cancel(id: string): boolean {
    console.log(`[ConcurrencyManager] Attempting to cancel task: ${id}`);

    // Check if task has an active controller
    const controller = this.activeControllers.get(id);
    if (controller) {
      console.log(`[ConcurrencyManager] Aborting running task: ${id}`);
      controller.abort();
      this.activeControllers.delete(id);
      return true;
    }

    // Check if task is in queue
    const queueIndex = this.queue.findIndex((task) => task.id === id);
    if (queueIndex !== -1) {
      console.log(`[ConcurrencyManager] Removing queued task: ${id}`);
      const task = this.queue.splice(queueIndex, 1)[0];
      task.abortController.abort();
      task.reject(new DOMException('Task cancelled', 'AbortError'));
      return true;
    }

    console.log(`[ConcurrencyManager] Task not found: ${id}`);
    return false;
  }
}

/**
 * Global enrichment concurrency manager
 * Limits concurrent enrichment requests to 5
 */
export const enrichmentQueue = new ConcurrencyManager(5);
