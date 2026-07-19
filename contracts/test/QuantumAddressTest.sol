pragma solidity =0.7.6;

import '../libraries/QuantumSwapV2Library.sol';

contract QuantumAddressTest {
    function packedAddressLength() external pure returns (uint256) {
        return abi.encodePacked(address(1)).length;
    }

    function packedPairLength(address tokenA, address tokenB) external pure returns (uint256) {
        return abi.encodePacked(tokenA, tokenB).length;
    }

    function addressRoundTrip(bytes32 value) external pure returns (address) {
        return address(uint256(value));
    }

    function pairFor(address factory, address tokenA, address tokenB) external view returns (address) {
        return QuantumSwapV2Library.pairFor(factory, tokenA, tokenB);
    }
}
