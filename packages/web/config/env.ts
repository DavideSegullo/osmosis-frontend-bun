export const IS_TESTNET = process.env.NEXT_PUBLIC_IS_TESTNET === "true";

export const OSMOSIS_RPC_OVERWRITE =
  process.env.NEXT_PUBLIC_OSMOSIS_RPC_OVERWRITE;
export const OSMOSIS_REST_OVERWRITE =
  process.env.NEXT_PUBLIC_OSMOSIS_REST_OVERWRITE;
export const OSMOSIS_EXPLORER_URL_OVERWRITE =
  process.env.NEXT_PUBLIC_OSMOSIS_EXPLORER_URL_OVERWRITE;
export const OSMOSIS_CHAIN_ID_OVERWRITE =
  process.env.NEXT_PUBLIC_OSMOSIS_CHAIN_ID_OVERWRITE;
export const OSMOSIS_CHAIN_NAME_OVERWRITE =
  process.env.NEXT_PUBLIC_OSMOSIS_CHAIN_NAME_OVERWRITE;

console.log(IS_TESTNET)
console.log(process.env.NEXT_PUBLIC_IS_TESTNET)
console.log(process.env.NEXT_PUBLIC_OSMOSIS_CHAIN_NAME_OVERWRITE)
console.log(process.env.NEXT_PUBLIC_OSMOSIS_RPC_OVERWRITE)
console.log(process.env.NEXT_PUBLIC_OSMOSIS_REST_OVERWRITE)
console.log(OSMOSIS_CHAIN_NAME_OVERWRITE)

export const WALLETCONNECT_PROJECT_KEY =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_KEY;
export const WALLETCONNECT_RELAY_URL =
  process.env.NEXT_PUBLIC_WALLETCONNECT_RELAY_URL;

export const TIMESERIES_DATA_URL = process.env.NEXT_PUBLIC_TIMESERIES_DATA_URL;
export const INDEXER_DATA_URL = process.env.NEXT_PUBLIC_INDEXER_DATA_URL;
