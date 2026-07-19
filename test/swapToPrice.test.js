// Ported from test/ExampleSwapToPrice.spec.ts. The gas snapshot was dropped.
// Each price-moving test uses a fresh pair set up at 1:100, matching the
// original spec's fresh fixture per test.
const { test, before } = require("node:test");
const {
  assert,
  getContext,
  deploy,
  send,
  expectRevert,
  staticCall,
  parseEvents,
  expandTo18Decimals,
  MaxUint256,
} = require("./helpers");
const { artifacts, createPair } = require("./fixtures");

const overrides = { gasLimit: 6_000_000n };

let wallet;
let factory;
let router;
let swapToPrice;
before(async () => {
  ({ wallet } = await getContext());
  const wq = await deploy(artifacts.wq());
  factory = await deploy(artifacts.factory(), [wallet.address]);
  router = await deploy(artifacts.router02(), [factory.target, wq.target]);
  swapToPrice = await deploy(artifacts.swapToPrice(), [factory.target, router.target]);
});

// fresh pair with a 1:100 price differential, tokens approved for the example
async function priceDifferentialPair() {
  const fixture = await createPair(factory);
  await send(fixture.token0.transfer(fixture.pair.target, expandTo18Decimals(10), overrides));
  await send(fixture.token1.transfer(fixture.pair.target, expandTo18Decimals(1000), overrides));
  await send(fixture.pair.sync(overrides));
  await send(fixture.token0.approve(swapToPrice.target, MaxUint256, overrides));
  await send(fixture.token1.approve(swapToPrice.target, MaxUint256, overrides));
  return fixture;
}

function findTransfer(events, from, to, value) {
  return events.some(
    (event) =>
      String(event.args[0]).toLowerCase() === String(from).toLowerCase() &&
      String(event.args[1]).toLowerCase() === String(to).toLowerCase() &&
      BigInt(event.args[2]) === value
  );
}

test("correct router address", async () => {
  assert.equal(String(await swapToPrice.router()).toLowerCase(), String(router.target).toLowerCase());
});

test("requires non-zero true price inputs", async () => {
  const { token0, token1 } = await priceDifferentialPair();
  for (const [priceA, priceB] of [
    [0n, 0n],
    [10n, 0n],
    [0n, 10n],
  ]) {
    await expectRevert(
      staticCall(swapToPrice, "swapToPrice", [
        token0.target,
        token1.target,
        priceA,
        priceB,
        MaxUint256,
        MaxUint256,
        wallet.address,
        MaxUint256,
      ]),
      "ExampleSwapToPrice: ZERO_PRICE"
    );
  }
  // requires non-zero max spend
  await expectRevert(
    staticCall(swapToPrice, "swapToPrice", [token0.target, token1.target, 1n, 100n, 0n, 0n, wallet.address, MaxUint256]),
    "ExampleSwapToPrice: ZERO_SPEND"
  );
});

test("moves the price to 1:90", async () => {
  const { token0, token1, pair } = await priceDifferentialPair();
  const receipt = await send(
    swapToPrice.swapToPrice(token0.target, token1.target, 1n, 90n, MaxUint256, MaxUint256, wallet.address, MaxUint256, overrides)
  );
  // (1e19 + 526682316179835569) : (1e21 - 49890467170695440744) ~= 1:90
  const amountIn = 526682316179835569n;
  const amountOut = 49890467170695440744n;
  const token0Transfers = parseEvents(receipt, token0, "Transfer");
  assert.ok(findTransfer(token0Transfers, wallet.address, swapToPrice.target, amountIn), "wallet -> example transfer");
  assert.ok(findTransfer(token0Transfers, swapToPrice.target, pair.target, amountIn), "example -> pair transfer");
  const approvals = parseEvents(receipt, token0, "Approval");
  assert.ok(findTransfer(approvals, swapToPrice.target, router.target, amountIn), "example -> router approval");
  const token1Transfers = parseEvents(receipt, token1, "Transfer");
  assert.ok(findTransfer(token1Transfers, pair.target, wallet.address, amountOut), "pair -> wallet transfer");
});

test("moves the price to 1:110", async () => {
  const { token0, token1, pair } = await priceDifferentialPair();
  const receipt = await send(
    swapToPrice.swapToPrice(token0.target, token1.target, 1n, 110n, MaxUint256, MaxUint256, wallet.address, MaxUint256, overrides)
  );
  // (1e21 + 47376582963642643588) : (1e19 - 451039908682851138) ~= 1:110
  const amountIn = 47376582963642643588n;
  const amountOut = 451039908682851138n;
  const token1Transfers = parseEvents(receipt, token1, "Transfer");
  assert.ok(findTransfer(token1Transfers, wallet.address, swapToPrice.target, amountIn), "wallet -> example transfer");
  assert.ok(findTransfer(token1Transfers, swapToPrice.target, pair.target, amountIn), "example -> pair transfer");
  const approvals = parseEvents(receipt, token1, "Approval");
  assert.ok(findTransfer(approvals, swapToPrice.target, router.target, amountIn), "example -> router approval");
  const token0Transfers = parseEvents(receipt, token0, "Transfer");
  assert.ok(findTransfer(token0Transfers, pair.target, wallet.address, amountOut), "pair -> wallet transfer");
});

test("reverse token order", async () => {
  const { token0, token1, pair } = await priceDifferentialPair();
  const receipt = await send(
    swapToPrice.swapToPrice(token1.target, token0.target, 110n, 1n, MaxUint256, MaxUint256, wallet.address, MaxUint256, overrides)
  );
  const amountIn = 47376582963642643588n;
  const amountOut = 451039908682851138n;
  const token1Transfers = parseEvents(receipt, token1, "Transfer");
  assert.ok(findTransfer(token1Transfers, wallet.address, swapToPrice.target, amountIn), "wallet -> example transfer");
  assert.ok(findTransfer(token1Transfers, swapToPrice.target, pair.target, amountIn), "example -> pair transfer");
  const token0Transfers = parseEvents(receipt, token0, "Transfer");
  assert.ok(findTransfer(token0Transfers, pair.target, wallet.address, amountOut), "pair -> wallet transfer");
});
