export interface TransactionOperation {
  id:string; userId:string; action:"PUBLISH"|"DELIVER"|"BUY"|"BUYER_CLAIM"|"SELLER_CLAIM"|"DISPUTE"|"RESOLVE"|"CONFIRM"|"BREACH"|"SETTLE";
  resourceId:string; chainId:number; hubAddress:string; principal:string; idempotencyKey:string;
  payloadHash:string; calldata:string; intentId:string; expectedFunction:string; expectedEvent:string; expectedEventArgs:Record<string,string|number>;
  phase:"PREPARED"|"AWAITING_SIGNATURE"|"SUBMITTED"|"RECEIPT_VERIFIED"|"PROJECTED"|"UNKNOWN"|"REVERTED"|"SUPERSEDED"|"EXPIRED";
  txHash?:string; blockNumber?:number; blockHash?:string; stagedEntitlementEncrypted?:string;
  financialQuote?:{kind:"READ_ONLY_SIMULATION";blockNumber:number;blockHash:string;amountBaseUnits:string};
  purchaseQuote?:{blockNumber:number;blockHash:string;lockedUnitPrice:string;commitmentAmount:string;unitsAlreadyBought:string;remainingInventory:string|null;maxGrossAmount:string;authorizationNonce:number;termsHash:string};
  projectedOrderId?:string;
  broadcastWitnesses?:{txHash:string;nonce:number;observedAt:number;source:"SIGNED_TRANSACTION"|"RPC_TRANSACTION"}[];
  replacements?:{previousTxHash:string;txHash:string;nonce:number;blockNumber:number;blockHash:string;kind:"SAME_CALL"|"NONCE_CONSUMED";verifiedAt:number}[];
  authorizationExpiry?:{blockNumber:number;blockHash:string;blockTimestamp:number;deadline:number;authorizationNonce:number;quoteBlockNumber:number;quoteBlockHash:string;authorizationSigner:string;verifiedAt:number};
  deliveryRetry?:{previousOperationId:string;terminal:{phase:"REVERTED"|"SUPERSEDED";txHash:string;blockNumber:number;blockHash:string};capability:{blockNumber:number;blockHash:string;checkedAt:number}};
  deliveryQuote?:{blockNumber:number;blockHash:string;checkedAt:number};
  stagedOrderMetadataEncrypted?:string; orderMetadataHash?:string; orderTermsHash?:string;
  orderQuote?:{kind:"READ_ONLY_SIMULATION";blockNumber:number;blockHash:string;remainingGross:string;buyerShare?:string;sellerShare?:string;disputeDeadline:number};
  createdAt:number; updatedAt:number; errorCode?:string;
}
