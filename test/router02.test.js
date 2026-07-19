// Ported from test/UniswapV2Router02.spec.ts (library view functions and
// fee-on-transfer token support). The permit-based variant was dropped because
// permit/ecrecover does not exist on QuantumCoin.
const { test, before, after } = require("node:test");
const {
  assert,
  qc,
  getContext,
  deploy,
  send,
  expectRevert,
  staticCall,
  scalar,
  expandTo18Decimals,
  MaxUint256,
} = require("./helpers");
const { artifacts, v2Fixture } = require("./fixtures");

const overrides = { gasLimit: 6_000_000n };

let ctx;
let fixture;
before(async () => {
  ctx = await getContext();
  fixture = await v2Fixture();
});

after(async () => {
  // the router must never hold native coin after any operation
  assert.equal(BigInt(await ctx.provider.getBalance(fixture.router.target)), 0n);
});

test("factory, WETH", async () => {
  assert.equal(String(await fixture.router.factory()).toLowerCase(), String(fixture.factory.target).toLowerCase());
  assert.equal(String(await fixture.router.WETH()).toLowerCase(), String(fixture.wq.target).toLowerCase());
});

test("quote", async () => {
  const { router } = fixture;
  assert.equal(scalar(await router.quote(1n, 100n, 200n)), 2n);
  assert.equal(scalar(await router.quote(2n, 200n, 100n)), 1n);
  await expectRevert(staticCall(router, "quote", [0n, 100n, 200n]), "QuantumSwapV2Library: INSUFFICIENT_AMOUNT");
  await expectRevert(staticCall(router, "quote", [1n, 0n, 200n]), "QuantumSwapV2Library: INSUFFICIENT_LIQUIDITY");
  await expectRevert(staticCall(router, "quote", [1n, 100n, 0n]), "QuantumSwapV2Library: INSUFFICIENT_LIQUIDITY");
});

test("getAmountOut", async () => {
  const { router } = fixture;
  assert.equal(scalar(await router.getAmountOut(2n, 100n, 100n)), 1n);
  await expectRevert(
    staticCall(router, "getAmountOut", [0n, 100n, 100n]),
    "QuantumSwapV2Library: INSUFFICIENT_INPUT_AMOUNT"
  );
  await expectRevert(staticCall(router, "getAmountOut", [2n, 0n, 100n]), "QuantumSwapV2Library: INSUFFICIENT_LIQUIDITY");
  await expectRevert(staticCall(router, "getAmountOut", [2n, 100n, 0n]), "QuantumSwapV2Library: INSUFFICIENT_LIQUIDITY");
});

test("getAmountIn", async () => {
  const { router } = fixture;
  assert.equal(scalar(await router.getAmountIn(1n, 100n, 100n)), 2n);
  await expectRevert(
    staticCall(router, "getAmountIn", [0n, 100n, 100n]),
    "QuantumSwapV2Library: INSUFFICIENT_OUTPUT_AMOUNT"
  );
  await expectRevert(staticCall(router, "getAmountIn", [1n, 0n, 100n]), "QuantumSwapV2Library: INSUFFICIENT_LIQUIDITY");
  await expectRevert(staticCall(router, "getAmountIn", [1n, 100n, 0n]), "QuantumSwapV2Library: INSUFFICIENT_LIQUIDITY");
});

test("getAmountsOut / getAmountsIn", async () => {
  const { router, token0, token1, wallet } = { ...fixture, wallet: ctx.wallet };
  await send(token0.approve(router.target, MaxUint256, overrides));
  await send(token1.approve(router.target, MaxUint256, overrides));
  await send(
    router.addLiquidity(token0.target, token1.target, 10000n, 10000n, 0n, 0n, wallet.address, MaxUint256, overrides)
  );

  await expectRevert(staticCall(router, "getAmountsOut", [2n, [token0.target]]), "QuantumSwapV2Library: INVALID_PATH");
  const path = [token0.target, token1.target];
  const amountsOut = [...scalar(await router.getAmountsOut(2n, path))].map(BigInt);
  assert.deepEqual(amountsOut, [2n, 1n]);

  await expectRevert(staticCall(router, "getAmountsIn", [1n, [token0.target]]), "QuantumSwapV2Library: INVALID_PATH");
  const amountsIn = [...scalar(await router.getAmountsIn(1n, path))].map(BigInt);
  assert.deepEqual(amountsIn, [2n, 1n]);
});

// ---- fee-on-transfer tokens (DTT <-> WQ) ----

async function addLiquidityDttWq(dtt, dttAmount, wqAmount) {
  const { router } = fixture;
  await send(dtt.approve(router.target, MaxUint256, overrides));
  await send(
    router.addLiquidityETH(dtt.target, dttAmount, dttAmount, wqAmount, ctx.wallet.address, MaxUint256, {
      gasLimit: 6_000_000n,
      value: wqAmount,
    })
  );
}

async function dttWqPair(dtt) {
  const address = await fixture.factory.getPair(dtt.target, fixture.wq.target);
  return new qc.Contract(String(address), artifacts.pair().abi, ctx.wallet);
}

test("removeLiquidityETHSupportingFeeOnTransferTokens", async () => {
  const { router, wq } = fixture;
  const dtt = await deploy(artifacts.deflating(), [expandTo18Decimals(10000)]);
  const dttAmount = expandTo18Decimals(1);
  const wqAmount = expandTo18Decimals(4);
  await addLiquidityDttWq(dtt, dttAmount, wqAmount);
  const pair = await dttWqPair(dtt);

  const dttInPair = scalar(await dtt.balanceOf(pair.target));
  const wqInPair = scalar(await wq.balanceOf(pair.target));
  const liquidity = scalar(await pair.balanceOf(ctx.wallet.address));
  const totalSupply = scalar(await pair.totalSupply());
  const naiveDttExpected = (dttInPair * liquidity) / totalSupply;
  const wqExpected = (wqInPair * liquidity) / totalSupply;

  await send(pair.approve(router.target, MaxUint256, overrides));
  await send(
    router.removeLiquidityETHSupportingFeeOnTransferTokens(
      dtt.target,
      liquidity,
      naiveDttExpected,
      wqExpected,
      ctx.wallet.address,
      MaxUint256,
      overrides
    )
  );
  assert.equal(BigInt(await ctx.provider.getBalance(router.target)), 0n);
});

test("swapExactTokensForTokensSupportingFeeOnTransferTokens: DTT -> WQ and WQ -> DTT", async () => {
  const { router, wq } = fixture;
  const dtt = await deploy(artifacts.deflating(), [expandTo18Decimals(10000)]);
  const dttAmount = (expandTo18Decimals(5) * 100n) / 99n;
  const wqAmount = expandTo18Decimals(10);
  const amountIn = expandTo18Decimals(1);
  await addLiquidityDttWq(dtt, dttAmount, wqAmount);

  // DTT -> WQ
  await send(dtt.approve(router.target, MaxUint256, overrides));
  await send(
    router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
      amountIn,
      0n,
      [dtt.target, wq.target],
      ctx.wallet.address,
      MaxUint256,
      overrides
    )
  );

  // WQ -> DTT
  await send(wq.deposit({ gasLimit: 200_000n, value: amountIn }));
  await send(wq.approve(router.target, MaxUint256, overrides));
  await send(
    router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
      amountIn,
      0n,
      [wq.target, dtt.target],
      ctx.wallet.address,
      MaxUint256,
      overrides
    )
  );
  assert.equal(BigInt(await ctx.provider.getBalance(router.target)), 0n);
});

test("swapExactETHForTokensSupportingFeeOnTransferTokens", async () => {
  const { router, wq } = fixture;
  const dtt = await deploy(artifacts.deflating(), [expandTo18Decimals(10000)]);
  const dttAmount = (expandTo18Decimals(10) * 100n) / 99n;
  const wqAmount = expandTo18Decimals(5);
  const swapAmount = expandTo18Decimals(1);
  await addLiquidityDttWq(dtt, dttAmount, wqAmount);

  await send(
    router.swapExactETHForTokensSupportingFeeOnTransferTokens(
      0n,
      [wq.target, dtt.target],
      ctx.wallet.address,
      MaxUint256,
      { gasLimit: 6_000_000n, value: swapAmount }
    )
  );
  assert.equal(BigInt(await ctx.provider.getBalance(router.target)), 0n);
});

test("swapExactTokensForETHSupportingFeeOnTransferTokens", async () => {
  const { router, wq } = fixture;
  const dtt = await deploy(artifacts.deflating(), [expandTo18Decimals(10000)]);
  const dttAmount = (expandTo18Decimals(5) * 100n) / 99n;
  const wqAmount = expandTo18Decimals(10);
  const swapAmount = expandTo18Decimals(1);
  await addLiquidityDttWq(dtt, dttAmount, wqAmount);

  await send(dtt.approve(router.target, MaxUint256, overrides));
  await send(
    router.swapExactTokensForETHSupportingFeeOnTransferTokens(
      swapAmount,
      0n,
      [dtt.target, wq.target],
      ctx.wallet.address,
      MaxUint256,
      overrides
    )
  );
  assert.equal(BigInt(await ctx.provider.getBalance(router.target)), 0n);
});

test("fee-on-transfer tokens reloaded: DTT -> DTT2", async () => {
  const { router } = fixture;
  const dtt = await deploy(artifacts.deflating(), [expandTo18Decimals(10000)]);
  const dtt2 = await deploy(artifacts.deflating(), [expandTo18Decimals(10000)]);
  const dttAmount = (expandTo18Decimals(5) * 100n) / 99n;
  const dtt2Amount = expandTo18Decimals(5);
  const amountIn = expandTo18Decimals(1);

  await send(dtt.approve(router.target, MaxUint256, overrides));
  await send(dtt2.approve(router.target, MaxUint256, overrides));
  await send(
    router.addLiquidity(
      dtt.target,
      dtt2.target,
      dttAmount,
      dtt2Amount,
      dttAmount,
      dtt2Amount,
      ctx.wallet.address,
      MaxUint256,
      overrides
    )
  );

  await send(
    router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
      amountIn,
      0n,
      [dtt.target, dtt2.target],
      ctx.wallet.address,
      MaxUint256,
      overrides
    )
  );
  assert.equal(BigInt(await ctx.provider.getBalance(router.target)), 0n);
});
