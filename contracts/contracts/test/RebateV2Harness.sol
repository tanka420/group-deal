// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../GroupDealHubV2.sol";

// Test harness only; deployment scripts never target this contract.
contract RebateV2Harness is GroupDealHubV2 {
    constructor() GroupDealHubV2(address(1),address(2),address(3),address(4)) {}
    function calculate(uint256 locked, uint256 finalPrice, uint256 quantity, uint256 early, uint256 gross)
        external pure returns (uint256) {
        return _calculateRebate(locked,finalPrice,quantity,early,gross);
    }
    function earlyValue(uint256 fixedAmount,uint256 bps,uint256 price) external pure returns(uint256) {
        return _calculateEarlyValue(fixedAmount,bps,price);
    }
}
