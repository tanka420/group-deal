// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGroupDealHub {
    enum Metric {
        BUYER_COUNT,
        UNITS_COUNT
    }

    enum CampaignStatus {
        CREATED,
        ACTIVE,
        FINALIZED,
        CANCELLED
    }

    enum DeliveryStatus {
        PENDING,
        DELIVERED,
        CONFIRMED,
        DISPUTED,
        BREACHED_REFUNDED,
        RESOLVED
    }

    struct Tier {
        uint256 threshold;
        uint256 price;
    }

    struct CampaignTerms {
        address sellerPayoutWallet;
        Metric metric;
        uint256 maxPerAccount;
        uint256 inventoryLimit;
        uint256 durationSeconds;
        uint256 deliverySlaSeconds;
        bool earlyRebateEnabled;
        uint32 earlySlotsCount;
        uint256 earlyRebateAmount;
        uint16 earlyRebateBps;
        uint16 platformFeeBps;
        bytes32 termsHash;
    }

    struct CampaignState {
        CampaignStatus status;
        uint256 startTime;
        uint256 endTime;
        uint256 finalizedAt;
        uint256 finalClearingPrice;
        uint8 finalTierIndex;
        uint256 totalUnitsCommitted;
        uint256 totalBuyerCount;
        uint8 currentUnlockedTier;
        uint32 earlySlotsTaken;
        uint256 totalGrossCommitted;
        uint256 totalSellerClaimable;
        uint256 totalSellerClaimed;
        uint256 firstCommitmentTime;
    }

    struct Order {
        uint256 orderId;
        uint256 campaignId;
        bytes32 campaignIdentity;
        address buyerPrincipal;
        uint256 quantity;
        uint256 lockedUnitPrice;
        uint256 committedGross;
        bool isEarlySupporter;
        uint256 earlyRebateValue;
        uint256 rebateAllocated;
        uint256 sellerAllocated;
        uint256 buyerRefundAllocated;
        bool buyerClaimed;
        bool sellerClaimed;
        DeliveryStatus deliveryStatus;
        uint256 deliveryTimestamp;
        bytes32 deliveryProofHash;
        bytes32 disputeReasonHash;
        uint256 disputeOpenedAt;
    }

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed sellerPayoutWallet,
        bytes32 termsHash,
        Metric metric,
        uint256 startTime,
        uint256 endTime,
        uint256 inventoryLimit
    );

    event CampaignTermsUpdated(uint256 indexed campaignId, bytes32 newTermsHash);
    event CampaignStatusChanged(uint256 indexed campaignId, CampaignStatus oldStatus, CampaignStatus newStatus);
    event TierUnlocked(uint256 indexed campaignId, uint8 tierIndex, uint256 threshold, uint256 price);
    
    event CommitmentMade(
        uint256 indexed campaignId,
        uint256 indexed orderId,
        bytes32 indexed campaignIdentity,
        address buyerPrincipal,
        uint256 quantity,
        uint256 lockedUnitPrice,
        uint256 committedGross,
        bool isEarlySupporter,
        uint256 earlyRebateValue
    );

    event CampaignFinalized(
        uint256 indexed campaignId,
        uint256 finalClearingPrice,
        uint8 finalTierIndex,
        uint256 totalCommitted,
        uint256 totalUnits
    );

    event DeliveryRecorded(
        uint256 indexed campaignId,
        uint256 indexed orderId,
        bytes32 proofHash,
        uint256 deliveryTimestamp,
        uint256 disputeDeadline
    );

    event DeliveryBreached(uint256 indexed campaignId, uint256 indexed orderId, uint256 refundAmount);
    event OrderConfirmed(uint256 indexed campaignId, uint256 indexed orderId, uint256 sellerProceeds);
    event OrderDisputed(uint256 indexed campaignId, uint256 indexed orderId, address indexed disputedBy, bytes32 reasonHash);
    event DisputeResolved(uint256 indexed campaignId, uint256 indexed orderId, uint256 buyerShare, uint256 sellerShare);
    event FundsClaimed(uint256 indexed campaignId, address indexed recipient, uint256 amount, uint8 claimType);
    event EmergencyCancelled(uint256 indexed campaignId, bytes32 reasonHash, uint256 refundPool);
}
