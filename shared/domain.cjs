"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignStatus = exports.DeliveryStatus = exports.ClaimType = void 0;
exports.unsignedAmount = unsignedAmount;
exports.v1Rebate = v1Rebate;
exports.protocolRebate = protocolRebate;
exports.orderFunds = orderFunds;
/** Protocol v1 deployed on Arc. Amounts are integer USDC base units, never display floats. */
exports.ClaimType = { BUYER: 0, SELLER: 2 };
exports.DeliveryStatus = ["PENDING", "DELIVERED", "CONFIRMED", "DISPUTED", "BREACHED_REFUNDED", "RESOLVED"];
exports.CampaignStatus = ["CREATED", "ACTIVE", "FINALIZED", "CANCELLED"];
function unsignedAmount(value) {
    if (!/^(0|[1-9]\d*)$/.test(value))
        throw new Error("Amount must be an unsigned base-unit integer string");
    return BigInt(value);
}
/** Mirrors existing v1 economics. Correcting first-unit economics requires a new protocol. */
function v1Rebate(lockedPrice, finalPrice, quantity, earlyValue, gross) {
    if (!Number.isSafeInteger(quantity) || quantity < 1)
        throw new Error("Invalid quantity");
    const locked = unsignedAmount(lockedPrice);
    const final = unsignedAmount(finalPrice);
    const total = (locked > final ? locked - final : 0n) * BigInt(quantity) + unsignedAmount(earlyValue);
    const committed = unsignedAmount(gross);
    return (total > committed ? committed : total).toString();
}
function protocolRebate(version,lockedPrice,finalPrice,quantity,earlyValue,gross) {
    if(version===1)return v1Rebate(lockedPrice,finalPrice,quantity,earlyValue,gross);
    if(version!==2)throw new Error("Unsupported financial protocol version");
    if(!Number.isSafeInteger(quantity)||quantity<1)throw new Error("Invalid quantity");
    const locked=unsignedAmount(lockedPrice),final=unsignedAmount(finalPrice),committed=unsignedAmount(gross),early=unsignedAmount(earlyValue);
    if(committed!==locked*BigInt(quantity))throw new Error("Gross must equal locked price times quantity");
    const earlyCap=final<locked?final:locked;
    const rebate=(locked>final?locked-final:0n)*BigInt(quantity)+(early>earlyCap?earlyCap:early);
    return (rebate>committed?committed:rebate).toString();
}
function orderFunds(order) {
    const gross = unsignedAmount(order.committedGross);
    const buyerAllocation = unsignedAmount(order.rebateAllocated) + unsignedAmount(order.buyerRefundAllocated);
    const sellerAllocation = unsignedAmount(order.sellerAllocated);
    if (buyerAllocation + sellerAllocation > gross)
        throw new Error("Order over-allocation");
    const buyerVerified = order.buyerClaimedAmount !== undefined || !order.buyerClaimed;
    const sellerVerified = order.sellerClaimedAmount !== undefined || !order.sellerClaimed;
    const buyerClaimed = unsignedAmount(order.buyerClaimedAmount ?? "0");
    const sellerClaimed = unsignedAmount(order.sellerClaimedAmount ?? "0");
    if (buyerClaimed > buyerAllocation || sellerClaimed > sellerAllocation)
        throw new Error("Claims exceed allocation");
    return {
        buyerAllocated: buyerAllocation.toString(), sellerAllocated: sellerAllocation.toString(),
        buyerClaimedAmount: buyerVerified ? buyerClaimed.toString() : null,
        sellerClaimedAmount: sellerVerified ? sellerClaimed.toString() : null,
        buyerClaimable: buyerVerified ? (buyerAllocation - buyerClaimed).toString() : null,
        sellerClaimable: sellerVerified ? (sellerAllocation - sellerClaimed).toString() : null,
        unallocated: (gross - buyerAllocation - sellerAllocation).toString(),
        accountingVerified: buyerVerified && sellerVerified,
    };
}
