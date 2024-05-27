import { EncodeObject } from "@cosmjs/proto-signing";
import { CoinPretty, Dec, DecUtils, PricePretty } from "@keplr-wallet/unit";
import { DEFAULT_VS_CURRENCY, superjson } from "@osmosis-labs/server";
import {
  AccountStore,
  AccountStoreWallet,
  CosmosAccount,
  CosmwasmAccount,
  OsmosisAccount,
  SignOptions,
} from "@osmosis-labs/stores";
import { QuoteStdFee } from "@osmosis-labs/tx";
import { isNil } from "@osmosis-labs/utils";
import { useQuery } from "@tanstack/react-query";
import cachified, { CacheEntry } from "cachified";
import { LRUCache } from "lru-cache";

import { useStore } from "~/stores";
import { api } from "~/utils/trpc";

interface QueryResult {
  gasUsdValueToPay: PricePretty;
  gasAmount: CoinPretty;
  gasLimit: string;
  amount: QuoteStdFee["amount"];
}

async function estimateTxFeesQueryFn({
  wallet,
  messages,
  apiUtils,
  accountStore,
  signOptions,
}: {
  wallet: AccountStoreWallet<[OsmosisAccount, CosmosAccount, CosmwasmAccount]>;
  accountStore: AccountStore<[OsmosisAccount, CosmosAccount, CosmwasmAccount]>;
  messages: EncodeObject[];
  apiUtils: ReturnType<typeof api.useUtils>;
  sendToken?: {
    balance: CoinPretty;
    amount: CoinPretty;
  };
  signOptions?: SignOptions;
}): Promise<QueryResult> {
  if (!messages.length) throw new Error("No messages");

  const { amount, gas } = await accountStore.estimateFee({
    wallet,
    messages,
    signOptions: {
      ...wallet.walletInfo?.signOptions,
      ...signOptions,
      preferNoSetFee: true, // this will automatically calculate the amount as well.
    },
  });

  const fee = amount[0];
  const asset = await getCachedAssetWithPrice(apiUtils, fee.denom);

  if (!fee || !asset?.currentPrice) {
    throw new Error("Failed to estimate fees");
  }

  const coinAmountDec = new Dec(fee.amount);
  const usdValue = coinAmountDec
    .quo(DecUtils.getTenExponentN(asset.coinDecimals))
    .mul(asset.currentPrice.toDec());
  const gasUsdValueToPay = new PricePretty(DEFAULT_VS_CURRENCY, usdValue);

  return {
    gasUsdValueToPay,
    gasAmount: new CoinPretty(asset, coinAmountDec),
    gasLimit: gas,
    amount,
  };
}

export function useEstimateTxFees({
  messages,
  chainId,
  signOptions,
  enabled = true,
}: {
  messages: EncodeObject[] | undefined;
  chainId: string;
  enabled?: boolean;
  signOptions?: SignOptions;
}) {
  const { accountStore } = useStore();
  const apiUtils = api.useUtils();

  const wallet = accountStore.getWallet(chainId);

  const queryResult = useQuery<QueryResult, Error, QueryResult, string[]>({
    queryKey: ["estimate-tx-fees", superjson.stringify({ ...messages })],
    queryFn: () => {
      if (!wallet) throw new Error(`No wallet found for chain ID: ${chainId}`);
      return estimateTxFeesQueryFn({
        wallet,
        accountStore,
        messages: messages!,
        apiUtils,
        signOptions,
      });
    },
    staleTime: 3_000, // 3 seconds
    cacheTime: 3_000, // 3 seconds
    retry: false,
    enabled:
      enabled &&
      !isNil(messages) &&
      Array.isArray(messages) &&
      messages.length > 0 &&
      wallet?.address !== undefined &&
      typeof wallet?.address === "string",
  });

  return queryResult;
}

const getAssetCache = new LRUCache<string, CacheEntry>({ max: 50 });
function getCachedAssetWithPrice(
  apiUtils: ReturnType<typeof api.useUtils>,
  coinMinimalDenom: string
) {
  return cachified({
    cache: getAssetCache,
    key: coinMinimalDenom,
    ttl: 1000 * 10, // 10 seconds
    getFreshValue: () =>
      apiUtils.edge.assets.getAssetWithPrice.fetch({
        coinMinimalDenom,
      }),
  });
}
