import { CoinPretty, Dec, PricePretty } from "@keplr-wallet/unit";
import {
  ObservableAddLiquidityConfig,
  ObservablePoolDetail,
  ObservableQueryPool,
  ObservableSuperfluidPoolDetail,
} from "@osmosis-labs/stores";
import { curveNatural } from "@visx/curve";
import { ParentSize } from "@visx/responsive";
import {
  AnimatedAxis, // any of these can be non-animated equivalents
  AnimatedGrid,
  AnimatedLineSeries,
  buildChartTheme,
  Tooltip,
  XYChart,
} from "@visx/xychart";
import classNames from "classnames";
import { debounce } from "debounce";
import { observer } from "mobx-react-lite";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/router";
import {
  FunctionComponent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-multi-lang";

import { findNearestTick, getPriceAtTick } from "~/utils/math";

import { useStore } from "../../stores";
import { theme } from "../../tailwind.config";
import { PoolAssetsIcon } from "../assets";
import { Button } from "../buttons";
import { InputBox } from "../input";
import { CustomClasses } from "../types";

const ConcentratedLiquidityDepthChart = dynamic(
  () => import("~/components/chart/concentrated-liquidity-depth"),
  { ssr: false }
);

const accessors = {
  xAccessor: (d: any) => {
    return d?.time;
  },
  yAccessor: (d: any) => {
    return d?.price;
  },
};

function getViewRangeFromData(data: number[], zoom = 1) {
  if (!data.length) {
    return {
      min: 0,
      max: 0,
      last: 0,
    };
  }
  const max = Math.max(...data);
  const min = Math.min(...data);
  const last = data[data.length - 1];
  const padding = Math.max(
    Math.max(Math.abs(last - max), Math.abs(last - min)),
    last * 0.25
  );

  const minWithPadding = Math.max(0, last - padding);
  const maxWithPadding = last + padding;

  const zoomMin = zoom > 1 ? minWithPadding / zoom : minWithPadding * zoom;
  const zoomMax = maxWithPadding * zoom;

  return {
    min: zoomMin,
    max: zoomMax,
    last,
  };
}

async function getDepthFromRange(min: number, max: number) {
  const returnData = await fetch(
    `http://localhost:1317/osmosis/concentratedliquidity/v1beta1/total_liquidity_for_range?pool_id=1`
  )
    .then((resp) => resp.json())
    .then((json) => {
      return (json?.liquidity || []).map(
        ({ liquidity_amount, lower_tick, upper_tick }: any) => ({
          amount: +liquidity_amount,
          lower: getPriceAtTick(lower_tick),
          upper: getPriceAtTick(upper_tick),
        })
      );
    })
    .then((data) => {
      const depths: { tick: number; depth: number }[] = [];

      for (let i = min; i <= max; i += (max - min) / 20) {
        depths.push({
          tick: i,
          depth: getLiqFrom(i, data),
        });
      }

      return depths;
    });

  return returnData;

  function getLiqFrom(
    target: number,
    list: { amount: number; lower: number; upper: number }[]
  ): number {
    const price = target;
    let val = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i].lower <= price && list[i].upper >= price) {
        val = list[i].amount;
      }
    }
    return val;
  }
}

export const AddConcLiquidity: FunctionComponent<
  {
    addLiquidityConfig: ObservableAddLiquidityConfig;
    actionButton: ReactNode;
    getFiatValue?: (coin: CoinPretty) => PricePretty | undefined;
  } & CustomClasses
> = observer(
  ({ className, addLiquidityConfig, actionButton, getFiatValue }) => {
    const router = useRouter();
    const { id: poolId } = router.query as { id: string };
    const { derivedDataStore } = useStore();

    // initialize pool data stores once root pool store is loaded
    const { poolDetail, superfluidPoolDetail } =
      typeof poolId === "string"
        ? derivedDataStore.getForPool(poolId as string)
        : {
            poolDetail: undefined,
            superfluidPoolDetail: undefined,
          };
    const pool = poolDetail?.pool;

    // user analytics
    const { poolName } = useMemo(
      () => ({
        poolName: pool?.poolAssets
          .map((poolAsset) => poolAsset.amount.denom)
          .join(" / "),
        poolWeight: pool?.weightedPoolInfo?.assets
          .map((poolAsset) => poolAsset.weightFraction.toString())
          .join(" / "),
      }),
      [pool?.poolAssets, pool?.weightedPoolInfo?.assets]
    );

    return (
      <div className={classNames("flex flex-col gap-8", className)}>
        {(() => {
          switch (addLiquidityConfig.conliqModalView) {
            case "overview":
              return (
                <Overview
                  pool={pool}
                  poolName={poolName}
                  poolDetail={poolDetail}
                  superfluidPoolDetail={superfluidPoolDetail}
                  addLiquidityConfig={addLiquidityConfig}
                />
              );
            case "add_manual":
              return (
                <AddConcLiqView
                  getFiatValue={getFiatValue}
                  pool={pool}
                  addLiquidityConfig={addLiquidityConfig}
                  actionButton={actionButton}
                />
              );
            case "add_managed":
              return null;
          }
        })()}
      </div>
    );
  }
);

const Overview: FunctionComponent<
  {
    pool?: ObservableQueryPool;
    poolName?: string;
    poolDetail?: ObservablePoolDetail;
    superfluidPoolDetail?: ObservableSuperfluidPoolDetail;
    addLiquidityConfig: ObservableAddLiquidityConfig;
  } & CustomClasses
> = observer(
  ({
    addLiquidityConfig,
    pool,
    poolName,
    superfluidPoolDetail,
    poolDetail,
  }) => {
    const { priceStore, queriesExternalStore } = useStore();
    const router = useRouter();
    const { id: poolId } = router.query as { id: string };
    const t = useTranslation();
    const [selected, selectView] =
      useState<typeof addLiquidityConfig.conliqModalView>("add_manual");
    const queryGammPoolFeeMetrics =
      queriesExternalStore.queryGammPoolFeeMetrics;

    return (
      <>
        <div className="align-center relative flex flex-row">
          <div className="absolute left-0 flex h-full items-center text-sm" />
          <div className="flex-1 text-center text-lg">
            {t("addConcentratedLiquidity.step1Title")}
          </div>
          <div className="absolute right-0 flex h-full items-center text-xs font-subtitle2 text-osmoverse-200" />
        </div>
        <div className="flex flex-row rounded-[28px] bg-osmoverse-900/[.3] px-8 py-4">
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex flex-row flex-nowrap items-center gap-2">
              {pool && (
                <PoolAssetsIcon
                  assets={pool.poolAssets.map(
                    (asset: { amount: CoinPretty }) => ({
                      coinDenom: asset.amount.denom,
                      coinImageUrl: asset.amount.currency.coinImageUrl,
                    })
                  )}
                  size="sm"
                />
              )}
              <h5 className="max-w-xs truncate">{poolName}</h5>
            </div>
            {superfluidPoolDetail?.isSuperfluid && (
              <span className="body2 text-superfluid-gradient">
                {t("pool.superfluidEnabled")}
              </span>
            )}
            {pool?.type === "stable" && (
              <div className="body2 text-gradient-positive flex items-center gap-1.5">
                <Image
                  alt=""
                  src="/icons/stableswap-pool.svg"
                  height={24}
                  width={24}
                />
                <span>{t("pool.stableswapEnabled")}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-10">
            <div className="space-y-2">
              <span className="body2 gap-2 text-osmoverse-400">
                {t("pool.24hrTradingVolume")}
              </span>
              <h5 className="text-osmoverse-100">
                {queryGammPoolFeeMetrics
                  .getPoolFeesMetrics(poolId, priceStore)
                  .volume24h.toString()}
              </h5>
            </div>
            <div className="space-y-2">
              <span className="body2 gap-2 text-osmoverse-400">
                {t("pool.liquidity")}
              </span>
              <h5 className="text-osmoverse-100">
                {poolDetail?.totalValueLocked.toString()}
              </h5>
            </div>
            <div className="space-y-2">
              <span className="body2 gap-2 text-osmoverse-400">
                {t("pool.swapFee")}
              </span>
              <h5 className="text-osmoverse-100">{pool?.swapFee.toString()}</h5>
            </div>
          </div>
        </div>
        <div className="flex flex-col">
          <div className="flex flex-row justify-center gap-8">
            <StrategySelector
              title={t("addConcentratedLiquidity.managed")}
              description={t("addConcentratedLiquidity.managedDescription")}
              selected={selected === "add_managed"}
              imgSrc="/images/managed_liquidity_mock.png"
            />
            <StrategySelector
              title={t("addConcentratedLiquidity.manual")}
              description={t("addConcentratedLiquidity.manualDescription")}
              selected={selected === "add_manual"}
              onClick={() => selectView("add_manual")}
              imgSrc="/images/conliq_mock_range.png"
            />
          </div>
        </div>
        <div className="flex w-full items-center justify-center">
          <Button
            className="w-[25rem]"
            onClick={() => addLiquidityConfig.setConliqModalView(selected)}
          >
            Next
          </Button>
        </div>
      </>
    );
  }
);

function StrategySelector(props: {
  title: string;
  description: string;
  selected: boolean;
  onClick?: () => void;
  imgSrc: string;
}) {
  const { selected, onClick, title, description, imgSrc } = props;
  return (
    <div
      className={classNames(
        "flex flex-1 flex-col items-center justify-center gap-4 rounded-[20px]",
        "border-2 border-osmoverse-700 py-6 px-8",
        {
          "border-osmoverse-100 bg-osmoverse-700": selected,
          "cursor-pointer hover:border-osmoverse-100 hover:bg-osmoverse-700 ":
            onClick,
        }
      )}
      onClick={onClick}
    >
      <div className="mb-16 text-h6 font-h6">{title}</div>
      <Image alt="" src={imgSrc} width={255} height={145} />
      <div className="text-center text-body2 font-body2 text-osmoverse-200">
        {description}
      </div>
    </div>
  );
}

const AddConcLiqView: FunctionComponent<
  {
    pool?: ObservableQueryPool;
    addLiquidityConfig: ObservableAddLiquidityConfig;
    actionButton: ReactNode;
    getFiatValue?: (coin: CoinPretty) => PricePretty | undefined;
  } & CustomClasses
> = observer(({ addLiquidityConfig, actionButton, getFiatValue, pool }) => {
  const baseDenom = pool?.poolAssets[0].amount.denom || "";
  const quoteDenom = pool?.poolAssets[1].amount.denom || "";
  const {
    conliqHistoricalRange,
    conliqRange,
    conliqQuoteDepositAmountIn,
    conliqBaseDepositAmountIn,
    setConliqQuoteDepositAmountIn,
    setConliqBaseDepositAmountIn,
    setConliqModalView,
    setConliqHistoricalRange,
    setConliqMaxRange,
    setConliqMinRange,
  } = addLiquidityConfig;

  const { queriesExternalStore } = useStore();
  const router = useRouter();
  const t = useTranslation();

  const [data, setData] = useState<{ price: number; time: number }[]>([]);
  const [depthData, setDepthData] = useState<{ tick: number; depth: number }[]>(
    []
  );
  const [inputMin, setInputMin] = useState("0");
  const [inputMax, setInputMax] = useState("0");
  const [zoom, setZoom] = useState(1);

  const { id: poolId } = router.query as { id: string };
  const viewRange = getViewRangeFromData(data.map(accessors.yAccessor), zoom);
  const rangeMin = Number(conliqRange[0].toString());
  const rangeMax = Number(conliqRange[1].toString());

  const xMax = Math.max(...depthData.map((d) => d.depth)) * 1.2;

  const query = queriesExternalStore.queryTokenPairHistoricalChart.get(
    poolId,
    addLiquidityConfig.conliqHistoricalRange,
    baseDenom,
    quoteDenom
  );

  useEffect(() => {
    (async () => {
      if (!viewRange.min && !viewRange.max) return;
      const data = await getDepthFromRange(viewRange.min, viewRange.max);
      setDepthData(data);
    })();
  }, [viewRange.min, viewRange.max]);

  const updateMin = useCallback(
    (val: string | number, shouldUpdateRange = false) => {
      const out = Math.min(Math.max(Number(val), 0), Number(inputMax));
      const price = getPriceAtTick(findNearestTick(out));
      if (shouldUpdateRange) setConliqMinRange(new Dec(price));
      if (Number(val) !== price) {
        setInputMin("" + price);
      } else {
        setInputMin("" + val);
      }
    },
    [inputMax, conliqRange]
  );

  const updateMax = useCallback(
    (val: string | number, shouldUpdateRange = false) => {
      const out = Math.max(Number(val), Number(inputMin));
      const price = getPriceAtTick(findNearestTick(out));
      if (shouldUpdateRange) setConliqMaxRange(new Dec(price));
      if (Number(val) !== price) {
        setInputMax("" + price);
      } else {
        setInputMax("" + val);
      }
    },
    [inputMin]
  );

  const updateInputAndRangeMinMax = useCallback(
    (_min: number, _max: number) => {
      setInputMin("" + _min);
      setInputMax("" + _max);
      setConliqMinRange(new Dec(_min));
      setConliqMaxRange(new Dec(_max));
    },
    []
  );

  const updateData = useCallback(
    (data: { price: number; time: number }[]) => {
      const last = data[data.length - 1];
      setData(data);
      updateInputAndRangeMinMax(last.price * 0.9, last.price * 1.15);
    },
    [updateInputAndRangeMinMax]
  );

  useEffect(() => {
    (async () => {
      if (!query.isFetching && query.getChartPrices) {
        updateData(
          query.getChartPrices.map(({ price, time }) => ({
            time,
            price: Number(price.toString()),
          }))
        );
      }
    })();
  }, [updateData, query.getChartPrices, query.isFetching]);

  return (
    <>
      <div className="align-center relative flex flex-row">
        <div
          className="absolute left-0 flex flex h-full cursor-pointer flex-row items-center text-sm"
          onClick={() => setConliqModalView("overview")}
        >
          <Image src="/icons/arrow-left.svg" width={24} height={24} />
          <span className="pl-1">{t("addConcentratedLiquidity.back")}</span>
        </div>
        <div className="flex-1 text-center text-lg">
          {t("addConcentratedLiquidity.step2Title")}
        </div>
        <div className="absolute right-0 flex h-full items-center text-xs font-subtitle2 text-osmoverse-200">
          {t("addConcentratedLiquidity.priceShownIn", {
            base: baseDenom,
            quote: quoteDenom,
          })}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="px-2 py-1 text-sm">
          {t("addConcentratedLiquidity.priceRange")}
        </div>
        <div className="flex flex-row">
          <div className="flex-shrink-1 flex h-[20.1875rem] w-0 flex-1 flex-col bg-osmoverse-700">
            <div className="flex flex-row">
              <div className="flex flex-1 flex-row pt-4 pl-4">
                <h4 className="row-span-2 pr-1 font-caption">
                  {!!data.length && data[data.length - 1].price.toFixed(2)}
                </h4>
                <div className="flex flex-col justify-center font-caption">
                  <div className="text-caption text-osmoverse-300">
                    {t("addConcentratedLiquidity.currentPrice")}
                  </div>
                  <div className="text-caption text-osmoverse-300">
                    {t("addConcentratedLiquidity.basePerQuote", {
                      base: baseDenom,
                      quote: quoteDenom,
                    })}
                  </div>
                </div>
              </div>
              <div className="flex flex-1 flex-row justify-end gap-1 pt-2 pr-2">
                <RangeSelector
                  label="7 day"
                  onClick={() => setConliqHistoricalRange("7d")}
                  selected={conliqHistoricalRange === "7d"}
                />
                <RangeSelector
                  label="30 days"
                  onClick={() => setConliqHistoricalRange("1mo")}
                  selected={conliqHistoricalRange === "1mo"}
                />
                <RangeSelector
                  label="1 year"
                  onClick={() => setConliqHistoricalRange("1y")}
                  selected={conliqHistoricalRange === "1y"}
                />
              </div>
            </div>
            <LineChart min={rangeMin} max={rangeMax} data={data} zoom={zoom} />
          </div>
          <div className="flex-shrink-1 flex h-[20.1875rem] w-0 flex-1 flex-row bg-osmoverse-700">
            <div className="flex flex-1 flex-col">
              <div className="mt-6 mr-6 flex h-6 flex-row justify-end gap-1">
                <SelectorWrapper
                  alt="refresh"
                  src="/icons/refresh-ccw.svg"
                  selected={false}
                  onClick={() => setZoom(1)}
                />
                <SelectorWrapper
                  alt="zoom in"
                  src="/icons/zoom-in.svg"
                  selected={false}
                  onClick={() => setZoom(Math.max(1, zoom - 0.2))}
                />
                <SelectorWrapper
                  alt="zoom out"
                  src="/icons/zoom-out.svg"
                  selected={false}
                  onClick={() => setZoom(zoom + 0.2)}
                />
              </div>
              <ConcentratedLiquidityDepthChart
                min={rangeMin}
                max={rangeMax}
                yRange={calculateRange(
                  viewRange.min,
                  viewRange.max,
                  rangeMin,
                  rangeMax,
                  viewRange.last
                )}
                xRange={[0, xMax]}
                data={depthData}
                annotationDatum={{ tick: viewRange.last, depth: xMax }}
                onMoveMax={debounce((val: number) => updateMax(val), 100)}
                onMoveMin={debounce((val: number) => updateMin(val), 100)}
                onSubmitMin={(val) => updateMin(val, true)}
                onSubmitMax={(val) => updateMax(val, true)}
                offset={{ top: 58 - 48, right: 36, bottom: 36, left: 0 }}
                horizontal
              />
            </div>
            <div className="flex flex-col items-center justify-center gap-4 pr-8">
              <PriceInputBox
                currentValue={inputMax}
                label="high"
                onChange={(val) => setInputMax(val)}
                onBlur={(e) => updateMax(+e.target.value, true)}
              />
              <PriceInputBox
                currentValue={inputMin}
                label="low"
                onChange={(val) => setInputMin(val)}
                onBlur={(e) => updateMin(+e.target.value, true)}
              />
            </div>
          </div>
        </div>
      </div>
      <VolitilitySelectorGroup
        lastPrice={viewRange.last}
        updateInputAndRangeMinMax={updateInputAndRangeMinMax}
        addLiquidityConfig={addLiquidityConfig}
      />
      <div className="flex flex-col">
        <div className="px-2 py-1 text-sm">Amount to deposit</div>
        <div className="flex flex-row justify-center rounded-[20px] bg-osmoverse-700 p-[1.25rem]">
          <DepositAmountGroup
            getFiatValue={getFiatValue}
            coin={pool?.poolAssets[0].amount}
            onUpdate={setConliqBaseDepositAmountIn}
            currentValue={conliqBaseDepositAmountIn}
          />
          <div className="mx-8 my-4">
            <Image
              alt=""
              className="m-4"
              src="/icons/link-2.svg"
              width={35}
              height={35}
            />
          </div>
          <DepositAmountGroup
            getFiatValue={getFiatValue}
            coin={pool?.poolAssets[1].amount}
            onUpdate={setConliqQuoteDepositAmountIn}
            currentValue={conliqQuoteDepositAmountIn}
          />
        </div>
      </div>
      {actionButton}
    </>
  );
});

const VolitilitySelectorGroup: FunctionComponent<
  {
    addLiquidityConfig: ObservableAddLiquidityConfig;
    lastPrice: number;
    updateInputAndRangeMinMax: (min: number, max: number) => void;
  } & CustomClasses
> = observer((props) => {
  const t = useTranslation();

  return (
    <div className="flex flex-row">
      <div className="mx-4 flex max-w-[16.375rem] flex-col">
        <div className="text-subtitle1">
          {t("addConcentratedLiquidity.selectVolatilityRange")}
        </div>
        <div className="text-caption font-caption text-osmoverse-200">
          {t("addConcentratedLiquidity.volatilityDescription")}
        </div>
        <a
          className="flex flex-row items-center text-caption font-caption text-wosmongton-300"
          href="#"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("addConcentratedLiquidity.superchargedLearnMore")}
          <Image src="/icons/arrow-right.svg" height={12} width={12} />
        </a>
      </div>
      <div className="flex flex-1 flex-row justify-end gap-4">
        <PresetVolatilityCard
          src="/images/small-vial.svg"
          lastPrice={props.lastPrice}
          updateInputAndRangeMinMax={props.updateInputAndRangeMinMax}
          addLiquidityConfig={props.addLiquidityConfig}
        />
        <PresetVolatilityCard
          src="/images/medium-vial.svg"
          upper={0.25}
          lower={-0.25}
          lastPrice={props.lastPrice}
          updateInputAndRangeMinMax={props.updateInputAndRangeMinMax}
          addLiquidityConfig={props.addLiquidityConfig}
        />
        <PresetVolatilityCard
          src="/images/large-vial.svg"
          upper={0.5}
          lower={-0.5}
          lastPrice={props.lastPrice}
          updateInputAndRangeMinMax={props.updateInputAndRangeMinMax}
          addLiquidityConfig={props.addLiquidityConfig}
        />
      </div>
    </div>
  );
});

function SelectorWrapper(props: {
  src?: string;
  alt?: string;
  label?: string;
  selected: boolean;
  onClick: () => void;
}) {
  const isImage = !!props.src && !props.label;
  const isLabel = !!props.label && !props.src;

  return (
    <div
      className={classNames(
        "flex h-6 cursor-pointer flex-row items-center justify-center rounded-lg bg-osmoverse-800 px-2 text-xs hover:bg-osmoverse-900",
        {
          "!bg-osmoverse-900": props.selected,
        }
      )}
      onClick={props.onClick}
    >
      {isImage && (
        <Image
          alt={props.alt}
          src={props.src as string}
          width={16}
          height={16}
        />
      )}
      {isLabel && props.label}
    </div>
  );
}

function RangeSelector(props: {
  label: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <SelectorWrapper
      label={props.label}
      selected={props.selected}
      onClick={props.onClick}
    />
  );
}

const DepositAmountGroup: FunctionComponent<{
  getFiatValue?: (coin: CoinPretty) => PricePretty | undefined;
  coin?: CoinPretty;
  onUpdate: (amount: number) => void;
  currentValue: Dec;
}> = observer(({ coin, onUpdate, currentValue }) => {
  const { priceStore, assetsStore } = useStore();
  const [value, setValue] = useState(0);

  const { nativeBalances, ibcBalances } = assetsStore;

  const fiatPer = coin?.currency.coinGeckoId
    ? priceStore.getPrice(coin.currency.coinGeckoId, undefined)
    : 0;

  const [walletBalance] = nativeBalances
    .concat(ibcBalances)
    .filter((balance) => balance.balance.denom === coin?.denom);

  const updateValue = useCallback(
    (val: string) => {
      const newVal = Number(val);
      setValue(newVal);
      onUpdate(newVal);
    },
    [onUpdate]
  );

  return (
    <div className="flex-0 flex flex-shrink-0 flex-row items-center">
      <div className="flex flex-row items-center">
        {coin?.currency.coinImageUrl && (
          <Image
            alt=""
            src={coin?.currency.coinImageUrl}
            height={58}
            width={58}
          />
        )}
        <div className="ml-[.75rem] mr-[2.75rem] flex flex-col">
          <h6>{coin?.denom.toUpperCase()}</h6>
          <div className="text-osmoverse-200">50%</div>
        </div>
        <div>
          <div className="text-right text-caption text-wosmongton-300">
            {walletBalance?.balance.toString()}
          </div>
          <div className="flex h-16 w-[158px] flex-col items-end justify-center rounded-[12px] bg-osmoverse-800">
            <InputBox
              className="border-0 bg-transparent text-h5"
              inputClassName="!leading-4"
              type="number"
              currentValue={String(value)}
              onInput={updateValue}
              rightEntry
            />
            <div className="pr-3 text-caption text-osmoverse-400">
              {fiatPer && `~$${currentValue.mul(new Dec(fiatPer)).toString(2)}`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const PresetVolatilityCard: FunctionComponent<
  {
    src: string;
    updateInputAndRangeMinMax: (min: number, max: number) => void;
    addLiquidityConfig: ObservableAddLiquidityConfig;
    lastPrice: number;
    width?: number;
    height?: number;
    upper?: number;
    lower?: number;
    selected?: boolean;
  } & CustomClasses
> = observer(
  ({
    src,
    width,
    height,
    upper,
    lower,
    lastPrice,
    addLiquidityConfig,
    updateInputAndRangeMinMax,
  }) => {
    const isFullRange = !upper && !lower;
    const { conliqRange, conliqFullRange, setConliqFullRange } =
      addLiquidityConfig;
    const rangeMin = Number(conliqRange[0].toString());
    const rangeMax = Number(conliqRange[1].toString());
    const isSelected = !isFullRange
      ? lastPrice * (1 + (lower as number)) === rangeMin &&
        lastPrice * (1 + (upper as number)) === rangeMax
      : conliqFullRange;

    const onClick = useCallback(() => {
      if (isFullRange) {
        setConliqFullRange(true);
        updateInputAndRangeMinMax(0, 0);
      } else {
        setConliqFullRange(false);
        updateInputAndRangeMinMax(
          lastPrice * (1 + (lower as number)),
          lastPrice * (1 + (upper as number))
        );
      }
    }, [
      isFullRange,
      setConliqFullRange,
      updateInputAndRangeMinMax,
      lastPrice,
      upper,
      lower,
    ]);

    return (
      <div
        className={classNames(
          "flex h-[5.625rem] w-[10.625rem] cursor-pointer flex-row",
          "overflow-hidden rounded-[1.125rem] border-[1.5px] bg-osmoverse-700",
          "border-transparent hover:border-wosmongton-200",
          {
            "border-osmoverse-200": isSelected,
          }
        )}
        onClick={onClick}
      >
        <div className="flex w-full flex-row items-end justify-end">
          <div className="flex-shrink-1 flex h-full flex-1 flex-row items-end items-center justify-center">
            <Image
              alt=""
              className="flex-0 ml-2"
              src={src}
              width={width || 64}
              height={height || 64}
            />
          </div>
          <div className="flex h-full flex-1 flex-col justify-center">
            {!isFullRange ? (
              <>
                <div className="flex flex-row items-center">
                  <Image
                    alt=""
                    src="/icons/green-up-tick.svg"
                    width={16}
                    height={16}
                  />
                  <div className="flex-1 pr-4 text-right text-subtitle1 text-osmoverse-200">
                    +{(upper as number) * 100}%
                  </div>
                </div>
                <div className="flex flex-row items-center">
                  <Image
                    alt=""
                    src="/icons/red-down-tick.svg"
                    width={16}
                    height={16}
                  />
                  <div className="flex-1 pr-4 text-right text-subtitle1 text-osmoverse-200">
                    {(lower as number) * 100}%
                  </div>
                </div>
              </>
            ) : (
              <div>Full Range</div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

function PriceInputBox(props: {
  label: string;
  currentValue: string;
  onChange: (val: string) => void;
  onBlur: (e: any) => void;
}) {
  return (
    <div className="flex max-w-[9.75rem] flex-col items-end rounded-xl bg-osmoverse-800 px-2">
      <span className="px-2 pt-2 text-caption text-osmoverse-400">
        {props.label}
      </span>
      <InputBox
        className="border-0 bg-transparent text-subtitle1 leading-tight"
        type="number"
        rightEntry
        currentValue={props.currentValue}
        onInput={(val) => props.onChange(val)}
        onBlur={props.onBlur}
      />
    </div>
  );
}

function calculateRange(
  min: number,
  max: number,
  inputMin: number,
  inputMax: number,
  last: number
): [number, number] {
  let outMin = min;
  let outMax = max;

  const delta =
    Math.max(last - inputMin, inputMax - last, last - min, max - last) * 1.5;

  if (inputMin < min * 1.2 || inputMax > max * 0.8) {
    outMin = last - delta;
    outMax = last + delta;
  }

  return [Math.max(0, Math.min(outMin, outMax)), Math.max(outMax, outMin)];
}

function LineChart(props: {
  min: number;
  max: number;
  zoom: number;
  data: { price: number; time: number }[];
}) {
  const yRange = getViewRangeFromData(
    props.data.map(accessors.yAccessor),
    props.zoom
  );

  const domain = calculateRange(
    yRange.min,
    yRange.max,
    props.min,
    props.max,
    yRange.last
  );

  return (
    <ParentSize className="flex-shrink-1 flex-1 overflow-hidden">
      {({ height, width }) => {
        return (
          <XYChart
            key="line-chart"
            margin={{ top: 0, right: 0, bottom: 36, left: 50 }}
            height={height}
            width={width}
            xScale={{
              type: "utc",
              paddingInner: 0.5,
            }}
            yScale={{
              type: "linear",
              domain: domain,
              zero: false,
            }}
            theme={buildChartTheme({
              backgroundColor: "transparent",
              colors: ["white"],
              gridColor: theme.colors.osmoverse["600"],
              gridColorDark: theme.colors.osmoverse["300"],
              svgLabelSmall: {
                fill: theme.colors.osmoverse["300"],
                fontSize: 12,
                fontWeight: 500,
              },
              svgLabelBig: {
                fill: theme.colors.osmoverse["300"],
                fontSize: 12,
                fontWeight: 500,
              },
              tickLength: 1,
              xAxisLineStyles: {
                strokeWidth: 0,
              },
              xTickLineStyles: {
                strokeWidth: 0,
              },
              yAxisLineStyles: {
                strokeWidth: 0,
              },
            })}
          >
            <AnimatedAxis orientation="bottom" numTicks={4} />
            <AnimatedAxis orientation="left" numTicks={5} strokeWidth={0} />
            <AnimatedGrid
              columns={false}
              // rows={false}
              numTicks={5}
            />
            <AnimatedLineSeries
              dataKey="price"
              data={props.data}
              curve={curveNatural}
              {...accessors}
              stroke={theme.colors.wosmongton["200"]}
            />
            <Tooltip
              // showVerticalCrosshair
              // showHorizontalCrosshair
              snapTooltipToDatumX
              snapTooltipToDatumY
              detectBounds
              showDatumGlyph
              glyphStyle={{
                strokeWidth: 0,
                fill: theme.colors.wosmongton["200"],
              }}
              horizontalCrosshairStyle={{
                strokeWidth: 1,
                stroke: "#ffffff",
              }}
              verticalCrosshairStyle={{
                strokeWidth: 1,
                stroke: "#ffffff",
              }}
              renderTooltip={({ tooltipData }: any) => {
                return (
                  <div className={`bg-osmoverse-800 p-2 text-xs leading-4`}>
                    <div className="text-white-full">
                      {tooltipData?.nearestDatum?.datum?.price.toFixed(4)}
                    </div>
                    <div className="text-osmoverse-300">
                      {`High: ${Math.max(
                        ...props.data.map(accessors.yAccessor)
                      ).toFixed(4)}`}
                    </div>
                    <div className="text-osmoverse-300">
                      {`Low: ${Math.min(
                        ...props.data.map(accessors.yAccessor)
                      ).toFixed(4)}`}
                    </div>
                  </div>
                );
              }}
            />
          </XYChart>
        );
      }}
    </ParentSize>
  );
}
