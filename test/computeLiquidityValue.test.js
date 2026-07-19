// Ported from test/ExampleComputeLiquidityValue.spec.ts. Gas-cost snapshots
// were dropped. State is built up sequentially on two pairs (fee off / fee on)
// instead of waffle fixture snapshots; each on-chain state matches the
// original spec's state at the equivalent assertion point.
const { test, before } = require("node:test");
const { assert, qc, getContext, deploy, send, scalar, expandTo18Decimals, MaxUint256 } = require("./helpers");
const { artifacts, createPair } = require("./fixtures");

const overrides = { gasLimit: 6_000_000n };

let wallet;
let wq;

// fee-off setup
let factoryA;
let routerA;
let pairA;
let token0A;
let token1A;
let computeA;

before(async () => {
  ({ wallet } = await getContext());
  wq = await deploy(artifacts.wq());
  factoryA = await deploy(artifacts.factory(), [wallet.address]);
  routerA = await deploy(artifacts.router02(), [factoryA.target, wq.target]);
  ({ token0: token0A, token1: token1A, pair: pairA } = await createPair(factoryA));
  // mint some liquidity for the pair at 1:100 (100 shares minted)
  await send(token0A.transfer(pairA.target, expandTo18Decimals(10), overrides));
  await send(token1A.transfer(pairA.target, expandTo18Decimals(1000), overrides));
  await send(pairA.mint(wallet.address, overrides));
  assert.equal(scalar(await pairA.totalSupply()), expandTo18Decimals(100));
  computeA = await deploy(artifacts.computeLiquidityValue(), [factoryA.target]);
});

function pairOf(value) {
  return [BigInt(value[0]), BigInt(value[1])];
}

test("correct factory address", async () => {
  assert.equal(String(await computeA.factory()).toLowerCase(), String(factoryA.target).toLowerCase());
});

test("getLiquidityValue: correct for 5 and 7 shares", async () => {
  assert.deepEqual(
    pairOf(await computeA.getLiquidityValue(token0A.target, token1A.target, expandTo18Decimals(5))),
    [500000000000000000n, 50000000000000000000n]
  );
  assert.deepEqual(
    pairOf(await computeA.getLiquidityValue(token0A.target, token1A.target, expandTo18Decimals(7))),
    [700000000000000000n, 70000000000000000000n]
  );
});

test("getReservesAfterArbitrage", async () => {
  const cases = [
    [1n, 400n, 5007516917298542016n, 1999997739838173075192n],
    [1n, 200n, 7081698338256310291n, 1413330640570018326894n],
    [1n, 100n, 10000000000000000000n, 1000000000000000000000n],
    [1n, 50n, 14133306405700183269n, 708169833825631029041n],
    [1n, 25n, 19999977398381730752n, 500751691729854201595n],
    [25n, 1n, 500721601459041764285n, 20030067669194168064n],
    [MaxUint256 / 1000n, MaxUint256 / 1000n, 100120248075158403008n, 100150338345970840319n],
  ];
  for (const [truePriceA, truePriceB, expectedA, expectedB] of cases) {
    assert.deepEqual(
      pairOf(await computeA.getReservesAfterArbitrage(token0A.target, token1A.target, truePriceA, truePriceB)),
      [expectedA, expectedB],
      `getReservesAfterArbitrage ${truePriceA}/${truePriceB}`
    );
  }
});

test("getLiquidityValueAfterArbitrageToPrice: fee off, no swap", async () => {
  assert.deepEqual(
    pairOf(
      await computeA.getLiquidityValueAfterArbitrageToPrice(token0A.target, token1A.target, 1n, 105n, expandTo18Decimals(5))
    ),
    [488683612488266114n, 51161327957205755422n]
  );
  assert.deepEqual(
    pairOf(
      await computeA.getLiquidityValueAfterArbitrageToPrice(token0A.target, token1A.target, 1n, 95n, expandTo18Decimals(5))
    ),
    [512255881944227034n, 48807237571060645526n]
  );
  assert.deepEqual(
    pairOf(
      await computeA.getLiquidityValueAfterArbitrageToPrice(token0A.target, token1A.target, 1n, 100n, expandTo18Decimals(5))
    ),
    [500000000000000000n, 50000000000000000000n]
  );
});

test("fee off: after swap to ~1:25", async () => {
  await send(token0A.approve(routerA.target, MaxUint256, overrides));
  await send(
    routerA.swapExactTokensForTokens(
      expandTo18Decimals(10),
      0n,
      [token0A.target, token1A.target],
      wallet.address,
      MaxUint256,
      overrides
    )
  );
  const reserves = await pairA.getReserves();
  assert.equal(BigInt(reserves[0]), 20000000000000000000n);
  assert.equal(BigInt(reserves[1]), 500751126690035052579n); // half plus the fee

  // getLiquidityValue: correct after swap (original spec swapped 10 from the same base state)
  assert.deepEqual(
    pairOf(await computeA.getLiquidityValue(token0A.target, token1A.target, expandTo18Decimals(7))),
    [1400000000000000000n, 35052578868302453680n]
  );

  // is roughly 1/25th liquidity
  assert.deepEqual(
    pairOf(
      await computeA.getLiquidityValueAfterArbitrageToPrice(token0A.target, token1A.target, 1n, 25n, expandTo18Decimals(5))
    ),
    [1000000000000000000n, 25037556334501752628n]
  );

  // shares after arbing back to 1:100
  assert.deepEqual(
    pairOf(
      await computeA.getLiquidityValueAfterArbitrageToPrice(token0A.target, token1A.target, 1n, 100n, expandTo18Decimals(5))
    ),
    [501127678536722155n, 50037429168613534246n]
  );
});

test("fee on: swap and liquidity values", async () => {
  // separate factory so the fee switch does not affect the fee-off pair
  const factoryB = await deploy(artifacts.factory(), [wallet.address]);
  await send(factoryB.setFeeTo(wallet.address, overrides));
  const routerB = await deploy(artifacts.router02(), [factoryB.target, wq.target]);
  const { token0, token1, pair } = await createPair(factoryB);
  const computeB = await deploy(artifacts.computeLiquidityValue(), [factoryB.target]);

  // 100 shares at 1:100, then 100 more to the zero address (causes kLast to be set)
  await send(token0.transfer(pair.target, expandTo18Decimals(10), overrides));
  await send(token1.transfer(pair.target, expandTo18Decimals(1000), overrides));
  await send(pair.mint(wallet.address, overrides));
  await send(token0.transfer(pair.target, expandTo18Decimals(10), overrides));
  await send(token1.transfer(pair.target, expandTo18Decimals(1000), overrides));
  await send(pair.mint(qc.ZeroAddress, overrides));
  assert.equal(scalar(await pair.totalSupply()), expandTo18Decimals(200));

  // no fee to be collected (no swap yet)
  assert.deepEqual(
    pairOf(
      await computeB.getLiquidityValueAfterArbitrageToPrice(token0.target, token1.target, 1n, 105n, expandTo18Decimals(5))
    ),
    [488680839243189328n, 51161037620273529068n]
  );
  assert.deepEqual(
    pairOf(
      await computeB.getLiquidityValueAfterArbitrageToPrice(token0.target, token1.target, 1n, 95n, expandTo18Decimals(5))
    ),
    [512252817918759166n, 48806945633721895174n]
  );
  assert.deepEqual(
    pairOf(
      await computeB.getLiquidityValueAfterArbitrageToPrice(token0.target, token1.target, 1n, 100n, expandTo18Decimals(5))
    ),
    [500000000000000000n, 50000000000000000000n]
  );

  // swap to ~1:25
  await send(token0.approve(routerB.target, MaxUint256, overrides));
  await send(
    routerB.swapExactTokensForTokens(
      expandTo18Decimals(20),
      0n,
      [token0.target, token1.target],
      wallet.address,
      MaxUint256,
      overrides
    )
  );
  const reserves = await pair.getReserves();
  assert.equal(BigInt(reserves[0]), 40000000000000000000n);
  assert.equal(BigInt(reserves[1]), 1001502253380070105158n); // half plus the fee

  // getLiquidityValue: correct after swap (fee on)
  assert.deepEqual(
    pairOf(await computeB.getLiquidityValue(token0.target, token1.target, expandTo18Decimals(7))),
    [1399824934325735058n, 35048195651620807684n]
  );

  // is roughly 1:25
  assert.deepEqual(
    pairOf(
      await computeB.getLiquidityValueAfterArbitrageToPrice(token0.target, token1.target, 1n, 25n, expandTo18Decimals(5))
    ),
    [999874953089810756n, 25034425465443434060n]
  );

  // shares after arbing back to 1:100
  assert.deepEqual(
    pairOf(
      await computeB.getLiquidityValueAfterArbitrageToPrice(token0.target, token1.target, 1n, 100n, expandTo18Decimals(5))
    ),
    [501002443792372662n, 50024924521757597314n]
  );
});
