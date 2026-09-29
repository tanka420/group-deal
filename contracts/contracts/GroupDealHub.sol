// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IGroupDealHub.sol";

/**
 * @title GroupDealHub
 * @notice Source of truth for GroupDeal campaigns, commitments, tiers, clearing price,
 *         delivery, disputes, settlement, pull claims and financial conservation on Arc Testnet.
 */
contract GroupDealHub is IGroupDealHub, EIP712, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    bytes32 public constant BUY_AUTH_TYPEHASH = keccak256(
        "BuyAuthorization(uint256 chainId,address hubContract,uint256 campaignId,bytes32 termsHash,bytes32 campaignIdentity,address buyerWallet,uint256 nonce,uint256 maxQuantity,uint256 deadline)"
    );

    bytes32 public constant EMERGENCY_DISPUTE_TYPEHASH = keccak256(
        "EmergencyDispute(uint256 chainId,address hubContract,uint256 campaignId,uint256 orderId,bytes32 reasonHash,uint256 deadline)"
    );

    IERC20 public immutable usdcToken;
    address public authorizedSigner;
    address public operatorAddress;

    uint256 public nextCampaignId = 1;
    uint256 public nextOrderId = 1;

    // campaignId => CampaignTerms
    mapping(uint256 => CampaignTerms) public campaignTerms;
    // campaignId => CampaignState
    mapping(uint256 => CampaignState) public campaignStates;
    // campaignId => Tier[]
    mapping(uint256 => Tier[]) internal _campaignTiers;
    // campaignId => campaignIdentity => pinned principal address
    mapping(uint256 => mapping(bytes32 => address)) public campaignIdentityPrincipals;
    // campaignId => campaignIdentity => total units bought
    mapping(uint256 => mapping(bytes32 => uint256)) public buyerUnitsCommitted;
    // campaignId => campaignIdentity => auth nonce
    mapping(uint256 => mapping(bytes32 => uint256)) public identityNonces;

    // orderId => Order
    mapping(uint256 => Order) public orders;
    // campaignId => orderIds[]
    mapping(uint256 => uint256[]) internal _campaignOrderIds;

    // Invariant tracking: campaignId => total active USDC locked in this contract for the campaign
    mapping(uint256 => uint256) public campaignEscrowBalance;
    // Cumulative claimed USDC by buyer per orderId (pull pattern preservation)
    mapping(uint256 => uint256) public buyerClaimedAmount;

    address public securityAuthority;
    address public pendingSecurityAuthority;

    modifier onlyOperator() {
        require(msg.sender == operatorAddress || msg.sender == owner(), "Unauthorized operator");
        _;
    }

    modifier onlySecurityAuthority() {
        require(
            msg.sender == securityAuthority,
            "Unauthorized security authority: only designated security authority can execute"
        );
        _;
    }

    constructor(
        address _usdcToken,
        address _authorizedSigner,
        address _operatorAddress,
        address _securityAuthority
    ) EIP712("GroupDealHub", "1") Ownable(msg.sender) {
        require(_usdcToken != address(0), "Invalid USDC address");
        require(_authorizedSigner != address(0), "Invalid signer address");
        require(_operatorAddress != address(0), "Invalid operator address");
        require(_securityAuthority != address(0), "Invalid security authority address");
        require(_securityAuthority != _operatorAddress, "Security authority must be distinct from operator");

        usdcToken = IERC20(_usdcToken);
        authorizedSigner = _authorizedSigner;
        operatorAddress = _operatorAddress;
        securityAuthority = _securityAuthority;
    }

    function setAuthorizedSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "Zero address");
        authorizedSigner = _signer;
    }

    function setOperatorAddress(address _operator) external onlyOwner {
        require(_operator != address(0), "Zero address");
        operatorAddress = _operator;
    }

    function transferSecurityAuthority(address newAuthority) external onlySecurityAuthority {
        require(newAuthority != address(0), "Zero address");
        require(newAuthority != operatorAddress, "Security authority cannot be operator");
        pendingSecurityAuthority = newAuthority;
        emit SecurityAuthorityTransferStarted(securityAuthority, newAuthority);
    }

    function acceptSecurityAuthority() external {
        require(msg.sender == pendingSecurityAuthority, "Only pending security authority can accept");
        address previous = securityAuthority;
        securityAuthority = pendingSecurityAuthority;
        pendingSecurityAuthority = address(0);
        emit SecurityAuthorityTransferred(previous, securityAuthority);
    }

    /**
     * @notice Creates a new campaign with 2-5 tiers and immutable terms validation.
     */
    function createCampaign(
        CampaignTerms calldata terms,
        Tier[] calldata tiers
    ) external returns (uint256 campaignId) {
        require(terms.sellerPayoutWallet != address(0), "Invalid payout wallet");
        require(tiers.length >= 2 && tiers.length <= 5, "Tiers must be 2 to 5");
        require(terms.durationSeconds >= 24 hours && terms.durationSeconds <= 30 days, "Duration 24h to 30d");
        require(terms.deliverySlaSeconds == 24 hours || terms.deliverySlaSeconds == 48 hours, "SLA must be 24h or 48h");
        require(terms.maxPerAccount > 0, "maxPerAccount must be > 0");
        require(terms.platformFeeBps == 0, "Platform fee must be 0 in v1");

        // Validate strictly ascending thresholds and strictly descending prices
        for (uint256 i = 0; i < tiers.length; i++) {
            require(tiers[i].threshold > 0, "Threshold must be > 0");
            require(tiers[i].price > 0, "Price must be > 0");
            if (i > 0) {
                require(tiers[i].threshold > tiers[i - 1].threshold, "Thresholds must strictly increase");
                require(tiers[i].price < tiers[i - 1].price, "Prices must strictly decrease");
            }
        }

        campaignId = nextCampaignId++;
        campaignTerms[campaignId] = terms;

        for (uint256 i = 0; i < tiers.length; i++) {
            _campaignTiers[campaignId].push(tiers[i]);
        }

        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + terms.durationSeconds;

        campaignStates[campaignId] = CampaignState({
            status: CampaignStatus.CREATED,
            startTime: startTime,
            endTime: endTime,
            finalizedAt: 0,
            finalClearingPrice: tiers[0].price,
            finalTierIndex: 0,
            totalUnitsCommitted: 0,
            totalBuyerCount: 0,
            currentUnlockedTier: 0,
            earlySlotsTaken: 0,
            totalGrossCommitted: 0,
            totalSellerClaimable: 0,
            totalSellerClaimed: 0,
            firstCommitmentTime: 0
        });

        emit CampaignCreated(
            campaignId,
            terms.sellerPayoutWallet,
            terms.termsHash,
            terms.metric,
            startTime,
            endTime,
            terms.inventoryLimit
        );
        emit TierUnlocked(campaignId, 0, tiers[0].threshold, tiers[0].price);
    }

    /**
     * @notice Allows seller to update terms before any commitments are made.
     * Locked permanently after the first commitment!
     */
    function updateTermsBeforeFirstCommitment(
        uint256 campaignId,
        bytes32 newTermsHash
    ) external {
        CampaignState storage state = campaignStates[campaignId];
        CampaignTerms storage terms = campaignTerms[campaignId];
        require(msg.sender == terms.sellerPayoutWallet || msg.sender == owner(), "Not campaign seller");
        require(state.firstCommitmentTime == 0, "Terms locked after first commitment");
        require(state.status == CampaignStatus.CREATED, "Campaign not in CREATED status");

        terms.termsHash = newTermsHash;
        emit CampaignTermsUpdated(campaignId, newTermsHash);
    }

    /**
     * @notice Seller can cancel campaign before any commitments are made.
     */
    function cancelDraftCampaign(uint256 campaignId) external {
        CampaignState storage state = campaignStates[campaignId];
        CampaignTerms storage terms = campaignTerms[campaignId];
        require(msg.sender == terms.sellerPayoutWallet || msg.sender == owner(), "Not campaign seller");
        require(state.firstCommitmentTime == 0, "Commitments already exist");
        require(state.status == CampaignStatus.CREATED, "Invalid status");

        state.status = CampaignStatus.CANCELLED;
        emit CampaignStatusChanged(campaignId, CampaignStatus.CREATED, CampaignStatus.CANCELLED);
    }

    /**
     * @notice Commit to buy with EIP-712 backend authorization.
     * Pins the sender's wallet as the immutable principal for this campaign identity.
     */
    function commitToBuy(
        uint256 campaignId,
        bytes32 campaignIdentity,
        uint256 quantity,
        bool requireEarlySlot,
        uint256 maxAuthQuantity,
        uint256 authDeadline,
        bytes calldata authSignature
    ) external nonReentrant returns (uint256 orderId) {
        CampaignState storage state = campaignStates[campaignId];
        CampaignTerms storage terms = campaignTerms[campaignId];

        require(quantity > 0, "Quantity must be > 0");
        require(block.timestamp <= authDeadline, "Authorization expired");
        require(state.status == CampaignStatus.CREATED || state.status == CampaignStatus.ACTIVE, "Campaign not active");
        require(block.timestamp >= state.startTime && block.timestamp <= state.endTime, "Campaign closed or not started");

        // Verify EIP-712 signature from authorizedSigner
        uint256 nonce = identityNonces[campaignId][campaignIdentity];
        bytes32 structHash = keccak256(
            abi.encode(
                BUY_AUTH_TYPEHASH,
                block.chainid,
                address(this),
                campaignId,
                terms.termsHash,
                campaignIdentity,
                msg.sender,
                nonce,
                maxAuthQuantity,
                authDeadline
            )
        );
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, authSignature);
        require(signer == authorizedSigner, "Invalid buy authorization signature");

        identityNonces[campaignId][campaignIdentity] = nonce + 1;

        // Verify account purchase limits
        uint256 existingBuyerUnits = buyerUnitsCommitted[campaignId][campaignIdentity];
        require(existingBuyerUnits + quantity <= terms.maxPerAccount, "Exceeds max units per account");
        require(existingBuyerUnits + quantity <= maxAuthQuantity, "Exceeds authorized quantity");

        // Verify inventory limits
        if (terms.inventoryLimit > 0) {
            require(state.totalUnitsCommitted + quantity <= terms.inventoryLimit, "Exceeds inventory limit");
        }

        // Enforce Principal Pinning: first transaction pins msg.sender
        address pinnedPrincipal = campaignIdentityPrincipals[campaignId][campaignIdentity];
        if (pinnedPrincipal == address(0)) {
            campaignIdentityPrincipals[campaignId][campaignIdentity] = msg.sender;
            pinnedPrincipal = msg.sender;
        } else {
            require(pinnedPrincipal == msg.sender, "Wallet not principal for this identity");
        }

        // Lock terms on first commitment
        if (state.firstCommitmentTime == 0) {
            state.firstCommitmentTime = block.timestamp;
            if (state.status == CampaignStatus.CREATED) {
                state.status = CampaignStatus.ACTIVE;
                emit CampaignStatusChanged(campaignId, CampaignStatus.CREATED, CampaignStatus.ACTIVE);
            }
        }

        // Check Early Supporter slot
        bool isEarlySupporter = false;
        uint256 earlyRebateValue = 0;
        if (terms.earlyRebateEnabled) {
            if (existingBuyerUnits == 0 && state.earlySlotsTaken < terms.earlySlotsCount) {
                isEarlySupporter = true;
                state.earlySlotsTaken++;
                // Early rebate applies to the 1st unit only
                uint256 currentUnitPrice = _campaignTiers[campaignId][state.currentUnlockedTier].price;
                if (terms.earlyRebateAmount > 0) {
                    earlyRebateValue = terms.earlyRebateAmount;
                } else if (terms.earlyRebateBps > 0) {
                    earlyRebateValue = (currentUnitPrice * terms.earlyRebateBps) / 10000;
                }
                if (earlyRebateValue > currentUnitPrice) {
                    earlyRebateValue = currentUnitPrice;
                }
            } else if (requireEarlySlot) {
                revert("Early slot exhausted");
            }
        }

        // Calculate locked price based on current unlocked tier
        Tier memory currentTier = _campaignTiers[campaignId][state.currentUnlockedTier];
        uint256 lockedUnitPrice = currentTier.price;
        uint256 committedGross = lockedUnitPrice * quantity;

        // Update campaign metrics
        buyerUnitsCommitted[campaignId][campaignIdentity] += quantity;
        state.totalUnitsCommitted += quantity;
        if (existingBuyerUnits == 0) {
            state.totalBuyerCount += 1;
        }
        state.totalGrossCommitted += committedGross;

        // Check if next tiers are unlocked by the updated metric
        _checkAndUnlockTiers(campaignId);

        // Create Order
        orderId = nextOrderId++;
        orders[orderId] = Order({
            orderId: orderId,
            campaignId: campaignId,
            campaignIdentity: campaignIdentity,
            buyerPrincipal: msg.sender,
            quantity: quantity,
            lockedUnitPrice: lockedUnitPrice,
            committedGross: committedGross,
            isEarlySupporter: isEarlySupporter,
            earlyRebateValue: earlyRebateValue,
            rebateAllocated: 0,
            sellerAllocated: 0,
            buyerRefundAllocated: 0,
            buyerClaimed: false,
            sellerClaimed: false,
            deliveryStatus: DeliveryStatus.PENDING,
            deliveryTimestamp: 0,
            deliveryProofHash: bytes32(0),
            disputeReasonHash: bytes32(0),
            disputeOpenedAt: 0
        });

        _campaignOrderIds[campaignId].push(orderId);
        campaignEscrowBalance[campaignId] += committedGross;

        // Auto-finalize if inventory reached 100% sold-out (now includes current order for rebate calculation)
        if (terms.inventoryLimit > 0 && state.totalUnitsCommitted >= terms.inventoryLimit) {
            _finalizeCampaignInternal(campaignId);
        }

        // Pull USDC from buyer wallet to contract
        usdcToken.safeTransferFrom(msg.sender, address(this), committedGross);

        emit CommitmentMade(
            campaignId,
            orderId,
            campaignIdentity,
            msg.sender,
            quantity,
            lockedUnitPrice,
            committedGross,
            isEarlySupporter,
            earlyRebateValue
        );
    }

    /**
     * @notice Finalizes campaign when endTime is reached or sold out.
     */
    function finalizeCampaign(uint256 campaignId) external {
        CampaignState storage state = campaignStates[campaignId];
        require(state.status == CampaignStatus.ACTIVE || state.status == CampaignStatus.CREATED, "Already finalized/cancelled");
        require(block.timestamp > state.endTime, "Campaign still active");

        _finalizeCampaignInternal(campaignId);
    }

    function _finalizeCampaignInternal(uint256 campaignId) internal {
        CampaignState storage state = campaignStates[campaignId];
        Tier memory finalTier = _campaignTiers[campaignId][state.currentUnlockedTier];

        state.status = CampaignStatus.FINALIZED;
        state.finalizedAt = block.timestamp;
        state.finalClearingPrice = finalTier.price;
        state.finalTierIndex = state.currentUnlockedTier;

        // Note: Individual order rebates are calculated lazily in claimBuyerFunds
        // to guarantee finalizeCampaign is strictly O(1) gas and invariant to campaign order count.

        emit CampaignFinalized(
            campaignId,
            state.finalClearingPrice,
            state.finalTierIndex,
            state.totalGrossCommitted,
            state.totalUnitsCommitted
        );
    }

    /**
     * @notice Check and unlock higher tiers as metrics advance. Tiers never downgrade.
     */
    function _checkAndUnlockTiers(uint256 campaignId) internal {
        CampaignState storage state = campaignStates[campaignId];
        CampaignTerms storage terms = campaignTerms[campaignId];
        Tier[] storage tiers = _campaignTiers[campaignId];

        uint256 currentMetric = (terms.metric == Metric.BUYER_COUNT)
            ? state.totalBuyerCount
            : state.totalUnitsCommitted;

        uint8 currentTierIndex = state.currentUnlockedTier;
        while (currentTierIndex + 1 < tiers.length) {
            if (currentMetric >= tiers[currentTierIndex + 1].threshold) {
                currentTierIndex++;
                emit TierUnlocked(
                    campaignId,
                    currentTierIndex,
                    tiers[currentTierIndex].threshold,
                    tiers[currentTierIndex].price
                );
            } else {
                break;
            }
        }
        state.currentUnlockedTier = currentTierIndex;
    }

    /**
     * @notice Seller or Operator records proof of delivery within SLA.
     */
    function recordDelivery(
        uint256 campaignId,
        uint256 orderId,
        bytes32 proofHash
    ) external {
        CampaignState storage state = campaignStates[campaignId];
        CampaignTerms storage terms = campaignTerms[campaignId];
        Order storage order = orders[orderId];

        require(order.campaignId == campaignId, "Mismatched campaign/order");
        require(
            msg.sender == terms.sellerPayoutWallet || msg.sender == operatorAddress || msg.sender == owner(),
            "Unauthorized delivery submitter"
        );
        require(state.status == CampaignStatus.FINALIZED, "Campaign not finalized");
        require(order.deliveryStatus == DeliveryStatus.PENDING, "Order not in PENDING delivery");
        require(block.timestamp <= state.finalizedAt + terms.deliverySlaSeconds, "Delivery SLA expired");

        order.deliveryStatus = DeliveryStatus.DELIVERED;
        order.deliveryTimestamp = block.timestamp;
        order.deliveryProofHash = proofHash;

        emit DeliveryRecorded(
            campaignId,
            orderId,
            proofHash,
            block.timestamp,
            block.timestamp + 48 hours
        );
    }

    /**
     * @notice Ensures order rebate is lazily evaluated and recorded into storage.
     * Guarantees finalizeCampaign is O(1) gas invariant.
     */
    function _ensureOrderRebateAllocated(uint256 campaignId, uint256 orderId) internal {
        CampaignState storage state = campaignStates[campaignId];
        Order storage order = orders[orderId];
        if ((state.status == CampaignStatus.FINALIZED || state.finalizedAt > 0) && order.rebateAllocated == 0 && state.finalClearingPrice > 0) {
            uint256 unitDiff = order.lockedUnitPrice > state.finalClearingPrice
                ? order.lockedUnitPrice - state.finalClearingPrice
                : 0;
            uint256 totalRebate = (unitDiff * order.quantity) + order.earlyRebateValue;
            if (totalRebate > order.committedGross) {
                totalRebate = order.committedGross;
            }
            order.rebateAllocated = totalRebate;
        }
    }

    /**
     * @notice Breached delivery triggered if seller misses SLA deadline.
     * Full remaining gross returned to buyer as refund!
     */
    function claimDeliveryBreach(uint256 campaignId, uint256 orderId) external {
        _ensureOrderRebateAllocated(campaignId, orderId);
        CampaignState storage state = campaignStates[campaignId];
        CampaignTerms storage terms = campaignTerms[campaignId];
        Order storage order = orders[orderId];

        require(order.campaignId == campaignId, "Mismatched campaign/order");
        require(
            msg.sender == order.buyerPrincipal || msg.sender == operatorAddress || msg.sender == owner(),
            "Unauthorized caller"
        );
        require(state.status == CampaignStatus.FINALIZED, "Campaign not finalized");
        require(order.deliveryStatus == DeliveryStatus.PENDING, "Not pending delivery");
        require(block.timestamp > state.finalizedAt + terms.deliverySlaSeconds, "SLA deadline not passed");

        order.deliveryStatus = DeliveryStatus.BREACHED_REFUNDED;
        uint256 remainingGross = order.committedGross - order.rebateAllocated;
        order.buyerRefundAllocated = remainingGross;

        emit DeliveryBreached(campaignId, orderId, remainingGross);
    }

    /**
     * @notice Buyer confirms receipt of delivered product early.
     * Seller proceeds become claimable immediately.
     */
    function confirmReceipt(uint256 campaignId, uint256 orderId) external nonReentrant {
        CampaignState storage state = campaignStates[campaignId];
        require(state.status != CampaignStatus.CANCELLED, "Campaign cancelled");
        Order storage order = orders[orderId];
        require(order.campaignId == campaignId, "Mismatched campaign/order");
        require(msg.sender == order.buyerPrincipal, "Only buyer principal can confirm");
        require(order.deliveryStatus == DeliveryStatus.DELIVERED, "Order not DELIVERED");

        _settleOrderToSeller(campaignId, orderId);
        emit OrderConfirmed(campaignId, orderId, order.sellerAllocated);
    }

    /**
     * @notice Settle order to seller if 48h dispute window passed with no disputes.
     */
    function settleUndisputedOrder(uint256 campaignId, uint256 orderId) external nonReentrant {
        CampaignState storage state = campaignStates[campaignId];
        require(state.status != CampaignStatus.CANCELLED, "Campaign cancelled");
        Order storage order = orders[orderId];
        require(order.campaignId == campaignId, "Mismatched campaign/order");
        require(order.deliveryStatus == DeliveryStatus.DELIVERED, "Order not DELIVERED");
        require(block.timestamp > order.deliveryTimestamp + 48 hours, "Dispute window still open");

        _settleOrderToSeller(campaignId, orderId);
        emit OrderConfirmed(campaignId, orderId, order.sellerAllocated);
    }

    function _settleOrderToSeller(uint256 campaignId, uint256 orderId) internal {
        _ensureOrderRebateAllocated(campaignId, orderId);
        Order storage order = orders[orderId];
        CampaignTerms storage terms = campaignTerms[campaignId];
        CampaignState storage state = campaignStates[campaignId];

        order.deliveryStatus = DeliveryStatus.CONFIRMED;
        uint256 alreadyAllocated = order.rebateAllocated + order.sellerAllocated + order.buyerRefundAllocated;
        require(order.committedGross >= alreadyAllocated, "Invariant error: over-allocated");
        uint256 unallocated = order.committedGross - alreadyAllocated;

        uint256 remainingGross = order.committedGross - order.rebateAllocated;
        uint256 fee = (remainingGross * terms.platformFeeBps) / 10000;
        uint256 sellerProceeds = remainingGross - fee;
        if (sellerProceeds > unallocated) {
            sellerProceeds = unallocated;
        }

        order.sellerAllocated += sellerProceeds;
        state.totalSellerClaimable += sellerProceeds;
    }

    /**
     * @notice DIRECT ONCHAIN DISPUTE FALLBACK:
     * Buyer principal calls this directly on Arc contract if backend or proof services are down!
     */
    function openDispute(
        uint256 campaignId,
        uint256 orderId,
        bytes32 reasonHash
    ) external {
        Order storage order = orders[orderId];
        require(order.campaignId == campaignId, "Mismatched campaign/order");
        require(msg.sender == order.buyerPrincipal, "Only buyer principal can dispute");
        require(order.deliveryStatus == DeliveryStatus.DELIVERED, "Order not in DELIVERED status");
        require(block.timestamp <= order.deliveryTimestamp + 48 hours, "Dispute window expired");

        order.deliveryStatus = DeliveryStatus.DISPUTED;
        order.disputeReasonHash = reasonHash;
        order.disputeOpenedAt = block.timestamp;

        emit OrderDisputed(campaignId, orderId, msg.sender, reasonHash);
    }

    /**
     * @notice EMERGENCY DISPUTE FOR EMBEDDED WALLETS:
     * Anyone/relayer can submit buyer principal's signed dispute request.
     * Can ONLY put order into DISPUTED state; cannot transfer or allocate funds.
     */
    function emergencyOpenDisputeWithSignature(
        uint256 campaignId,
        uint256 orderId,
        bytes32 reasonHash,
        uint256 deadline,
        bytes calldata buyerSignature
    ) external {
        Order storage order = orders[orderId];
        require(order.campaignId == campaignId, "Mismatched campaign/order");
        require(block.timestamp <= deadline, "Signature deadline expired");
        require(order.deliveryStatus == DeliveryStatus.DELIVERED, "Order not in DELIVERED status");
        require(block.timestamp <= order.deliveryTimestamp + 48 hours, "Dispute window expired");

        bytes32 structHash = keccak256(
            abi.encode(
                EMERGENCY_DISPUTE_TYPEHASH,
                block.chainid,
                address(this),
                campaignId,
                orderId,
                reasonHash,
                deadline
            )
        );
        bytes32 hash = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(hash, buyerSignature);
        require(recovered == order.buyerPrincipal, "Invalid buyer principal signature");

        order.deliveryStatus = DeliveryStatus.DISPUTED;
        order.disputeReasonHash = reasonHash;
        order.disputeOpenedAt = block.timestamp;

        emit OrderDisputed(campaignId, orderId, recovered, reasonHash);
    }

    /**
     * @notice Operator resolves dispute.
     * Operator CAN ONLY split the exact disputed order amount between buyer principal and seller principal.
     * Strict conservation law invariant enforced: buyerShare + sellerShare == remainingGross!
     */
    function resolveDispute(
        uint256 campaignId,
        uint256 orderId,
        uint256 buyerShare,
        uint256 sellerShare
    ) external onlyOperator nonReentrant {
        _ensureOrderRebateAllocated(campaignId, orderId);
        Order storage order = orders[orderId];
        CampaignState storage state = campaignStates[campaignId];
        require(state.status != CampaignStatus.CANCELLED, "Campaign cancelled");

        require(order.campaignId == campaignId, "Mismatched campaign/order");
        require(order.deliveryStatus == DeliveryStatus.DISPUTED, "Order not DISPUTED");

        uint256 alreadyAllocated = order.rebateAllocated + order.sellerAllocated + order.buyerRefundAllocated;
        require(order.committedGross >= alreadyAllocated, "Over-allocated");
        uint256 unallocated = order.committedGross - alreadyAllocated;
        require(buyerShare + sellerShare == unallocated, "Conservation violated: sum != remainingGross");

        order.buyerRefundAllocated += buyerShare;
        order.sellerAllocated += sellerShare;
        order.deliveryStatus = DeliveryStatus.RESOLVED;

        state.totalSellerClaimable += sellerShare;

        emit DisputeResolved(campaignId, orderId, buyerShare, sellerShare);
    }

    /**
     * @notice Buyer claims their rebates and refunds via Pull pattern.
     */
    function claimBuyerFunds(
        uint256 campaignId,
        uint256[] calldata orderIds
    ) external nonReentrant returns (uint256 totalClaimed) {
        CampaignState storage state = campaignStates[campaignId];
        for (uint256 i = 0; i < orderIds.length; i++) {
            _ensureOrderRebateAllocated(campaignId, orderIds[i]);
            Order storage order = orders[orderIds[i]];
            require(order.campaignId == campaignId, "Mismatched campaign");
            require(order.buyerPrincipal == msg.sender, "Caller not order buyer principal");

            // Lazy cancel allocation fallback if campaign was emergency cancelled
            if (state.status == CampaignStatus.CANCELLED) {
                uint256 allocated = order.rebateAllocated + order.sellerAllocated + order.buyerRefundAllocated;
                if (order.committedGross > allocated) {
                    order.buyerRefundAllocated += (order.committedGross - allocated);
                }
                if (
                    order.deliveryStatus != DeliveryStatus.CONFIRMED &&
                    order.deliveryStatus != DeliveryStatus.RESOLVED &&
                    order.deliveryStatus != DeliveryStatus.BREACHED_REFUNDED
                ) {
                    order.deliveryStatus = DeliveryStatus.BREACHED_REFUNDED;
                }
            }

            uint256 totalAllocated = order.rebateAllocated + order.buyerRefundAllocated;
            require(totalAllocated > buyerClaimedAmount[orderIds[i]], "Order already claimed by buyer");

            uint256 claimable = totalAllocated - buyerClaimedAmount[orderIds[i]];
            buyerClaimedAmount[orderIds[i]] += claimable;
            order.buyerClaimed = (buyerClaimedAmount[orderIds[i]] == totalAllocated);
            totalClaimed += claimable;
        }

        require(totalClaimed > 0, "No claimable funds for buyer");
        require(campaignEscrowBalance[campaignId] >= totalClaimed, "Insufficient campaign escrow");

        campaignEscrowBalance[campaignId] -= totalClaimed;
        usdcToken.safeTransfer(msg.sender, totalClaimed);

        emit FundsClaimed(campaignId, msg.sender, totalClaimed, 0);
    }

    /**
     * @notice Seller claims their settled proceeds via Pull pattern.
     */
    function claimSellerProceeds(
        uint256 campaignId,
        uint256[] calldata orderIds
    ) external nonReentrant returns (uint256 totalClaimed) {
        CampaignTerms storage terms = campaignTerms[campaignId];
        CampaignState storage state = campaignStates[campaignId];

        require(msg.sender == terms.sellerPayoutWallet, "Caller not seller payout wallet");

        for (uint256 i = 0; i < orderIds.length; i++) {
            Order storage order = orders[orderIds[i]];
            require(order.campaignId == campaignId, "Mismatched campaign");
            require(!order.sellerClaimed, "Order already claimed by seller");
            require(
                order.deliveryStatus == DeliveryStatus.CONFIRMED ||
                order.deliveryStatus == DeliveryStatus.RESOLVED,
                "Order proceeds not yet settled"
            );

            uint256 proceeds = order.sellerAllocated;
            if (proceeds > 0) {
                order.sellerClaimed = true;
                totalClaimed += proceeds;
            }
        }

        require(totalClaimed > 0, "No claimable proceeds for seller");
        require(campaignEscrowBalance[campaignId] >= totalClaimed, "Insufficient campaign escrow");

        campaignEscrowBalance[campaignId] -= totalClaimed;
        state.totalSellerClaimed += totalClaimed;

        usdcToken.safeTransfer(terms.sellerPayoutWallet, totalClaimed);

        emit FundsClaimed(campaignId, terms.sellerPayoutWallet, totalClaimed, 2);
    }

    /**
     * @notice Allocate rebates in batches for large campaigns exceeding single-tx gas limits.
     */
    function allocateRebatesBatch(
        uint256 campaignId,
        uint256 startIndex,
        uint256 count
    ) external {
        CampaignState storage state = campaignStates[campaignId];
        require(state.status == CampaignStatus.FINALIZED, "Campaign not finalized");
        uint256[] storage orderIds = _campaignOrderIds[campaignId];
        uint256 end = startIndex + count;
        if (end > orderIds.length) {
            end = orderIds.length;
        }

        for (uint256 i = startIndex; i < end; i++) {
            Order storage order = orders[orderIds[i]];
            if (order.rebateAllocated == 0 && state.finalClearingPrice > 0) {
                uint256 unitDiff = order.lockedUnitPrice > state.finalClearingPrice
                    ? order.lockedUnitPrice - state.finalClearingPrice
                    : 0;
                uint256 totalRebate = (unitDiff * order.quantity) + order.earlyRebateValue;
                if (totalRebate > order.committedGross) {
                    totalRebate = order.committedGross;
                }
                order.rebateAllocated = totalRebate;
            }
        }
    }

    /**
     * @notice Security Multisig / Operator Emergency Cancellation:
     * Only unallocated funds are credited to buyer refund pools.
     * Settled or claimed funds are NOT clawed back.
     */
    function emergencyCancelCampaign(
        uint256 campaignId,
        bytes32 reasonHash
    ) external onlySecurityAuthority nonReentrant {
        CampaignState storage state = campaignStates[campaignId];
        require(state.status != CampaignStatus.CANCELLED, "Already cancelled");

        state.status = CampaignStatus.CANCELLED;

        // Note: Individual order refunds are calculated lazily in claimBuyerFunds
        // to guarantee emergencyCancelCampaign is strictly O(1) gas and invariant to campaign order count.
        uint256 refundPool = campaignEscrowBalance[campaignId];

        emit EmergencyCancelled(campaignId, reasonHash, refundPool);
    }

    // View helpers
    function getCampaignTiers(uint256 campaignId) external view returns (Tier[] memory) {
        return _campaignTiers[campaignId];
    }

    function getCampaignOrderIds(uint256 campaignId) external view returns (uint256[] memory) {
        return _campaignOrderIds[campaignId];
    }

    function getOrderDetails(uint256 orderId) external view returns (Order memory) {
        Order memory order = orders[orderId];
        CampaignState storage state = campaignStates[order.campaignId];

        if ((state.status == CampaignStatus.FINALIZED || state.finalizedAt > 0) && order.rebateAllocated == 0 && state.finalClearingPrice > 0) {
            uint256 unitDiff = order.lockedUnitPrice > state.finalClearingPrice
                ? order.lockedUnitPrice - state.finalClearingPrice
                : 0;
            uint256 totalRebate = (unitDiff * order.quantity) + order.earlyRebateValue;
            if (totalRebate > order.committedGross) {
                totalRebate = order.committedGross;
            }
            order.rebateAllocated = totalRebate;
        }

        if (state.status == CampaignStatus.CANCELLED) {
            uint256 allocated = order.rebateAllocated + order.sellerAllocated + order.buyerRefundAllocated;
            if (order.committedGross > allocated) {
                order.buyerRefundAllocated += (order.committedGross - allocated);
            }
            if (
                order.deliveryStatus != DeliveryStatus.CONFIRMED &&
                order.deliveryStatus != DeliveryStatus.RESOLVED &&
                order.deliveryStatus != DeliveryStatus.BREACHED_REFUNDED
            ) {
                order.deliveryStatus = DeliveryStatus.BREACHED_REFUNDED;
            }
        }

        return order;
    }
}
