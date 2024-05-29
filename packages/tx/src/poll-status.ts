import { queryRPCStatus, QueryStatusResponse } from "@osmosis-labs/server";

export type StatusHandler = (status: QueryStatusResponse) => void;

/** Polls a `/status` endpoint publishes to an arbitrary set of subscribers. */
export class PollingStatusSubscription {
  protected _subscriptionCount: number = 0;

  protected _handlers: StatusHandler[] = [];

  constructor(
    protected readonly rpc: string,
    protected readonly defaultBlockTimeMs = 7500
  ) {}

  get subscriptionCount(): number {
    return this._subscriptionCount;
  }

  /**
   * @param handler
   * @return unsubscriber
   */
  subscribe(handler: StatusHandler): () => void {
    this._handlers.push(handler);

    this.increaseSubscriptionCount();

    return () => {
      this._handlers = this._handlers.filter((h) => h !== handler);
      this.decreaseSubscriptionCount();
    };
  }

  protected async startSubscription() {
    while (this._subscriptionCount > 0) {
      try {
        const status = await queryRPCStatus({ restUrl: this.rpc });
        const blockTime = await this.getAverageBlockTimeMs(status);
        this._handlers.forEach((handler) => handler(status));
        await new Promise((resolve) => {
          setTimeout(resolve, blockTime);
        });
      } catch (e: any) {
        console.error(`Failed to fetch /status: ${e?.toString()}`);
      }
    }
  }

  protected increaseSubscriptionCount() {
    this._subscriptionCount++;

    if (this._subscriptionCount === 1) {
      // No need to await
      this.startSubscription();
    }
  }

  protected decreaseSubscriptionCount() {
    this._subscriptionCount--;
  }

  /**
   * Estimate block height by query the average UTC time difference of the lateset blocks in sync info.
   * The estimate is a rough estimate from the latest and earliest block times in sync info, so it may
   * not be fully up to date if block time changes.
   */
  protected async getAverageBlockTimeMs(
    givenStatus?: QueryStatusResponse
  ): Promise<number> {
    const status = givenStatus ?? (await queryRPCStatus({ restUrl: this.rpc }));

    if (status.result.sync_info.catching_up) {
      return this.defaultBlockTimeMs;
    }

    const latestBlockHeight = parseInt(
      status.result.sync_info.latest_block_height
    );
    const earliestBlockHeight = parseInt(
      status.result.sync_info.earliest_block_height
    );
    const latestBlockTime = new Date(
      status.result.sync_info.latest_block_time
    ).getTime();
    const earliestBlockTime = new Date(
      status.result.sync_info.earliest_block_time
    ).getTime();

    if (latestBlockHeight <= earliestBlockHeight) {
      return this.defaultBlockTimeMs;
    }

    const avg = Math.ceil(
      (latestBlockTime - earliestBlockTime) /
        (latestBlockHeight - earliestBlockHeight)
    );

    // validate block time if for some reason a large or small block time is calculated
    if (avg < 200 || avg > 15_000) {
      return this.defaultBlockTimeMs;
    }
    return avg;
  }
}
