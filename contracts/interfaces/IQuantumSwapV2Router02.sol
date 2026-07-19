// This contract is part of QuantumSwap V2, a modified fork of Uniswap V2 (https://github.com/Uniswap/v2-periphery)
// adapted for the QuantumCoin blockchain. Modified from the original; see repository history for changes.
pragma solidity >=0.6.2;

import './IQuantumSwapV2Router01.sol';

interface IQuantumSwapV2Router02 is IQuantumSwapV2Router01 {
    function removeLiquidityETHSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external returns (uint amountETH);
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external;
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable;
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external;
}
