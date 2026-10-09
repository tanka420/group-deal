// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GroupDealHub.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/** Separate deployment candidate. Existing v1 campaigns and receipts retain v1 economics. */
contract GroupDealHubV2 is GroupDealHub {
    uint256 public constant protocolVersion = 2;

    constructor(address usdc, address signer, address operator, address securityMultisig)
        GroupDealHub(usdc, signer, operator, securityMultisig) {}

    function _validateCampaignTerms(CampaignTerms calldata terms, Tier[] calldata tiers) internal pure override {
        require(tiers[0].threshold == 1, "First threshold must be 1");
        if (terms.inventoryLimit > 0) {
            require(terms.maxPerAccount <= terms.inventoryLimit, "Account limit exceeds inventory");
            require(tiers[tiers.length - 1].threshold <= terms.inventoryLimit, "Tier threshold exceeds inventory");
        }
        if (terms.earlyRebateEnabled) {
            require(terms.earlySlotsCount > 0, "Early slots required");
            require((terms.earlyRebateAmount > 0) != (terms.earlyRebateBps > 0), "Choose fixed or percentage early rebate");
            require(terms.earlyRebateBps <= 10000, "Early percentage exceeds 100 percent");
            require(terms.earlyRebateAmount <= tiers[0].price, "Early fixed amount exceeds first price");
        } else {
            require(terms.earlySlotsCount == 0 && terms.earlyRebateAmount == 0 && terms.earlyRebateBps == 0, "Disabled early rebate must be zero");
        }
    }

    function _calculateEarlyValue(uint256 fixedAmount,uint256 bps,uint256 price) internal pure override returns(uint256) {
        return fixedAmount > 0 ? fixedAmount : Math.mulDiv(price,bps,10000);
    }

    // Tier rebate covers every unit. The additional early rebate belongs to one unit only.
    function _calculateRebate(
        uint256 lockedPrice, uint256 finalPrice, uint256 quantity, uint256 earlyValue, uint256 gross
    ) internal pure override returns (uint256) {
        uint256 unitDiff = lockedPrice > finalPrice ? lockedPrice - finalPrice : 0;
        uint256 earlyCap = finalPrice < lockedPrice ? finalPrice : lockedPrice;
        uint256 early = earlyValue > earlyCap ? earlyCap : earlyValue;
        uint256 rebate = (unitDiff * quantity) + early;
        return rebate > gross ? gross : rebate;
    }
}
