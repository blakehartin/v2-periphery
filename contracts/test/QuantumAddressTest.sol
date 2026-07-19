pragma solidity =0.7.6;

import '../libraries/UniswapV2Library.sol';

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

    function wrappingSubtract() external pure returns (uint32) {
        uint result;
        assembly {
            result := and(sub(0, 1), 0xffffffff)
        }
        return uint32(result);
    }

    function pairFor(address factory, address tokenA, address tokenB) external view returns (address) {
        return UniswapV2Library.pairFor(factory, tokenA, tokenB);
    }
}
