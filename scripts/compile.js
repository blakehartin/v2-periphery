const path = require("node:path");
const qcSolc = require("./qc-solc");

const root = path.resolve(__dirname, "..");

function packageDir(name) {
  return path.dirname(require.resolve(`${name}/package.json`, { paths: [root] }));
}

const remappings = [
  `@quantumswap/v2-core=${packageDir("@quantumswap/v2-core")}`,
  `@quantumcoin/solidity-lib=${packageDir("@quantumcoin/solidity-lib")}`,
];

const sources = [
  path.join(root, "contracts", "QuantumSwapV2Router02.sol"),
  path.join(root, "contracts", "examples", "ExampleComputeLiquidityValue.sol"),
  path.join(root, "contracts", "examples", "ExampleOracleSimple.sol"),
  path.join(root, "contracts", "examples", "ExampleSlidingWindowOracle.sol"),
  path.join(root, "contracts", "examples", "ExampleSwapToPrice.sol"),
  path.join(root, "contracts", "test", "ERC20.sol"),
  path.join(root, "contracts", "test", "DeflatingERC20.sol"),
  path.join(root, "contracts", "test", "QuantumAddressTest.sol"),
];

const output = qcSolc.compile(sources, remappings);
qcSolc.writeArtifacts(output, path.join(root, "build"));
console.log(`v2-periphery contracts compiled OK (${qcSolc.compilerVersion()})`);
