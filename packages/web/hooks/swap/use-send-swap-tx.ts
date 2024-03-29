import { CoinPretty, Dec, PricePretty, RatePretty } from "@keplr-wallet/unit";
import { OsmosisAccountImpl } from "@osmosis-labs/stores";
import { Currency } from "@osmosis-labs/types";
import { useMutation } from "@tanstack/react-query";

import { EventName, SwapPage } from "~/config";
import { useAmplitudeAnalytics, useFeatureFlags } from "~/hooks";
import { useSwap } from "~/hooks/swap/use-swap";
import { type Route } from "~/hooks/swap/use-swap-tx-parameters";

export interface SwapTransactionData {
  isMultiHop: boolean;
  isMultiRoute: boolean;
  quoteTimeMilliseconds: number | undefined;
  router: "tfm" | "sidecar" | "legacy" | undefined;
  page: SwapPage;
  fromToken: string;
  tokenAmount: number;
  toToken: string;
  isOnHome: boolean;
  fee: any;
  coinAmount: CoinPretty;
  slippage: RatePretty;
  amountFiatValue?: PricePretty;
  osmosis: OsmosisAccountImpl;
  routes: Route[];
  tokenIn: {
    currency: Currency;
    amount: string;
  };
  tokenOutMinAmount: string;
}

const AMOUNT_LEFT_THRESHOLD = new Dec("0.1");

/**
 * Finalizes the data required for a swap transaction.
 * @param swapState - The state of the swap, obtained from the `useSwap` hook.
 * @param featureFlags - The feature flags, obtained from the `useFeatureFlags` hook.
 * @returns A partial `SwapTransactionData` object containing finalized, immutable swap transaction data, or `undefined` if the data cannot be finalized.
 */
export const finalizeSwapTxData = async (
  swapState: ReturnType<typeof useSwap>,
  featureFlags: ReturnType<typeof useFeatureFlags>
): Promise<
  | (Omit<SwapTransactionData, "page" | "slippage" | "osmosis" | "isOnHome"> & {
      amountAdjuestedForFees: boolean;
    })
  | undefined
> => {
  const {
    swapTxParameters,
    inAmountInput,
    networkFee,
    fromAsset,
    toAsset,
    quote,
  } = swapState;

  if (swapTxParameters === undefined) throw new Error("No messages");
  const { messages, routes, tokenIn, tokenOutMinAmount } = swapTxParameters;

  if (
    !inAmountInput.balance?.toDec().isPositive() ||
    !inAmountInput.amount?.toDec().isPositive()
  ) {
    return;
  }

  // Check that the amount is valid for the transaction
  if (inAmountInput.balance.toDec().lt(inAmountInput.amount.toDec())) {
    return;
  }

  let coinAmount = inAmountInput.amount;

  let amountAdjustedForFees = new Dec(0);

  // if the amount left in balance is below AMOUNT_LEFT_THRESHOLD, subtract the gas estimates from the amount to transfer, and set amountAdjustedForFees flag.
  if (
    networkFee?.gasAmount &&
    inAmountInput.balance
      .sub(inAmountInput.amount)
      .toDec()
      .lt(networkFee?.gasAmount.toDec())
  ) {
    amountAdjustedForFees = networkFee?.gasAmount.toDec();
    coinAmount = coinAmount.sub(amountAdjustedForFees);
  }

  const fee = networkFee && {
    preferNoSetFee: true,
    fee: {
      gas: networkFee.gasLimit,
      amount: networkFee.amount,
    },
  };

  const fromToken = fromAsset?.coinDenom;
  const toToken = toAsset?.coinDenom;
  const tokenAmount = Number(coinAmount);
  const isMultiHop =
    quote?.split.some(({ pools }) => pools.length !== 1) ?? false;
  const isMultiRoute = (quote?.split.length ?? 0) > 1;
  const quoteTimeMilliseconds = quote?.timeMs;
  const router = quote?.name;
  const amountFiatValue = quote?.amountFiatValue;

  return {
    fee,
    coinAmount,
    routes,
    tokenIn,
    tokenOutMinAmount,
    fromToken,
    tokenAmount,
    toToken,
    isMultiHop,
    isMultiRoute,
    quoteTimeMilliseconds,
    router,
    amountFiatValue,
    amountAdjuestedForFees: amountAdjustedForFees,
  };
};

/**
 * A React Query mutation sends a swap transaction.
 */
export const useSendSwapTxMutation = () => {
  const { logEvent } = useAmplitudeAnalytics();
  return useMutation({
    mutationFn: async ({
      fee,
      coinAmount,
      slippage,
      page,
      amountFiatValue,
      routes,
      tokenIn,
      tokenOutMinAmount,
      osmosis,
      ...baseEvent
    }: SwapTransactionData) => {
      logEvent([EventName.Swap.swapStarted, baseEvent]);

      const tx = await new Promise<"multiroute" | "multihop" | "exact-in">(
        (resolve, reject) => {
          undefined;
          if (routes.length === 1) {
            const { pools } = routes[0];
            osmosis.sendSwapExactAmountInMsg(
              pools,
              tokenIn,
              tokenOutMinAmount,
              undefined,
              fee,
              () => {
                resolve(pools.length === 1 ? "exact-in" : "multihop");
              }
            );
          } else if (routes.length > 1) {
            osmosis.sendSplitRouteSwapExactAmountInMsg(
              routes,
              tokenIn,
              tokenOutMinAmount,
              undefined,
              fee,
              () => {
                resolve("multiroute");
              }
            );
          } else {
            reject(new Error("No routes given"));
          }
        }
      );

      logEvent([
        EventName.Swap.swapCompleted,
        {
          ...baseEvent,
          isMultiHop: tx === "multihop",
          quoteTimeMilliseconds: baseEvent.quoteTimeMilliseconds,
          router: baseEvent.router,
          page,
          valueUsd: Number(amountFiatValue?.toString() ?? "0"),
        },
      ]);
    },
  });
};
