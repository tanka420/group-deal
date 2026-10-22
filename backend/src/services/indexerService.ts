import type {DatabaseSchema} from '../db/store';
import type {FinancialCursor} from '../domain/financialProjection';
import { ethers } from "ethers";
import { config } from "../config";
import { store, TransactionalStore, OrderRecord, EventJournalRecord, CampaignRecord } from "../db/store";
import { WebhookService } from "./webhookService";
import { HUB_ABI } from "./onchainService";
import { notifyJournalEvent } from "./eventNotifications";
import { ClaimType, orderFunds, protocolRebate } from "../../../shared/domain.cjs";
import { ArcReadProvider } from "./arcReadProvider";
import { assertProjectionScope } from "./projectionScope";
import { inCurrentDeployment, projectionId } from "./deploymentBindings";
import { eventDigest, eventIndex, readCanonicalBlock, readEventTransaction, validateEventCoordinates } from "./eventEvidence";
import {IndexerSignals} from './operationalSignals';

export class IndexerProjection {
  constructor(private readonly projection: TransactionalStore, private readonly sideEffects = true, private readonly shadowRebuild = false) {}
  private projecting?:DatabaseSchema;
  private sideEffectTarget?:TransactionalStore;
  private provider: ethers.JsonRpcProvider | null = null;
  private wsProvider: ethers.WebSocketProvider | null = null;
  private hubContract: ethers.Contract | null = null;
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private logQueue: Promise<void> = Promise.resolve();
  private syncQueue: Promise<void> = Promise.resolve();
  private rebuilding = false;
  private rebuildOrderIds: Map<string,string> | undefined;
  private readonly signals=new IndexerSignals();
  public getObservations(){return this.signals.snapshot();}

  public setProvider(provider: any): void {
    this.provider = provider;
    if (provider) {
      this.hubContract = new ethers.Contract(config.hubAddress, HUB_ABI, provider);
    }
  }

  public getProvider(): ethers.JsonRpcProvider | null {
    return this.provider;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      assertProjectionScope(this.projection.readFinancialProjectionState({wholeScope:true}).graph);
      this.provider ||= new ArcReadProvider();
      console.log(`[INDEXER] Connected to configured RPC pool (Chain ID: ${config.arcChainId})`);

      this.hubContract = new ethers.Contract(config.hubAddress, HUB_ABI, this.provider);

      // Attempt WebSocket real-time subscription for immediate deterministic block notifications
      if (config.arcWsUrl) {
        try {
          this.wsProvider = new ethers.WebSocketProvider(config.arcWsUrl, config.arcChainId, {
            staticNetwork: true,
          });
          // ws may emit an asynchronous error when closed before connecting. Keep endpoint credentials out of logs.
          this.wsProvider.websocket.onerror=()=>console.warn("[INDEXER WS] Socket error; HTTP polling remains the recovery path");
          this.wsProvider.on("block", async (blockNumber: number) => {
            try {
              await this.syncBlocks();
            } catch (err: any) {
              console.warn(`[INDEXER WS] Sync failed at block ${blockNumber}; retry through the configured HTTP pool`);
            }
          });
          console.log(`[INDEXER WS] Subscribed to real-time blocks`);
        } catch (wsErr: any) {
          console.warn(`[INDEXER WS] WebSocket unavailable; using the configured HTTP poller`);
          if(this.wsProvider)void this.wsProvider.destroy().catch(()=>{});
          this.wsProvider = null;
        }
      }

      // Initial catch-up sync
      await this.syncBlocks();

      // Poll periodically every 5 seconds to catch up any missed blocks / gaps
      this.pollTimer = setInterval(async () => {
        try {
          await this.syncBlocks();
        } catch (e: any) {
          console.warn("[INDEXER] Periodic sync failed; cursor has not advanced beyond verified ranges");
        }
      }, 5000);

      this.isRunning = true;
      this.signals.setRunning(true);
      console.log("[INDEXER] Event listeners & block poller initialized successfully");
    } catch (err: any) {
      console.warn("[INDEXER] Failed to initialize chain projection; operational recovery is required");
      this.stop();
      throw new Error("INDEXER_STARTUP_FAILED: verified backfill must succeed before API/worker startup");
    }
  }

  public stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.wsProvider) {
      try {
        void this.wsProvider.destroy().catch(()=>{});
      } catch {}
      this.wsProvider = null;
    }
    this.isRunning = false;
    this.signals.setRunning(false);
    if(this.provider instanceof ArcReadProvider){this.provider.destroy();this.provider=null;this.hubContract=null;}
  }

  /**
   * Scan and sync events across block ranges with cursor & idempotency
   */
  public async syncBlocks(): Promise<void> {
    if (this.isSyncing || !this.provider || !this.hubContract) return;
    this.isSyncing = true;
    const observationStarted=this.signals.begin();let observationSucceeded=false;

    try {
      const currentBlock = await this.provider.getBlockNumber();
      this.signals.head(currentBlock);
      await this.syncThroughBlock(currentBlock);
      observationSucceeded=true;
    } catch (err: any) {
      console.warn("[INDEXER] Sync failed; cursor has not advanced beyond verified ranges");
      throw err;
    } finally { this.signals.finish(observationStarted,observationSucceeded);this.isSyncing = false; }
  }

  public async syncThroughBlock(targetBlock: number, options:{rangeSize?:number}={}): Promise<void> {
    const rangeSize=options.rangeSize??500;
    if(!Number.isSafeInteger(rangeSize)||rangeSize<1||rangeSize>5000)throw new Error("Invalid bounded sync range size");
    const batch = this.syncQueue.then(async () => {
      if (!this.provider) throw new Error("Projection provider is unavailable");
      const state=this.projection.readFinancialProjectionState({wholeScope:true}).graph;
      assertProjectionScope(state);
      if (!Number.isSafeInteger(targetBlock) || targetBlock < config.deploymentBlock) throw new Error("Projection target precedes the deployment");
      const last = state.syncState.lastIndexedBlock || Math.max(0,config.deploymentBlock-1);
      if (targetBlock < last) throw new Error("RPC head is behind the durable indexer cursor");
      if (state.syncState.lastIndexedBlockHash && (await readCanonicalBlock(this.provider,last)).hash.toLowerCase() !== state.syncState.lastIndexedBlockHash.toLowerCase())
        throw new Error("EVENT_EVIDENCE_INVALID: durable cursor block hash changed; prepare a shadow rebuild");
      for (let from = last+1; from <= targetBlock; from += rangeSize) {
        const to = Math.min(from+rangeSize-1,targetBlock);
        await this.processBlockRange(from,to);
      }
    });
    this.syncQueue = batch.catch(() => {});
    return batch;
  }

  /** API receipts join the ordered backfill; they never project a future event ahead of older blocks. */
  public async projectVerifiedReceipt(receipt: {blockNumber:number; txHash:string; logs:readonly ethers.Log[]}): Promise<void> {
    const hubLogs = receipt.logs.filter(log => log.address.toLowerCase() === config.hubAddress.toLowerCase());
    const key = (log:ethers.Log) => config.arcChainId + "_" + config.hubAddress.toLowerCase() + "_" + receipt.txHash.toLowerCase() + "_" + log.index;
    const complete = () => {const graph=this.projection.readFinancialProjectionState({eventKeys:hubLogs.map(key)}).graph;return hubLogs.every(log=>{validateEventCoordinates(log);if(log.transactionHash.toLowerCase()!==receipt.txHash.toLowerCase()||log.blockNumber!==receipt.blockNumber)throw Error('EVENT_EVIDENCE_INVALID: receipt coordinates differ');const row=graph.eventJournal[key(log)];if(!row)return false;if(row.evidenceVersion!==2||row.eventDigest!==eventDigest(log)||row.blockHash.toLowerCase()!==log.blockHash.toLowerCase()||row.blockNumber!==log.blockNumber||row.transactionIndex!==log.transactionIndex)throw Error('EVENT_EVIDENCE_INVALID: committed receipt journal differs');return true;});};
    if (!hubLogs.length) throw new Error("Receipt has no Hub events");
    if (complete()) return;
    if (this.projection.readFinancialProjectionState().graph.syncState.lastIndexedBlock >= receipt.blockNumber) throw new Error("PROJECTION_GAP: a receipt event is missing behind the durable cursor; prepare a shadow rebuild");
    if (!this.provider) this.setProvider(new ArcReadProvider());
    await this.syncThroughBlock(receipt.blockNumber);
    if (!complete()) throw new Error("PROJECTION_PENDING: receipt events have not been verified in ordered backfill");
  }

  /**
   * Process a list of logs with strict sorting by (blockNumber, transactionIndex, logIndex)
   * and unique idempotency keys: `${chainId}_${emitter}_${txHash}_${logIndex}`
   */
  public async processLogs(logs:any[]):Promise<void>{return this.queueLogs(logs);}
  private queueLogs(logs:any[],cursor?:FinancialCursor):Promise<void>{const batch=this.logQueue.then(()=>this.processLogsSequentially(logs,cursor));this.logQueue=batch.catch(()=>{});return batch;}

  private async processLogsSequentially(logs: any[],cursor?:FinancialCursor): Promise<void> {
    if (!logs.length&&!cursor) return;
    if (!this.provider) throw new Error("Projection provider is unavailable");
    const network = await this.provider.getNetwork();
    if (BigInt(network.chainId) !== BigInt(config.arcChainId)) throw new Error("EVENT_EVIDENCE_INVALID: wrong RPC chain");
    const iface = new ethers.Interface(HUB_ABI);
    const sortedLogs = logs.filter(log => String(log.address).toLowerCase() === config.hubAddress.toLowerCase())
      .sort((a,b) => a.blockNumber-b.blockNumber || a.transactionIndex-b.transactionIndex || eventIndex(a)-eventIndex(b));
    const key = (log:any) => config.arcChainId + "_" + config.hubAddress.toLowerCase() + "_" + log.transactionHash.toLowerCase() + "_" + eventIndex(log);
    const blocks = new Map<number,any>(), transactions = new Map<string,{tx:any;receipt:any}>(), prepared:any[] = [];
    const submitted = new Map<string,string>();
    // Collect and verify the whole batch before any financial projection/outbox write.
    for (const log of sortedLogs) {
      validateEventCoordinates(log);
      const parsed = iface.parseLog({topics:[...log.topics],data:log.data});
      if (!parsed) throw new Error("EVENT_EVIDENCE_INVALID: unknown Hub event; upgrade the pinned ABI");
      const digest = eventDigest(log), eventKey = key(log), existing = this.projection.readFinancialProjectionState({eventKeys:[eventKey]}).graph.eventJournal[eventKey];
      if (submitted.has(eventKey)) {
        if (submitted.get(eventKey) !== digest) throw new Error("EVENT_EVIDENCE_INVALID: conflicting duplicate log");
        continue;
      }
      submitted.set(eventKey,digest);
      if (existing) {
        if (existing.evidenceVersion !== 2 || existing.eventDigest !== digest || existing.blockHash.toLowerCase() !== log.blockHash.toLowerCase()
          || existing.blockNumber !== log.blockNumber || existing.transactionIndex !== log.transactionIndex || existing.eventName !== parsed.name)
          throw new Error("EVENT_EVIDENCE_INVALID: journal proof differs; prepare a verified shadow rebuild");
        continue;
      }
      let block = blocks.get(log.blockNumber);
      if (!block) { block = await readCanonicalBlock(this.provider,log.blockNumber); blocks.set(log.blockNumber,block); }
      const txKey=log.transactionHash.toLowerCase();
      let transaction=transactions.get(txKey);
      if (!transaction) { transaction=await readEventTransaction(this.provider,log,block); transactions.set(txKey,transaction); }
      else {
        const receiptLog=transaction.receipt.logs.find((item:any)=>eventIndex(item)===eventIndex(log));
        if (transaction.receipt.blockNumber!==log.blockNumber || transaction.receipt.index!==log.transactionIndex || block.hash.toLowerCase()!==log.blockHash.toLowerCase()
          || !receiptLog || eventDigest(receiptLog)!==digest || receiptLog.address.toLowerCase()!==log.address.toLowerCase()) throw new Error("EVENT_EVIDENCE_INVALID: RPC log differs from successful receipt");
      }
      const creation = parsed.name === "CampaignCreated" ? await this.readCreationTerms(parsed.args,log,iface,transaction.tx) : null;
      prepared.push({log,parsed,eventKey,digest,block,claimTx:transaction.tx,creation});
    }
    for (const {receipt} of transactions.values()) for (const log of receipt.logs) {
      if (log.address.toLowerCase()!==config.hubAddress.toLowerCase()) continue;
      if (!submitted.has(key(log)) && !this.projection.readFinancialProjectionState({eventKeys:[key(log)]}).graph.eventJournal[key(log)]) throw new Error("EVENT_EVIDENCE_INVALID: batch omitted a Hub event from its receipt");
    }
    for (const [number,block] of blocks) if ((await readCanonicalBlock(this.provider,number)).hash.toLowerCase()!==block.hash.toLowerCase())
      throw new Error("EVENT_EVIDENCE_INVALID: block hash changed during verification");
    if(cursor&&(await readCanonicalBlock(this.provider,cursor.toBlock)).hash.toLowerCase()!==cursor.blockHash.toLowerCase())throw Error('EVENT_EVIDENCE_INVALID: range endpoint block changed');
    const campaignChainIds=[...new Set(sortedLogs.map(log=>iface.parseLog(log)?.args.campaignId?.toString()).filter(Boolean))] as string[],orderChainIds=[...new Set(sortedLogs.map(log=>iface.parseLog(log)?.args.orderId?.toString()).filter(Boolean))] as string[];
    this.projection.mutateFinancialProjection({campaignChainIds,orderChainIds,eventKeys:sortedLogs.map(key),sideEffects:this.sideEffects},graph=>{
      this.projecting=graph;this.sideEffectTarget={db:graph,transaction:<T>(callback:()=>T)=>callback()} as TransactionalStore;
      try {
      for (const {log,parsed,eventKey,digest,block,claimTx,creation} of prepared) {
        if (graph.eventJournal[eventKey]) {const existing=graph.eventJournal[eventKey];if(existing.evidenceVersion!==2||existing.eventDigest!==digest||existing.blockHash.toLowerCase()!==log.blockHash.toLowerCase()||existing.blockNumber!==log.blockNumber||existing.transactionIndex!==log.transactionIndex)throw Error('EVENT_EVIDENCE_INVALID: journal changed during verification');continue;}
        if(parsed.name!=="CampaignCreated"&&parsed.args.campaignId!==undefined&&!graph.campaigns[this.campaignProjectionId(parsed.args.campaignId.toString())])
          throw new Error("PROJECTION_GAP: campaign creation is missing before its event");
        if(parsed.name!=="CommitmentMade"&&parsed.args.orderId!==undefined&&!graph.orders[this.orderProjectionId(parsed.args.orderId.toString())])
          throw new Error("PROJECTION_GAP: commitment is missing before its order event");
        this.handleEvent(parsed.name,parsed.args,log,iface,{block,claimTx,creation});
        if (parsed.args.orderId !== undefined) this.appendTransaction(this.orderProjectionId(parsed.args.orderId.toString()),parsed.name,log);
        const journalRecord:EventJournalRecord = {
          id:eventKey,chainId:config.arcChainId,contractAddress:ethers.getAddress(log.address),blockNumber:log.blockNumber,
          blockHash:log.blockHash,transactionIndex:log.transactionIndex,txHash:log.transactionHash,logIndex:eventIndex(log),eventName:parsed.name,
          payload:JSON.parse(JSON.stringify(parsed.args.toObject(),(_key,value)=>typeof value === "bigint"?value.toString():value)),
          processedAt:Date.now(),evidenceVersion:2,eventDigest:digest,blockTimestamp:block.timestamp,
        };
        graph.eventJournal[eventKey]=journalRecord;
        if(this.sideEffects)notifyJournalEvent(journalRecord,this.sideEffectTarget);
      }
      }finally{this.projecting=undefined;this.sideEffectTarget=undefined;}
    },cursor);
  }

  private async processBlockRange(fromBlock: number, toBlock: number): Promise<string> {
    if (!this.provider) throw new Error("Projection provider is unavailable");
    const filter = {
      address: config.hubAddress,
      fromBlock,
      toBlock,
    };

    const network=await this.provider.getNetwork();
    if(BigInt(network.chainId)!==BigInt(config.arcChainId))throw new Error("EVENT_EVIDENCE_INVALID: wrong RPC chain");
    const end=await readCanonicalBlock(this.provider,toBlock);
    const logs = await this.provider.getLogs(filter);
    if(logs.some(log=>log.blockNumber<fromBlock||log.blockNumber>toBlock))throw new Error("EVENT_EVIDENCE_INVALID: log outside requested range");

    if ((await readCanonicalBlock(this.provider,toBlock)).hash.toLowerCase()!==end.hash.toLowerCase()) throw new Error("EVENT_EVIDENCE_INVALID: range endpoint block changed");
    await this.queueLogs(logs,{fromBlock,toBlock,blockHash:end.hash});
    return end.hash;
  }

  /**
   * Deterministically rebuild projections from clean state
   */
  public async rebuildFromClean(fromBlock?: number, toBlock?: number,options:{rangeSize?:number;onProgress?:(block:number,end:number)=>void}={}): Promise<void> {
    return this.runShadowReplay(undefined,fromBlock,toBlock,options);
  }

  public async resumeFromVerifiedCheckpoint(privateOrders:Record<string,OrderRecord>,toBlock:number,options:{rangeSize?:number;onProgress?:(block:number,end:number)=>void}={}):Promise<void>{
    return this.runShadowReplay(privateOrders,config.deploymentBlock,toBlock,options);
  }

  private async runShadowReplay(resumeOrders:Record<string,OrderRecord>|undefined,fromBlock:number|undefined,toBlock:number|undefined,options:{rangeSize?:number;onProgress?:(block:number,end:number)=>void}):Promise<void>{
    if (!this.shadowRebuild || this.sideEffects || !this.projection.isIsolated) throw new Error("In-place rebuild is disabled; use rebuild:shadow to prepare and verify a separate database");
    if (this.rebuilding) throw new Error("A shadow rebuild is already running");
    if (!this.provider) throw new Error("Rebuild requires a verified read provider");
    const start = config.deploymentBlock || 0;
    const rangeSize=options.rangeSize??500;
    if(!Number.isSafeInteger(rangeSize)||rangeSize<1||rangeSize>5000)throw new Error("Invalid bounded rebuild range size");
    if (fromBlock !== undefined && fromBlock !== start) throw new Error("Rebuild must start at the deployment block");
    const end = toBlock ?? await this.provider.getBlockNumber();
    if (this.rebuilding) throw new Error("A shadow rebuild is already running");
    if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end) || end < start) throw new Error("Invalid rebuild range");
    let replayStart=start;
    if(resumeOrders){
      assertProjectionScope(this.projection.db);
      const checkpoint=this.projection.db.syncState.lastIndexedBlock;
      if(checkpoint<start||checkpoint>end||!ethers.isHexString(this.projection.db.syncState.lastIndexedBlockHash,32)
        ||Object.values(this.projection.db.eventJournal).some(e=>e.blockNumber>checkpoint)||Object.values(this.projection.db.orders).some(o=>(o.financialProjectionBlock||0)>checkpoint))throw new Error("Verified checkpoint contains incomplete or out-of-range evidence");
      const canonical=await readCanonicalBlock(this.provider,checkpoint);
      if(canonical.hash.toLowerCase()!==this.projection.db.syncState.lastIndexedBlockHash!.toLowerCase())throw new Error("Verified checkpoint is no longer canonical");
      replayStart=checkpoint+1;
    }
    if(this.rebuilding)throw new Error("A shadow rebuild is already running");
    const privateOrders = JSON.parse(JSON.stringify(resumeOrders??this.projection.db.orders)) as Record<string, OrderRecord>;
    if(Object.values(privateOrders).some(order=>!inCurrentDeployment(order)) || Object.values(this.projection.db.campaigns).some(c=>c.onchainCampaignId!==undefined&&!inCurrentDeployment(c))) throw new Error("Rebuild requires verified deployment bindings; preserve unmatched legacy records in an explicit quarantine candidate");
    const orderIds=new Map<string,string>();
    for(const [key,order] of Object.entries(privateOrders)){
      if(key!==order.id||!Number.isSafeInteger(order.onchainOrderId)||order.onchainOrderId<1||orderIds.has(String(order.onchainOrderId)))throw new Error("Rebuild requires unique stable order bindings");
      orderIds.set(String(order.onchainOrderId),key);
    }
    const original=this.projection.snapshot();
    this.rebuilding=true;this.rebuildOrderIds=orderIds;
    try {
    this.projection.transaction(() => {
      if(!resumeOrders){
      this.projection.db.orders = {};
      this.projection.db.eventJournal = {};
      this.projection.db.syncState = { lastIndexedBlock: Math.max(0, start - 1), lastSyncTimestamp: 0 };
      for (const campaign of Object.values(this.projection.db.campaigns)) {
        if (campaign.onchainCampaignId === undefined) continue;
        campaign.totalBuyerCount = 0; campaign.totalUnitsCommitted = 0; campaign.totalGrossCommitted = "0";
        campaign.currentUnlockedTier = 0; campaign.status = "PUBLISHED";
        delete campaign.finalizedAt; delete campaign.finalClearingPrice;
      }
      }
      for (const order of Object.values(privateOrders)) {
        if (order.buyerAccountId === "unknown_buyer") continue;
        const key = order.buyerAccountId + ":" + order.campaignId;
        const existing = this.projection.db.campaignIdentities[key];
        if (existing && existing.identity.toLowerCase() !== order.campaignIdentity.toLowerCase()) throw new Error("Historical account identity conflict");
        this.projection.db.campaignIdentities[key] ||= { accountId: order.buyerAccountId, campaignId: order.campaignId, identity: order.campaignIdentity, derivationVersion: 1, createdAt: order.createdAt };
      }
    });
    for (let from = replayStart; from <= end; from += rangeSize) {
      const to = Math.min(from + rangeSize - 1, end);
      let hash:string|undefined;
      for(let attempt=0;attempt<4;attempt++){
        try{hash=await this.processBlockRange(from,to);break;}
        catch(error){
          if(!(error instanceof Error)||error.message!=="Arc read RPC unavailable or wrong network"||attempt===3)throw error;
          console.warn("[SHADOW REBUILD] Read RPC unavailable; retrying the same bounded range without advancing its checkpoint");
          await new Promise<void>(resolve=>setTimeout(resolve,[250,1000,2000][attempt]));
        }
      }
      if(!hash)throw new Error("Verified rebuild range hash is unavailable");
      options.onProgress?.(to,end);
    }
    this.projection.transaction(() => {
      for (const original of Object.values(privateOrders)) {
        const rebuilt = this.projection.db.orders[original.id];
        if (!rebuilt || original.campaignId !== rebuilt.campaignId || original.campaignIdentity.toLowerCase() !== rebuilt.campaignIdentity.toLowerCase()
          || original.buyerPrincipal.toLowerCase() !== rebuilt.buyerPrincipal.toLowerCase()) throw new Error("Rebuild cannot preserve an order with unmatched chain identity");
        if (original.deliveryProofHash && rebuilt.deliveryProofHash?.toLowerCase() !== original.deliveryProofHash.toLowerCase()) throw new Error("Rebuild delivery proof differs; private entitlement was not attached");
        for (const field of ["deliveredEntitlementEncrypted", "disputeReason", "disputeEvidence", "disputeResolution", "review", "productSnapshot"] as const) {
          if (original[field] !== undefined) (rebuilt as any)[field] = original[field];
        }
      }
    });
    } catch(error) {
      // This instance owns an isolated candidate. A failed replay must retain all private fields.
      this.projection.replace(original);
      throw error;
    } finally {this.rebuildOrderIds=undefined;this.rebuilding=false;}
  }

  private enqueue(log:any,sellerId:string,eventName:string,payload:any): void {
    if(this.sideEffects)WebhookService.enqueueEvent(sellerId,eventName,payload,{eventId:`evt_${ethers.keccak256(ethers.toUtf8Bytes(`${config.arcChainId}:${config.hubAddress.toLowerCase()}:${log.transactionHash.toLowerCase()}:${eventIndex(log)}:${eventName}:${sellerId}`)).slice(2)}`,eventCreatedAt:Date.now()},this.sideEffectTarget!);
  }

  private async readCreationTerms(args:any, log:any, iface:ethers.Interface, tx:any): Promise<Partial<CampaignRecord>> {
    let terms:any, tiers:any;
    if (tx && tx.to?.toLowerCase() === config.hubAddress.toLowerCase()) {
      const decoded = iface.parseTransaction({data:tx.data,value:tx.value});
      if (decoded?.name === "createCampaign") { terms = decoded.args[0]; tiers = decoded.args[1]; }
    }
    if (!terms) {
      if (!this.hubContract) throw new Error("Creation terms evidence is unavailable");
      [terms,tiers] = await Promise.all([this.hubContract.campaignTerms(args.campaignId,{blockTag:log.blockNumber}),this.hubContract.getCampaignTiers(args.campaignId,{blockTag:log.blockNumber})]);
    }
    if (String(terms.sellerPayoutWallet).toLowerCase() !== String(args.sellerPayoutWallet).toLowerCase() || terms.termsHash !== args.termsHash
      || Number(terms.metric) !== Number(args.metric) || Number(terms.inventoryLimit) !== Number(args.inventoryLimit)
      || Number(terms.durationSeconds) !== Number(args.endTime)-Number(args.startTime)) throw new Error("Creation terms/event evidence mismatch");
    return { metric:Number(terms.metric) === 0 ? "BUYER_COUNT":"UNITS_COUNT", maxPerAccount:Number(terms.maxPerAccount), inventoryLimit:Number(terms.inventoryLimit),
      durationSeconds:Number(terms.durationSeconds),deliverySlaSeconds:Number(terms.deliverySlaSeconds),earlyRebateEnabled:terms.earlyRebateEnabled,earlySlotsCount:Number(terms.earlySlotsCount),
      earlyRebateAmount:String(terms.earlyRebateAmount),earlyRebateBps:Number(terms.earlyRebateBps),platformFeeBps:Number(terms.platformFeeBps),
      // The contract initializes this getter field to tier zero even before finalization.
      // Status still determines whether this is a final clearing decision.
      finalClearingPrice:String(tiers[0].price),
      tiers:tiers.map((tier:any)=>({threshold:Number(tier.threshold),price:String(tier.price)})) };
  }

  private campaignProjectionId(onchainId: string): string {
    return projectionId(this.projecting!,"campaigns",onchainId);
  }
  private orderProjectionId(onchainId: string): string {
    const preserved=this.rebuildOrderIds?.get(onchainId);
    if(preserved)return preserved;
    const resolved=projectionId(this.projecting!,"orders",onchainId);
    if(this.rebuildOrderIds&&[...this.rebuildOrderIds.values()].includes(resolved)){
      const namespaced=`chain-${config.arcChainId}-${config.hubAddress.toLowerCase()}-${onchainId}`;
      if(this.projecting!.orders[namespaced]||[...this.rebuildOrderIds.values()].includes(namespaced))throw new Error("Rebuild order namespace conflicts with a preserved stable ID");
      return namespaced;
    }
    return resolved;
  }

  private appendTransaction(orderId: string, action: string, log: any): void {
    const order = this.projecting!.orders[orderId];
    if (!order) throw new Error("Order projection missing for financial event");
    const history = order.transactionHistory ||= [];
    if (!history.some(t => t.txHash.toLowerCase() === log.transactionHash.toLowerCase() && t.logIndex === (log.index ?? log.logIndex ?? 0))) {
      history.push({ action, txHash: log.transactionHash, blockNumber: log.blockNumber, blockHash: log.blockHash || "", logIndex: log.index ?? log.logIndex ?? 0, chainId: config.arcChainId, hubAddress: config.hubAddress });
    }
    order.financialProjectionBlock = log.blockNumber;
  }

  private handleEvent(
    eventName: string,
    args: any,
    log: any,
    iface: ethers.Interface,
    evidence: { block: any; claimTx: any; creation: Partial<CampaignRecord> | null }
  ): void {
    const txHash = log.transactionHash;

    switch (eventName) {
      case "CampaignCreated": {
        const campaignId = this.campaignProjectionId(args.campaignId.toString());
        const sellerPayoutWallet = args.sellerPayoutWallet;
        const termsHash = args.termsHash;

        let campaign = this.projecting!.campaigns[campaignId];
        if (campaign) {
          if(typeof campaign.sellerPayoutWallet!=="string"||!ethers.isHexString(campaign.creationTermsHash??campaign.termsHash,32)||campaign.sellerPayoutWallet.toLowerCase()!==String(args.sellerPayoutWallet).toLowerCase() || (campaign.creationTermsHash ?? campaign.termsHash).toLowerCase()!==String(args.termsHash).toLowerCase()) throw new Error("EVENT_EVIDENCE_INVALID: creation differs from existing deployment binding");
          Object.assign(campaign,evidence.creation);
          campaign.creationTermsHash = String(args.termsHash);
          campaign.termsHash = String(args.termsHash);
          campaign.termsPolicyReviewRequired = false;
          campaign.protocolVersion=config.protocolVersion;
          campaign.onchainCampaignId = Number(args.campaignId);
          campaign.chainId=config.arcChainId;campaign.hubAddress=config.hubAddress.toLowerCase();
          if (campaign.status === "DRAFT") campaign.status = "PUBLISHED";
          campaign.startTime = Number(args.startTime);
          campaign.endTime = Number(args.endTime);

        } else {
          // Synthesize campaign from onchain event if created outside local drafts
          const synthesized: CampaignRecord = {
            id: campaignId,
            onchainCampaignId: Number(args.campaignId),
            chainId:config.arcChainId,hubAddress:config.hubAddress.toLowerCase(),
            protocolVersion:config.protocolVersion,
            projectionOrigin: "CHAIN_UNBOUND",
            title: `Onchain Campaign #${campaignId}`,
            description: "Synchronized directly from Arc Testnet contract event",
            category: "General",
            thumbnailUrl: "",
            sellerId: `seller_${sellerPayoutWallet.toLowerCase().substring(0, 8)}`,
            sellerPayoutWallet: ethers.getAddress(sellerPayoutWallet),
            status: "PUBLISHED",
            visibility: "UNLISTED",
            metric: Number(args.metric) === 0 ? "BUYER_COUNT" : "UNITS_COUNT",
            tiers: [],
            currentUnlockedTier: 0,
            maxPerAccount: 0,
            inventoryLimit: Number(args.inventoryLimit),
            durationSeconds: Math.max(0, Number(args.endTime) - Number(args.startTime)),
            deliverySlaSeconds: 86400,
            earlyRebateEnabled: false,
            earlySlotsCount: 0,
            earlyRebateAmount: "0",
            earlyRebateBps: 0,
            platformFeeBps: 0,
            termsHash: termsHash,
            creationTermsHash: String(termsHash),
            termsPolicyReviewRequired: false,
            startTime: Number(args.startTime),
            endTime: Number(args.endTime),
            totalBuyerCount: 0,
            totalUnitsCommitted: 0,
            totalGrossCommitted: "0",
            deliveryMethod: "LICENSE_KEY",
            deliveryContentTemplate: "",
            dryRunDeliveryVerified: false,
            amendments: [],
          };
          Object.assign(synthesized,evidence.creation);
          this.projecting!.campaigns[campaignId] = synthesized;

        }
        break;
      }

      case "CampaignTermsUpdated": {
        const campaign = this.projecting!.campaigns[this.campaignProjectionId(args.campaignId.toString())];
        if (!campaign) throw new Error("PROJECTION_GAP: terms update has no campaign creation");
        // Only canonical, successful receipt events reach this handler. The current financial
        // hash follows chain; immutable publish/product metadata keeps its original binding.
        campaign.termsHash = String(args.newTermsHash);
        campaign.termsPolicyReviewRequired = campaign.projectionOrigin !== "CHAIN_UNBOUND"
          && (!campaign.creationTermsHash || campaign.creationTermsHash.toLowerCase() !== campaign.termsHash.toLowerCase());

        break;
      }

      case "TierUnlocked": {
        const campaignId = this.campaignProjectionId(args.campaignId.toString());
        const tierIndex = Number(args.tierIndex);
        const threshold = args.threshold.toString();
        const price = args.price.toString();

        const campaign = this.projecting!.campaigns[campaignId];
        if (campaign) {
          campaign.currentUnlockedTier = tierIndex;

          this.enqueue(log,campaign.sellerId, "campaign.tier_unlocked", {
            campaignId,
            tierIndex,
            threshold,
            price,
          });
        }
        break;
      }

      case "CommitmentMade": {
        const commitmentBlock = evidence.block;
        if (!commitmentBlock) throw new Error("Commitment block timestamp is unavailable");
        const campaignId = this.campaignProjectionId(args.campaignId.toString());
        const orderId = this.orderProjectionId(args.orderId.toString());
        const campaignIdentity = args.campaignIdentity;
        const buyerPrincipal = ethers.getAddress(args.buyerPrincipal);
        const quantity = Number(args.quantity);
        const lockedUnitPrice = args.lockedUnitPrice.toString();
        const committedGross = args.committedGross.toString();
        const isEarlySupporter = args.isEarlySupporter;
        const earlyRebateValue = args.earlyRebateValue.toString();

        const owners = Object.values(this.projecting!.campaignIdentities).filter(identity => identity.campaignId === campaignId && identity.identity.toLowerCase() === String(campaignIdentity).toLowerCase());
        if (owners.length > 1) throw new Error("Ambiguous campaign identity owner");
        const buyerAccountId = owners[0]?.accountId || "unknown_buyer";

        let order = this.projecting!.orders[orderId];
        if(order)throw new Error("Duplicate commitment differs from the journal; prepare a shadow rebuild");
        const isFirstIdentityOrder = !Object.values(this.projecting!.orders).some(
          (candidate) =>
            candidate.campaignId === campaignId &&
            candidate.campaignIdentity.toLowerCase() === String(campaignIdentity).toLowerCase()
        );
        if (!order) {
          order = {
            id: orderId,
            onchainOrderId: Number(args.orderId),
            chainId:config.arcChainId,hubAddress:config.hubAddress.toLowerCase(),
            protocolVersion:this.projecting!.campaigns[campaignId]?.protocolVersion||1,
            campaignId,
            buyerAccountId,
            campaignIdentity,
            ...(this.projecting!.campaigns[campaignId]?.productSnapshot ? {productSnapshot:this.projecting!.campaigns[campaignId].productSnapshot} : {}),
            buyerPrincipal,
            quantity,
            lockedUnitPrice,
            committedGross,
            isEarlySupporter,
            earlyRebateValue,
            rebateAllocated: "0",
            sellerAllocated: "0",
            buyerRefundAllocated: "0",
            deliveryStatus: "PENDING",
            txHash,
            commitmentTxHash: txHash,
            buyerClaimedAmount: "0",
            sellerClaimedAmount: "0",
            financialProjectionBlock: log.blockNumber,
            createdAt: Number(commitmentBlock.timestamp) * 1000,
            buyerClaimed: false,
            sellerClaimed: false,
          };
          this.projecting!.orders[orderId] = order;
        }

        const campaign = this.projecting!.campaigns[campaignId];
        if (campaign) {
          if (campaign.status !== "FINALIZED" && campaign.status !== "CANCELLED") campaign.status = "ACTIVE";
          if (campaign.finalizedAt && campaign.finalClearingPrice) {
            order.rebateAllocated = protocolRebate(campaign.protocolVersion||1,lockedUnitPrice, campaign.finalClearingPrice, quantity, earlyRebateValue, committedGross);
          }
          campaign.totalUnitsCommitted += quantity;
          campaign.totalGrossCommitted = (
            BigInt(campaign.totalGrossCommitted || "0") + BigInt(committedGross)
          ).toString();
          if (isFirstIdentityOrder) campaign.totalBuyerCount += 1;
          this.enqueue(log,campaign.sellerId, "order.committed", order);
        }

        break;
      }

      case "CampaignFinalized": {
        const campaignId = this.campaignProjectionId(args.campaignId.toString());
        const finalClearingPrice = args.finalClearingPrice.toString();

        const campaign = this.projecting!.campaigns[campaignId];
        if (campaign) {
          campaign.status = "FINALIZED";
          campaign.finalClearingPrice = finalClearingPrice;
          const finalizedBlock = evidence.block;
          if (!finalizedBlock) throw new Error("Finalization block timestamp is unavailable");
          campaign.finalizedAt = Number(finalizedBlock.timestamp);

          // Update rebate allocations for all orders in this campaign lazily
          for (const ord of Object.values(this.projecting!.orders)) {
            if (ord.campaignId === campaignId) {
              ord.rebateAllocated = protocolRebate(campaign.protocolVersion||1,ord.lockedUnitPrice, finalClearingPrice, ord.quantity, ord.earlyRebateValue || "0", ord.committedGross);
              ord.financialProjectionBlock = log.blockNumber;
            }
          }


          this.enqueue(log,campaign.sellerId, "campaign.finalized", {
            campaignId,
            finalClearingPrice,
          });
        }
        break;
      }

      case "DeliveryRecorded": {
        const orderId = this.orderProjectionId(args.orderId.toString());
        const proofHash = args.proofHash;
        const deliveryTimestamp = Number(args.deliveryTimestamp);
        const disputeDeadline = Number(args.disputeDeadline);

        const order = this.projecting!.orders[orderId];
        if (order) {
          order.deliveryStatus = "DELIVERED";
          order.deliveryProofHash = proofHash;
          order.deliveryTimestamp = deliveryTimestamp;
          order.disputeDeadline = disputeDeadline;
          order.deliveryTxHash = txHash;


          const campaign = this.projecting!.campaigns[order.campaignId];
          if (campaign) {
            this.enqueue(log,campaign.sellerId, "order.delivered", order);
          }
        }
        break;
      }

      case "DeliveryBreached": {
        const orderId = this.orderProjectionId(args.orderId.toString());
        const refundAmount = args.refundAmount.toString();

        const order = this.projecting!.orders[orderId];
        if (order) {
          order.deliveryStatus = "BREACHED_REFUNDED";
          order.buyerRefundAllocated = refundAmount;


          const campaign = this.projecting!.campaigns[order.campaignId];
          if (campaign) {
            this.enqueue(log,campaign.sellerId, "order.breached", order);
          }
        }
        break;
      }

      case "OrderConfirmed": {
        const orderId = this.orderProjectionId(args.orderId.toString());
        const sellerProceeds = args.sellerProceeds.toString();

        const order = this.projecting!.orders[orderId];
        if (order) {
          order.deliveryStatus = "CONFIRMED";
          order.sellerAllocated = sellerProceeds;


          const campaign = this.projecting!.campaigns[order.campaignId];
          if (campaign) {
            this.enqueue(log,campaign.sellerId, "order.confirmed", order);
          }
        }
        break;
      }

      case "OrderDisputed": {
        const orderId = this.orderProjectionId(args.orderId.toString());

        const order = this.projecting!.orders[orderId];
        if (order) {
          // A cancelled campaign exposes the lazy-refund effective state even when
          // a previously delivered raw order subsequently emits OrderDisputed.
          order.deliveryStatus = this.projecting!.campaigns[order.campaignId]?.status === "CANCELLED" ? "BREACHED_REFUNDED" : "DISPUTED";


          const campaign = this.projecting!.campaigns[order.campaignId];
          if (campaign) {
            this.enqueue(log,campaign.sellerId, "order.disputed", order);
          }
        }
        break;
      }

      case "DisputeResolved": {
        const orderId = this.orderProjectionId(args.orderId.toString());
        const buyerShare = args.buyerShare.toString();
        const sellerShare = args.sellerShare.toString();

        const order = this.projecting!.orders[orderId];
        if (order) {
          order.deliveryStatus = "RESOLVED";
          // The event carries deltas; the contract adds these shares to existing allocations.
          // Ordered event journaling prevents the same receipt from applying the delta twice.
          order.buyerRefundAllocated = (BigInt(order.buyerRefundAllocated) + BigInt(buyerShare)).toString();
          order.sellerAllocated = (BigInt(order.sellerAllocated) + BigInt(sellerShare)).toString();


          const campaign = this.projecting!.campaigns[order.campaignId];
          if (campaign) {
            this.enqueue(log,campaign.sellerId, "order.resolved", order);
          }
        }
        break;
      }

      case "FundsClaimed": {
        const campaignId = this.campaignProjectionId(args.campaignId.toString());
        const recipient = ethers.getAddress(args.recipient).toLowerCase();
        const claimType = Number(args.claimType);
        if (claimType !== ClaimType.BUYER && claimType !== ClaimType.SELLER) throw new Error("Unknown claim type");
        const tx = evidence.claimTx;
        if (!tx?.data || String(tx.to).toLowerCase() !== config.hubAddress.toLowerCase() || String(tx.from).toLowerCase() !== recipient) {
          throw new Error("Claim calldata/principal unavailable or mismatched");
        }
        const parsedTx = iface.parseTransaction({ data: tx.data, value: tx.value });
        const expectedFunction = claimType === ClaimType.BUYER ? "claimBuyerFunds" : "claimSellerProceeds";
        if (parsedTx?.name !== expectedFunction || parsedTx.args[0].toString() !== String(this.projecting!.campaigns[campaignId]?.onchainCampaignId)) throw new Error("Claim action/campaign mismatch");
        const requestedOrderIds: string[] = parsedTx.args[1].map((id: any) => id.toString());
        if (!requestedOrderIds.length || claimType === ClaimType.BUYER && new Set(requestedOrderIds).size !== requestedOrderIds.length) throw new Error("Invalid claim order list");
        const claimedOrderIds = [...new Set(requestedOrderIds)];
        const occurrences = new Map<string, number>();
        for (const oid of requestedOrderIds) occurrences.set(oid, (occurrences.get(oid) ?? 0) + 1);
        const updates = claimedOrderIds.map(oid => {
          const ord = this.projecting!.orders[this.orderProjectionId(oid)];
          const campaign = this.projecting!.campaigns[campaignId];
          if (!ord || ord.campaignId !== campaignId) throw new Error("Missing claim order projection");
          const principal = claimType === ClaimType.BUYER ? ord.buyerPrincipal : campaign?.sellerPayoutWallet;
          if (principal?.toLowerCase() !== recipient) throw new Error("Claim recipient mismatch");
          const funds = orderFunds(ord);
          if (!funds.accountingVerified) throw new Error("Legacy claimed amount requires verified rebuild");
          const delta = BigInt((claimType === ClaimType.BUYER ? funds.buyerClaimable : funds.sellerClaimable)!);
          if (claimType === ClaimType.BUYER && delta <= 0n) throw new Error("Claim order has no buyer funds");
          if (claimType === ClaimType.SELLER) {
            if (!["CONFIRMED", "RESOLVED"].includes(ord.deliveryStatus) || BigInt(funds.sellerClaimedAmount!) > 0n) throw new Error("Seller claim order is unsettled or already withdrawn");
            // The contract leaves sellerClaimed false for zero proceeds and permits
            // that ID to repeat in an otherwise positive batch. Positive repeats revert.
            if (delta > 0n && occurrences.get(oid)! > 1) throw new Error("Invalid positive seller claim duplicate");
          }
          return { ord, funds, delta };
        });
        if (updates.reduce((sum, update) => sum + update.delta, 0n) !== BigInt(args.amount)) throw new Error("Claim event amount differs from per-order allocation");
        for (const { ord, funds } of updates) {
          if (claimType === ClaimType.BUYER) {
            ord.buyerClaimedAmount = funds.buyerAllocated;
            ord.buyerClaimed = true;
          } else {
            if (funds.sellerClaimable === "0") continue;
            ord.sellerClaimedAmount = funds.sellerAllocated;
            ord.sellerClaimed = true;
          }
          ord.financialProjectionBlock = log.blockNumber;
          this.appendTransaction(ord.id, claimType === ClaimType.BUYER ? "BuyerFundsClaimed" : "SellerProceedsClaimed", log);
        }

        break;
      }

      case "EmergencyCancelled": {
        const campaignId = this.campaignProjectionId(args.campaignId.toString());
        const campaign = this.projecting!.campaigns[campaignId];
        if (campaign) {
          campaign.status = "CANCELLED";
          for (const order of Object.values(this.projecting!.orders)) {
            if (order.campaignId === campaignId) {
              const allocated =
                BigInt(order.rebateAllocated || "0") +
                BigInt(order.sellerAllocated || "0") +
                BigInt(order.buyerRefundAllocated || "0");
              const committed = BigInt(order.committedGross);
              if (committed > allocated) {
                const unallocated = committed - allocated;
                order.buyerRefundAllocated = (BigInt(order.buyerRefundAllocated || "0") + unallocated).toString();
              }
              if (order.deliveryStatus !== "CONFIRMED" && order.deliveryStatus !== "RESOLVED") {
                order.deliveryStatus = "BREACHED_REFUNDED";
              }
            }
          }

          this.enqueue(log,campaign.sellerId, "campaign.cancelled", { campaignId });
        }
        break;
      }
    }
  }
}

export const IndexerService = new IndexerProjection(store);
