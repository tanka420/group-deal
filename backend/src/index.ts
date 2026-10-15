import { WebhookService } from "./services/webhookService";
import express from "express";
import cors from "cors";
import { config } from "./config";
import { store, CampaignRecord,admitDefaultRecoveryStore } from "./db/store";
import { authRouter } from "./routes/authRoutes";
import { campaignRouter } from "./routes/campaignRoutes";
import { orderRouter } from "./routes/orderRoutes";
import { sellerRouter } from "./routes/sellerRoutes";
import { operatorRouter } from "./routes/operatorRoutes";
import { productRouter,productJsonErrorHandler } from "./routes/productRoutes";
import { deliveryRouter,resourceJsonErrorHandler } from "./routes/deliveryRoutes";
import { operationRouter } from "./routes/operationRoutes";
import {bridgeRouter} from "./routes/bridgeRoutes";
import { publicRouter } from "./routes/publicRoutes";
import { faucetRouter } from "./routes/faucetRoutes";
import { walletRouter } from "./routes/walletRoutes";
import { circleRouter } from "./routes/circleRoutes";
import { notificationRouter } from "./routes/notificationRoutes";
import {followRouter} from './routes/followRoutes';
import {supportRouter} from './routes/supportRoutes';
import { IndexerService } from "./services/indexerService";
import { DeliveryService } from "./services/deliveryService";
import { validateManifestAndEnvironment } from "./services/manifestValidator";
import { ethers } from "ethers";
import { NotificationService } from "./services/notificationService";
import { assertProjectionScope } from "./services/projectionScope";
import { validateRuntimeSecurity } from "./services/runtimeSecurity";
import {publicHealth} from './services/publicHealth';
import {selectRecoveryApplication} from './services/recoveryApplication';
import {startVerifiedRuntime} from './services/verifiedStartup';
import {ReconciliationService} from './services/reconciliationService';

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by GroupDeal CORS policy"));
    },
  })
);
app.use('/api/support',supportRouter);
app.use('/api/bridge',bridgeRouter);
app.use(express.json());
app.use(productJsonErrorHandler);
app.use(resourceJsonErrorHandler);

// Health check
app.get("/health", publicHealth);
app.get("/api/health", publicHealth);

// Mount Routes
app.use("/api/auth", authRouter);
app.use("/api/admin-auth", authRouter);
app.use("/api/campaigns", campaignRouter);
app.use("/api/orders", orderRouter);
app.use("/api/seller", sellerRouter);
app.use("/api/operator", operatorRouter);
app.use("/api/products", productRouter);
app.use("/api/delivery", deliveryRouter);
app.use("/api/transactions", operationRouter);
app.use("/api/v1", publicRouter);
app.use("/api/faucet", faucetRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/circle", circleRouter);
app.use("/api/notifications", notificationRouter);
app.use('/api/follows',followRouter);

// Initialize demo users and campaigns if empty
function initializeInitialState() {
  // Ensure default operator account exists
  const operatorEmail = "operator@groupdeal.io";
  if (!store.db.userByEmail[operatorEmail]) {
    const opId = "usr_operator_1";
    store.db.users[opId] = {
      id: opId,
      email: operatorEmail,
      createdAt: Date.now(),
      roles: ["buyer", "seller", "operator"],
      activeWallet: config.operatorAddress,
      sellerProfile: {
        displayName: "GroupDeal Operations",
        bio: "Official operator and settlement arbiter",
        payoutWallet: config.operatorAddress,
        verifiedSellerBadge: true,
        verifiedRightsBadge: true,
      },
    };
    store.db.userByEmail[operatorEmail] = opId;
    store.db.userByWallet[config.operatorAddress.toLowerCase()] = opId;
  }

  // Ensure default seller account exists
  const sellerEmail = "seller@vietnamdigital.com";
  let sellerId = store.db.userByEmail[sellerEmail];
  if (!sellerId) {
    sellerId = "usr_seller_vietnam";
    const sellerWallet = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Account 1
    store.db.users[sellerId] = {
      id: sellerId,
      email: sellerEmail,
      createdAt: Date.now(),
      roles: ["buyer", "seller"],
      activeWallet: sellerWallet,
      sellerProfile: {
        displayName: "Vietnam Digital Academy",
        bio: "Đơn vị cung cấp bản quyền phần mềm và khóa học AI chuyên sâu hàng đầu Việt Nam.",
        payoutWallet: sellerWallet,
        verifiedSellerBadge: true,
        verifiedRightsBadge: true,
      },
    };
    store.db.userByEmail[sellerEmail] = sellerId;
    store.db.userByWallet[sellerWallet.toLowerCase()] = sellerId;
  }

  // Seed realistic Vietnamese campaigns if none exist
  if (Object.keys(store.db.campaigns).length === 0) {
    const parseUSDC = (val: number) => ethers.parseUnits(val.toString(), 6).toString();
    const now = Math.floor(Date.now() / 1000);

    const c1: CampaignRecord = {
      id: "1",
      onchainCampaignId: 1,
      title: "Khóa học Full-Stack AI Engineer 2026 - Bản quyền trọn đời",
      description:
        "Lộ trình đào tạo toàn diện kiến thức Full-Stack kết hợp AI Agent, LangChain, BigQuery ML, MCP Server và triển khai Smart Contract trên Arc Network. Hưởng quyền truy cập trọn đời kho tài liệu & Private Discord.",
      category: "Giáo dục & Khóa học",
      thumbnailUrl:
        "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop",
      sellerId,
      sellerPayoutWallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      metric: "BUYER_COUNT",
      tiers: [
        { threshold: 1, price: parseUSDC(199) },
        { threshold: 10, price: parseUSDC(149) },
        { threshold: 25, price: parseUSDC(99) },
      ],
      currentUnlockedTier: 0,
      maxPerAccount: 3,
      inventoryLimit: 100,
      durationSeconds: 7 * 86400,
      deliverySlaSeconds: 86400,
      earlyRebateEnabled: true,
      earlySlotsCount: 10,
      earlyRebateAmount: parseUSDC(10),
      earlyRebateBps: 0,
      platformFeeBps: 0,
      termsHash: ethers.keccak256(ethers.toUtf8Bytes("campaign-ai-engineer-2026")),
      startTime: now,
      endTime: now + 7 * 86400,
      totalBuyerCount: 0,
      totalUnitsCommitted: 0,
      totalGrossCommitted: "0",
      deliveryMethod: "LICENSE_KEY",
      deliveryContentTemplate: "AI-PRO-2026-KEY-{RANDOM}",
      dryRunDeliveryVerified: true,
      amendments: [],
    };

    const c2: CampaignRecord = {
      id: "2",
      onchainCampaignId: 2,
      title: "Cursor Pro & Claude 3.5 Sonnet Team Seat 1 năm chính hãng",
      description:
        "Tài khoản seat thành viên gói Team bản quyền 12 tháng, kết nối trực tiếp Claude 3.5 Sonnet và GPT-4o với hạn mức không giới hạn. Giao qua link kích hoạt email doanh nghiệp bảo vệ.",
      category: "Công cụ lập trình",
      thumbnailUrl:
        "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&auto=format&fit=crop",
      sellerId,
      sellerPayoutWallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      metric: "UNITS_COUNT",
      tiers: [
        { threshold: 5, price: parseUSDC(240) },
        { threshold: 15, price: parseUSDC(180) },
        { threshold: 30, price: parseUSDC(120) },
      ],
      currentUnlockedTier: 0,
      maxPerAccount: 5,
      inventoryLimit: 50,
      durationSeconds: 14 * 86400,
      deliverySlaSeconds: 86400,
      earlyRebateEnabled: true,
      earlySlotsCount: 5,
      earlyRebateAmount: parseUSDC(15),
      earlyRebateBps: 0,
      platformFeeBps: 0,
      termsHash: ethers.keccak256(ethers.toUtf8Bytes("campaign-cursor-claude-seat")),
      startTime: now,
      endTime: now + 14 * 86400,
      totalBuyerCount: 0,
      totalUnitsCommitted: 0,
      totalGrossCommitted: "0",
      deliveryMethod: "ACCOUNT_INVITE",
      deliveryContentTemplate: "https://auth.cursor.sh/team/invite?token={RANDOM}",
      dryRunDeliveryVerified: true,
      amendments: [],
    };

    const c3: CampaignRecord = {
      id: "3",
      onchainCampaignId: 3,
      title: "Bộ UI/UX Design System Figma & React Enterprise Kit",
      description:
        "Hơn 3,500 components Figma chuẩn Auto-layout 5.0 đi kèm bộ mã nguồn React Tailwind/CSS đóng gói sẵn, token design, dark mode và tài liệu Storybook. Giấy phép thương mại Enterprise không giới hạn dự án.",
      category: "Thiết kế & Giao diện",
      thumbnailUrl:
        "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=800&auto=format&fit=crop",
      sellerId,
      sellerPayoutWallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      metric: "BUYER_COUNT",
      tiers: [
        { threshold: 1, price: parseUSDC(89) },
        { threshold: 8, price: parseUSDC(59) },
        { threshold: 20, price: parseUSDC(39) },
      ],
      currentUnlockedTier: 0,
      maxPerAccount: 2,
      inventoryLimit: 80,
      durationSeconds: 5 * 86400,
      deliverySlaSeconds: 48 * 3600,
      earlyRebateEnabled: false,
      earlySlotsCount: 0,
      earlyRebateAmount: "0",
      earlyRebateBps: 0,
      platformFeeBps: 0,
      termsHash: ethers.keccak256(ethers.toUtf8Bytes("campaign-design-system-figma")),
      startTime: now,
      endTime: now + 5 * 86400,
      totalBuyerCount: 0,
      totalUnitsCommitted: 0,
      totalGrossCommitted: "0",
      deliveryMethod: "FILE_LINK",
      deliveryContentTemplate: "https://vault.groupdeal.io/assets/design-system-v2.zip?sig={RANDOM}",
      dryRunDeliveryVerified: true,
      amendments: [],
    };

    store.db.campaigns["1"] = c1;
    store.db.campaigns["2"] = c2;
    store.db.campaigns["3"] = c3;
  }

  store.save();
}

type LocalStartupFixture={verifyManifest?:()=>Promise<unknown>;selectRecovery?:()=>ReturnType<typeof selectRecoveryApplication>;readProvider?:any;startWorkers?:()=>()=>void};
export async function startServer(fixture?:LocalStartupFixture) {
  if(fixture&&(process.env.NODE_ENV!=='test'||config.arcChainId!==31337))throw new Error('STARTUP_FIXTURE_SCOPE_REQUIRED');
  validateRuntimeSecurity();
  try {
    const result=await (fixture?.verifyManifest||validateManifestAndEnvironment)();
    console.log("[Startup] Deployment manifest verified on chain",(result as any).chainId);
  } catch {
    if (config.isProduction || config.arcChainId===5042002) throw new Error("Deployment manifest validation failed; server has not opened its port or started workers");
    console.warn("[Startup] Local deployment manifest is unavailable");
  }
  const recovery=(fixture?.selectRecovery||selectRecoveryApplication)();
  if(recovery)try{admitDefaultRecoveryStore(recovery.database);}catch(error){recovery.close();throw error;}
  if(fixture?.readProvider)IndexerService.setProvider(fixture.readProvider);
  if (!recovery&&!config.isProduction && config.arcChainId===31337 && process.env.GROUPDEAL_ENABLE_LOCAL_FIXTURES==="1") initializeInitialState();
  return startVerifiedRuntime({verify:async()=>{assertProjectionScope(store.db);},startIndexer:()=>IndexerService.start(),stopIndexer:()=>IndexerService.stop(),verifyFinancialReadiness:async()=>{
    if(!recovery)return;
    const provider=IndexerService.getProvider();if(!provider)throw new Error('RECOVERY_APPLICATION_READ_PROVIDER_REQUIRED');
    const block=await provider.getBlockNumber();await IndexerService.syncThroughBlock(block);
    const report=await ReconciliationService.runReconciliation({fixedBlockNumber:block,customProvider:provider,projectionStore:store});
    if(report.status!=='HEALTHY'||!report.perOrderVerified||!report.coverageVerified||!report.onchainBalanceVerified||!report.conservationLawPassed||report.blockNumber!==block||report.projectionBlock!==block||(await provider.getBlock(block))?.hash?.toLowerCase()!==report.blockHash.toLowerCase())throw new Error('RECOVERY_APPLICATION_FRESH_RECONCILIATION_REQUIRED');
  },listen:()=>new Promise((resolve,reject)=>{const server=app.listen(config.port);server.once('error',reject);server.once('listening',()=>{server.removeListener('error',reject);console.log('GroupDeal API listening on port',config.port,'chain',config.arcChainId);resolve(server);});}),startWorkers:()=>{
    if(fixture?.startWorkers)return fixture.startWorkers();
    const stopReconciliation=ReconciliationService.startObservingCurrent();
    // All intervals start only after the API port has been reserved successfully.
    const timers=[setInterval(() => { void import('./services/supportRetention').then(({supportRetentionSweep})=>supportRetentionSweep()).catch(()=>console.warn('[SUPPORT RETENTION] Processing failed')); },3600000),setInterval(() => { void NotificationService.processEmailOutbox().catch(() => console.warn('EMAIL_OUTBOX_PROCESSING_FAILED')); },15000),setInterval(() => { void WebhookService.processQueue().catch(() => console.warn('WEBHOOK_OUTBOX_PROCESSING_FAILED')); },5000)];return()=>{stopReconciliation();timers.forEach(clearInterval);};
  },releaseStorage:()=>recovery?.close()});
}
if(require.main===module)void startServer().then(runtime=>{let stopping=false;const stop=()=>{if(stopping)return;stopping=true;void runtime.stop().catch(()=>{process.exitCode=1;});};process.once('SIGINT',stop);process.once('SIGTERM',stop);}).catch(error => {
  console.error("[STARTUP BLOCKED]",error instanceof Error ? error.message : "Startup validation failed");
  process.exitCode=1;
});
