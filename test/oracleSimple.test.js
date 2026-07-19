// Ported from test/ExampleOracleSimple.spec.ts. The devnet cannot mine blocks
// at chosen timestamps, so the oracle PERIOD is a constructor parameter
// (24 hours in the original; a short period here) and elapsed time is
// measured from real on-chain timestamps. Because the pair price never
// changes during the test, the TWAP equals the spot price exactly and the
// original exact-math assertions still hold.
const { test, before } = require("node:test");
const {
  assert,
  getContext,
  deploy,
  send,
  expectRevert,
  staticCall,
  scalar,
  expandTo18Decimals,
  encodePrice,
  sleep,
} = require("./helpers");
const { artifacts, createPair } = require("./fixtures");

const overrides = { gasLimit: 6_000_000n };
const PERIOD = 20n; // seconds

const token0Amount = expandTo18Decimals(5);
const token1Amount = expandTo18Decimals(10);

let provider;
let wallet;
let fixture;
let oracle;
before(async () => {
  ({ provider, wallet } = await getContext());
  const factory = await deploy(artifacts.factory(), [wallet.address]);
  fixture = await createPair(factory);
  await send(fixture.token0.transfer(fixture.pair.target, token0Amount, overrides));
  await send(fixture.token1.transfer(fixture.pair.target, token1Amount, overrides));
  await send(fixture.pair.mint(wallet.address, overrides));
  oracle = await deploy(artifacts.oracleSimple(), [factory.target, fixture.token0.target, fixture.token1.target, PERIOD]);
});

async function latestTimestamp() {
  const block = await provider.getBlock("latest");
  return BigInt(block.timestamp);
}

test("update", async () => {
  const pairTimestamp = BigInt((await fixture.pair.getReserves())[2]);

  // before a full period has elapsed, update must revert
  if ((await latestTimestamp()) - pairTimestamp < PERIOD) {
    await expectRevert(staticCall(oracle, "update", []), "ExampleOracleSimple: PERIOD_NOT_ELAPSED");
  } else {
    console.warn("oracle-simple: skipped PERIOD_NOT_ELAPSED check (period already elapsed before first call)");
  }

  // wait until the period has elapsed on-chain
  while ((await latestTimestamp()) - pairTimestamp < PERIOD) {
    await sleep(2000);
  }
  await send(oracle.update(overrides));

  const expectedPrice = encodePrice(token0Amount, token1Amount);
  assert.equal(BigInt(scalar(await oracle.price0Average())), expectedPrice[0]);
  assert.equal(BigInt(scalar(await oracle.price1Average())), expectedPrice[1]);

  assert.equal(scalar(await oracle.consult(fixture.token0.target, token0Amount)), token1Amount);
  assert.equal(scalar(await oracle.consult(fixture.token1.target, token1Amount)), token0Amount);

  // consulting an unrelated token reverts
  await expectRevert(staticCall(oracle, "consult", [oracle.target, token0Amount]), "ExampleOracleSimple: INVALID_TOKEN");
});
