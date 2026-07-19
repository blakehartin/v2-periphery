const path = require("node:path");
const { qc, getContext, compileContract, deploy, send, parseEvents, expandTo18Decimals } = require("./helpers");

const ROOT = path.resolve(__dirname, "..");
const CONTRACTS = path.join(ROOT, "contracts");

function packageDir(name) {
  return path.dirname(require.resolve(`${name}/package.json`, { paths: [ROOT] }));
}

const REMAPPINGS = [
  `@quantumswap/v2-core=${packageDir("@quantumswap/v2-core")}`,
  `@quantumcoin/solidity-lib=${packageDir("@quantumcoin/solidity-lib")}`,
];

const artifacts = {
  factory: () =>
    compileContract(
      path.join(packageDir("@quantumswap/v2-core"), "contracts", "QuantumSwapV2Factory.sol"),
      "QuantumSwapV2Factory"
    ),
  pair: () =>
    compileContract(
      path.join(packageDir("@quantumswap/v2-core"), "contracts", "QuantumSwapV2Pair.sol"),
      "QuantumSwapV2Pair"
    ),
  wq: () => compileContract(path.join(packageDir("@quantumcoin/wq"), "wrappedq.sol"), "WQ"),
  erc20: () => compileContract(path.join(CONTRACTS, "test", "ERC20.sol"), "ERC20"),
  deflating: () => compileContract(path.join(CONTRACTS, "test", "DeflatingERC20.sol"), "DeflatingERC20"),
  router02: () =>
    compileContract(path.join(CONTRACTS, "QuantumSwapV2Router02.sol"), "QuantumSwapV2Router02", REMAPPINGS),
  computeLiquidityValue: () =>
    compileContract(
      path.join(CONTRACTS, "examples", "ExampleComputeLiquidityValue.sol"),
      "ExampleComputeLiquidityValue",
      REMAPPINGS
    ),
  oracleSimple: () =>
    compileContract(path.join(CONTRACTS, "examples", "ExampleOracleSimple.sol"), "ExampleOracleSimple", REMAPPINGS),
  slidingWindowOracle: () =>
    compileContract(
      path.join(CONTRACTS, "examples", "ExampleSlidingWindowOracle.sol"),
      "ExampleSlidingWindowOracle",
      REMAPPINGS
    ),
  swapToPrice: () =>
    compileContract(path.join(CONTRACTS, "examples", "ExampleSwapToPrice.sol"), "ExampleSwapToPrice", REMAPPINGS),
};

// Creates a pair of fresh test tokens on `factory` and returns { token0, token1, pair } sorted.
async function createPair(factory, tokenSupply = expandTo18Decimals(10000)) {
  const { wallet } = await getContext();
  const tokenA = await deploy(artifacts.erc20(), [tokenSupply]);
  const tokenB = await deploy(artifacts.erc20(), [tokenSupply]);
  const receipt = await send(factory.createPair(tokenA.target, tokenB.target, { gasLimit: 6_000_000n }));
  const [event] = parseEvents(receipt, factory, "PairCreated");
  if (!event) throw new Error("PairCreated event not found");
  const pair = new qc.Contract(event.args[2], artifacts.pair().abi, wallet);
  const token0Address = String(await pair.token0()).toLowerCase();
  const sorted = token0Address === String(tokenA.target).toLowerCase();
  return { token0: sorted ? tokenA : tokenB, token1: sorted ? tokenB : tokenA, pair };
}

// Deploys the full V2 periphery fixture: WQ, factory, router, one token pair.
async function v2Fixture() {
  const { wallet } = await getContext();
  const wq = await deploy(artifacts.wq());
  const factory = await deploy(artifacts.factory(), [wallet.address]);
  const router = await deploy(artifacts.router02(), [factory.target, wq.target]);
  const { token0, token1, pair } = await createPair(factory);
  return { wallet, wq, factory, router, token0, token1, pair };
}

module.exports = { artifacts, createPair, v2Fixture, packageDir };
