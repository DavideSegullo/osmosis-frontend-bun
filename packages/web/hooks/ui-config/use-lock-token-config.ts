import { AppCurrency } from "@keplr-wallet/types";
import { AmountConfig } from "@osmosis-labs/keplr-hooks";
import dayjs from "dayjs";
import { Duration } from "dayjs/plugin/duration";
import { useCallback, useEffect } from "react";

import { useAmountConfig } from "~/hooks/ui-config/use-amount-config";
import { useStore } from "~/stores";

/** UI config for setting valid GAMM token amounts and un/locking them in a lock. */
export function useLockTokenConfig(sendCurrency?: AppCurrency | undefined): {
  config: AmountConfig;
  lockToken: (gaugeDuration: Duration) => Promise<void>;
  unlockTokens: (
    locks: { lockId: string; isSynthetic: boolean }[]
  ) => Promise<"synthetic" | "normal">;
} {
  const { chainStore, queriesStore, accountStore } = useStore();

  const { chainId } = chainStore.osmosis;

  const account = accountStore.getWallet(chainId);
  const queryOsmosis = queriesStore.get(chainId).osmosis!;
  const address = account?.address ?? "";

  const config = useAmountConfig(
    chainStore,
    queriesStore,
    chainId,
    address,
    undefined,
    sendCurrency
  );

  const lockToken = useCallback(
    (lockDuration: Duration) => {
      return new Promise<void>(async (resolve, reject) => {
        try {
          if (!config.sendCurrency.coinMinimalDenom.startsWith("gamm")) {
            throw new Error("Tried to lock non-gamm token");
          }
          await account?.osmosis.sendLockTokensMsg(
            lockDuration.asSeconds(),
            [
              {
                currency: config.sendCurrency,
                amount: config.amount,
              },
            ],
            undefined,
            () => resolve()
          );
        } catch (e) {
          console.error(e);
          reject();
        }
      });
    },
    [account, config.sendCurrency, config.amount]
  );

  const unlockTokens = useCallback(
    (locks: { lockId: string; isSynthetic: boolean }[]) => {
      return new Promise<"synthetic" | "normal">(async (resolve, reject) => {
        if (!account) return reject();

        try {
          const isSuperfluidUnlock = locks.some((lock) => lock.isSynthetic);

          if (isSuperfluidUnlock) {
            // superfluid (synthetic) unlock
            await account.osmosis.sendBeginUnlockingMsgOrSuperfluidUnbondLockMsgIfSyntheticLock(
              locks,
              undefined,
              (tx) => {
                if (!Boolean(tx.code)) resolve("synthetic");
                else reject();
              }
            );
          } else {
            // normal unlock of available shares escrowed in lock
            const blockGasLimitLockIds = locks
              .slice(0, 10)
              .map(({ lockId }) => lockId);
            await account.osmosis.sendBeginUnlockingMsg(
              blockGasLimitLockIds,
              undefined,
              (tx) => {
                if (!Boolean(tx.code)) resolve("normal");
                else reject();
              }
            );
          }
        } catch (e) {
          console.error(e);
          reject();
        }
      });
    },
    [account]
  );

  // refresh query stores when an unbonding token happens to unbond with window open
  useEffect(() => {
    if (
      queryOsmosis.queryAccountLocked.get(address).isFetching ||
      address === ""
    )
      return;

    const unlockingTokens =
      queryOsmosis.queryAccountLocked.get(address).unlockingCoins;
    const now = dayjs().utc();
    let timeoutIds: NodeJS.Timeout[] = [];

    // set a timeout for each unlocking token to trigger a refresh at unbond time
    unlockingTokens.forEach(({ endTime }) => {
      const diffMs = dayjs(endTime).diff(now, "ms");
      const blockTime = 6_000; // allow one block to process unbond before querying

      timeoutIds.push(
        setTimeout(() => {
          queryOsmosis.queryGammPoolShare.fetch(address);
        }, diffMs + blockTime)
      );
    });

    return () => {
      timeoutIds.forEach((timeout) => clearTimeout(timeout));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    queryOsmosis.queryAccountLocked.get(address).response,
    address,
    queryOsmosis.queryAccountLocked,
  ]);

  return { config, lockToken, unlockTokens };
}
