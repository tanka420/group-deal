import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { useAuth } from "./AuthContext";
import { useExternalWallet } from "./ExternalWalletContext";
import { getArcReadProvider, readArcBalance } from "../services/arcRpc";
import { PurchaseParams, purchaseBudget, assertPurchaseBudget, assertCallBudget, verifyArcCommitment } from "../services/checkout";

type WalletMode = "EXTERNAL_REOWN" | "CIRCLE_EMBEDDED" | "DISCONNECTED";

type CircleIntent =
  | { type: "USDC_APPROVE"; amount: string }
  | { type: "CREATE_CAMPAIGN"; draftId: string }
  | { type: "COMMIT_BUY"; campaignId: string; quantity: string }
  | { type: "RECORD_DELIVERY"; orderId: string; proofHash: string }
  | { type: "CLAIM_BUYER"; campaignId: string; orderIds: string[] }
  | { type: "CLAIM_SELLER"; campaignId: string; orderIds: string[] }
  | { type: "CONFIRM_RECEIPT"; campaignId: string; orderId: string }
  | { type: "OPEN_DISPUTE"; campaignId: string; orderId: string }
  | { type: "CLAIM_DELIVERY_BREACH"; campaignId: string; orderId: string }
  | { type: "SETTLE_UNDISPUTED"; campaignId: string; orderId: string }
  | {
      type: "RESOLVE_DISPUTE";
      campaignId: string;
      orderId: string;
      buyerShare: string;
      sellerShare: string;
    };

interface CampaignDraftForChain {
  id: string;
  sellerPayoutWallet: string;
  metric: "BUYER_COUNT" | "UNITS_COUNT";
  maxPerAccount: number;
  inventoryLimit: number;
  durationSeconds: number;
  deliverySlaSeconds: number;
  earlyRebateEnabled: boolean;
  earlySlotsCount: number;
  earlyRebateAmount: string;
  earlyRebateBps: number;
  platformFeeBps: number;
  termsHash: string;
  tiers: Array<{ threshold: number; price: string }>;
}

interface Web3ContextType {
  account: string | null;
  chainId: number | null;
  usdcBalance: string | null;
  balanceError: string | null;
  balanceLoading: boolean;
  isConnecting: boolean;
  hubAddress: string;
  usdcAddress: string;
  walletMode: WalletMode;
  externalWalletConfigured: boolean;
  externalSignerReady: boolean;
  reconnectExternalWallet: () => Promise<void>;
  loginWithExternalWallet: () => Promise<string>;
  connectExternalWallet: () => Promise<string>;
  getExternalSigner: () => Promise<ethers.Signer>;
  switchToCircleWallet: () => void;
  createCampaignOnchain: (campaign: CampaignDraftForChain) => Promise<{ txHash: string }>;
  recordDeliveryOnchain: (
    campaignId: number,
    orderId: number,
    localOrderId: string,
    proofHash: string
  ) => Promise<{ txHash: string }>;
  commitToBuyOnchain: (params: PurchaseParams) => Promise<{ txHash: string; orderId: string }>;
  claimBuyerFundsOnchain: (campaignId: number, orderIds: number[]) => Promise<{ txHash: string }>;
  claimSellerProceedsOnchain: (campaignId: number, orderIds: number[]) => Promise<{ txHash: string }>;
  confirmReceiptOnchain: (campaignId: number, orderId: number) => Promise<{ txHash: string }>;
  openDisputeOnchain: (campaignId: number, orderId: number, reason: string) => Promise<{ txHash: string }>;
  claimDeliveryBreachOnchain: (campaignId: number, orderId: number) => Promise<{ txHash: string }>;
  settleUndisputedOrderOnchain: (campaignId: number, orderId: number) => Promise<{ txHash: string }>;
  resolveDisputeOnchain: (
    campaignId: number,
    orderId: number,
    buyerShare: string,
    sellerShare: string
  ) => Promise<{ txHash: string }>;
  refreshBalance: () => Promise<void>;
}

const Web3Context = createContext<Web3ContextType>({} as Web3ContextType);
const ARC_CHAIN_ID = 5042002;
const ARC_CHAIN_HEX = "0x4cef52";
const ARC_RPC = "https://rpc.testnet.arc.io";

function formatArcUsdcBalance(balance: bigint): string {
  const [whole, fraction = ""] = ethers.formatUnits(balance, 18).split(".");
  const visibleFraction = fraction.padEnd(6, "0").slice(0, 6).replace(/0+$/, "");
  return `${whole}.${visibleFraction.padEnd(2, "0")}`;
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export const Web3Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    user,
    token,
    circleCredentials,
    executeCircleChallenge,
    loginWithWallet,
    linkExternalWallet,
  } = useAuth();
  const external = useExternalWallet();
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletMode, setWalletMode] = useState<WalletMode>("DISCONNECTED");
  const [hubAddress, setHubAddress] = useState("");
  const [usdcAddress, setUsdcAddress] = useState("");
  const balanceEpochRef = useRef(0);
  const walletOwnerRef = useRef<string | null>(null);
  const selectedAccountRef = useRef(account);
  selectedAccountRef.current = account;

  useEffect(() => {
    void fetch("/api/health")
      .then((response) => readJson(response))
      .then((data) => {
        if (data.hubAddress) setHubAddress(data.hubAddress);
        if (data.usdcAddress) setUsdcAddress(data.usdcAddress);
      })
      .catch((error) => console.warn("Could not load /api/health", error));
  }, []);

  useEffect(() => {
    const ownerChanged = walletOwnerRef.current !== (user?.id || null);
    walletOwnerRef.current = user?.id || null;
    if (!user) {
      setAccount(null);
      setWalletMode("DISCONNECTED");
      setChainId(null);
      setUsdcBalance(null);
      setBalanceError(null);
      return;
    }
    if (ownerChanged) {
      setAccount(null);
      setWalletMode("DISCONNECTED");
      setChainId(null);
      setUsdcBalance(null);
      setBalanceError(null);
    }
    if ((ownerChanged || walletMode === "DISCONNECTED") && user.activeWallet) {
      setAccount(ethers.getAddress(user.activeWallet));
      const circleSelected = user.circleWallet?.address.toLowerCase() === user.activeWallet.toLowerCase();
      setWalletMode(circleSelected ? "CIRCLE_EMBEDDED" : "EXTERNAL_REOWN");
      setChainId(circleSelected ? ARC_CHAIN_ID : null);
    }
  }, [user, walletMode]);

  useEffect(() => {
    if (walletMode === "EXTERNAL_REOWN" && external.address) {
      // Wallet account changes never silently change the authenticated identity.
      setChainId(Number(external.chainId || 0));
    }
  }, [external.address, external.chainId, walletMode]);

  const getReadProvider = getArcReadProvider;

  const ensureArcExternalSigner = async (requireIdentity = true): Promise<ethers.Signer> => {
    if (!external.provider) await external.connect();
    const initialSigner = await external.getSigner();
    const browserProvider = initialSigner.provider as ethers.BrowserProvider | null;
    if (!browserProvider || typeof browserProvider.send !== "function") {
      throw new Error("Chưa kết nối ví EVM qua Reown AppKit");
    }
    try {
      await browserProvider.send("wallet_switchEthereumChain", [{ chainId: ARC_CHAIN_HEX }]);
    } catch (error: any) {
      if (error?.code !== 4902) throw error;
      await browserProvider.send("wallet_addEthereumChain", [
        {
          chainId: ARC_CHAIN_HEX,
          chainName: "Arc Testnet",
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          rpcUrls: [ARC_RPC],
          blockExplorerUrls: ["https://testnet.arcscan.app"],
        },
      ]);
    }
    const signer = await external.getSigner();
    if (requireIdentity && (!user?.activeWallet ||
      (await signer.getAddress()).toLowerCase() !== user.activeWallet.toLowerCase())) {
      throw new Error("Ví đang kết nối khác ví tài khoản. Chọn đúng ví hoặc đăng nhập lại bằng ví mới.");
    }
    const network = await signer.provider?.getNetwork();
    if (!network || Number(network.chainId) !== ARC_CHAIN_ID) {
      throw new Error("Ví ngoài chưa chuyển sang Arc Testnet (chain ID 5042002)");
    }
    return signer;
  };

  const getExternalSigner = () => ensureArcExternalSigner();
  const reconnectExternalWallet = async () => { await ensureArcExternalSigner(); };
  const externalSignerReady = Boolean(external.connected && external.provider && account &&
    external.address?.toLowerCase() === account.toLowerCase());

  const loginWithExternalWallet = async (): Promise<string> => {
    setIsConnecting(true);
    try {
      await external.connect();
      const signer = await ensureArcExternalSigner(false);
      const authenticatedUser = await loginWithWallet(signer);
      const address = ethers.getAddress(authenticatedUser.activeWallet || (await signer.getAddress()));
      setAccount(address);
      setChainId(ARC_CHAIN_ID);
      setWalletMode("EXTERNAL_REOWN");
      return address;
    } finally {
      setIsConnecting(false);
    }
  };

  const refreshBalance = useCallback(async () => {
    const epoch = balanceEpochRef.current;
    if (!account) {
      setUsdcBalance(null);
      setBalanceError(null);
      setBalanceLoading(false);
      return;
    }
    try {
      setBalanceLoading(true);
      // Arc exposes one underlying USDC balance through two interfaces. The
      // canonical wallet balance is the native 18-decimal value; the ERC-20
      // interface at 0x3600... is the same balance represented with 6 decimals.
      const balance = await readArcBalance(account);
      if (epoch !== balanceEpochRef.current) return;
      setUsdcBalance(formatArcUsdcBalance(balance));
      setBalanceError(null);
    } catch (error) {
      if (epoch !== balanceEpochRef.current) return;
      setBalanceError("Số dư chưa cập nhật: RPC Arc đang bận. Vui lòng thử lại.");
    } finally {
      if (epoch === balanceEpochRef.current) setBalanceLoading(false);
    }
  }, [account]);

  useEffect(() => {
    balanceEpochRef.current += 1;
    setUsdcBalance(null);
    void refreshBalance();
    const interval = window.setInterval(() => void refreshBalance(), 10000);
    return () => { balanceEpochRef.current += 1; window.clearInterval(interval); };
  }, [account, walletMode, refreshBalance]);

  const connectExternalWallet = async (): Promise<string> => {
    if (!user) throw new Error("Vui lòng đăng nhập email trước khi gắn ví ngoài");
    setIsConnecting(true);
    try {
      await external.connect();
      const signer = await ensureArcExternalSigner(false);
      const updated = await linkExternalWallet(signer);
      const address = ethers.getAddress(updated.activeWallet || (await signer.getAddress()));
      setAccount(address);
      setChainId(ARC_CHAIN_ID);
      setWalletMode("EXTERNAL_REOWN");
      return address;
    } finally {
      setIsConnecting(false);
    }
  };

  const switchToCircleWallet = () => {
    if (!user?.circleWallet?.address) throw new Error("Tài khoản chưa có ví Circle trên Arc Testnet");
    setAccount(user.circleWallet.address);
    setWalletMode("CIRCLE_EMBEDDED");
    setChainId(ARC_CHAIN_ID);
  };

  const waitForCircleTransaction = async (challengeId: string): Promise<string> => {
    if (!token || !circleCredentials) throw new Error("Phiên Circle không còn hoạt động");
    let transactionId: string | undefined;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const data = await readJson(
        await fetch(`/api/circle/challenges/${encodeURIComponent(challengeId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ userToken: circleCredentials.userToken }),
        })
      );
      if (data.challenge?.status === "FAILED" || data.challenge?.status === "EXPIRED") {
        throw new Error(data.challenge.errorMessage || `Circle challenge ${data.challenge.status}`);
      }
      transactionId = data.challenge?.correlationIds?.[0];
      if (transactionId) break;
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    if (!transactionId) throw new Error("Circle challenge completed without a transaction ID");

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const data = await readJson(
        await fetch(`/api/circle/transactions/${encodeURIComponent(transactionId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ userToken: circleCredentials.userToken }),
        })
      );
      const transaction = data.transaction;
      if (["FAILED", "DENIED", "CANCELLED"].includes(transaction?.state)) {
        throw new Error(transaction.errorReason || `Circle transaction ${transaction.state}`);
      }
      if (transaction?.state === "COMPLETE" && transaction.txHash) return transaction.txHash;
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    throw new Error("Hết thời gian chờ Circle transaction đạt finality");
  };

  const sendCircleTransaction = async (
    contractAddress: string,
    callData: string,
    intent: CircleIntent
  ): Promise<{ txHash: string }> => {
    if (!token || !circleCredentials || !user?.circleWallet) {
      throw new Error("Vui lòng xác thực lại Circle trước khi ký giao dịch");
    }
    const expectedOwner = user.id;
    const expectedAccount = account;
    const operationId = `circle:${intent.type.toLowerCase()}:${crypto.randomUUID()}`;
    const challenge = await readJson(
      await fetch("/api/circle/transactions/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userToken: circleCredentials.userToken,
          walletId: user.circleWallet.walletId,
          contractAddress,
          callData,
          intent,
          operationId,
        }),
      })
    );
    if (walletOwnerRef.current !== expectedOwner || selectedAccountRef.current !== expectedAccount) throw new Error("Tài khoản đã thay đổi; không ký challenge của phiên cũ");
    await executeCircleChallenge(challenge.challengeId);
    return { txHash: await waitForCircleTransaction(challenge.challengeId) };
  };

  const sendHubCall = async (
    contractInterface: ethers.Interface,
    functionName: string,
    args: unknown[],
    intent: CircleIntent
  ): Promise<{ txHash: string }> => {
    if (walletMode === "CIRCLE_EMBEDDED") {
      return sendCircleTransaction(
        hubAddress,
        contractInterface.encodeFunctionData(functionName, args),
        intent
      );
    }
    const signer = await ensureArcExternalSigner();
    const contract = new ethers.Contract(hubAddress, contractInterface.fragments, signer);
    const transaction = await contract[functionName](...args);
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) throw new Error("Giao dịch Arc đã bị revert");
    return { txHash: transaction.hash as string };
  };

  const createCampaignOnchain = async (campaign: CampaignDraftForChain) => {
    if (!account) throw new Error("Ví người bán chưa được kết nối");
    if (account.toLowerCase() !== campaign.sellerPayoutWallet.toLowerCase()) {
      throw new Error("Ví ký phải trùng với ví nhận tiền đã đăng ký của người bán");
    }
    const contractInterface = new ethers.Interface([
      "function createCampaign((address sellerPayoutWallet, uint8 metric, uint256 maxPerAccount, uint256 inventoryLimit, uint256 durationSeconds, uint256 deliverySlaSeconds, bool earlyRebateEnabled, uint32 earlySlotsCount, uint256 earlyRebateAmount, uint16 earlyRebateBps, uint16 platformFeeBps, bytes32 termsHash) terms, (uint256 threshold, uint256 price)[] tiers) returns (uint256)",
    ]);
    const terms = {
      sellerPayoutWallet: campaign.sellerPayoutWallet,
      metric: campaign.metric === "BUYER_COUNT" ? 0 : 1,
      maxPerAccount: BigInt(campaign.maxPerAccount),
      inventoryLimit: BigInt(campaign.inventoryLimit),
      durationSeconds: BigInt(campaign.durationSeconds),
      deliverySlaSeconds: BigInt(campaign.deliverySlaSeconds),
      earlyRebateEnabled: campaign.earlyRebateEnabled,
      earlySlotsCount: campaign.earlySlotsCount,
      earlyRebateAmount: BigInt(campaign.earlyRebateAmount),
      earlyRebateBps: campaign.earlyRebateBps,
      platformFeeBps: campaign.platformFeeBps,
      termsHash: campaign.termsHash,
    };
    const tiers = campaign.tiers.map((tier) => ({
      threshold: BigInt(tier.threshold),
      price: BigInt(tier.price),
    }));
    return sendHubCall(contractInterface, "createCampaign", [terms, tiers], {
      type: "CREATE_CAMPAIGN",
      draftId: campaign.id,
    });
  };

  const recordDeliveryOnchain = (
    campaignId: number,
    orderId: number,
    localOrderId: string,
    proofHash: string
  ) => {
    const contractInterface = new ethers.Interface([
      "function recordDelivery(uint256 campaignId,uint256 orderId,bytes32 proofHash)",
    ]);
    return sendHubCall(contractInterface, "recordDelivery", [campaignId, orderId, proofHash], {
      type: "RECORD_DELIVERY",
      orderId: localOrderId,
      proofHash,
    });
  };

  const commitToBuyOnchain: Web3ContextType["commitToBuyOnchain"] = async (params) => {
    if (!account || !ethers.isAddress(hubAddress) || !ethers.isAddress(usdcAddress)) throw new Error("Chưa có ví hoặc cấu hình hợp đồng Arc hợp lệ");
    if (!Number.isSafeInteger(params.quantity) || params.quantity <= 0) throw new Error("Số lượng mua không hợp lệ");
    if (params.authDeadline <= Math.floor(Date.now() / 1000) + 30) throw new Error("Chứng thực mua sắp hết hạn; lấy chứng thực mới");
    const totalGross = BigInt(params.lockedUnitPriceUSDC) * BigInt(params.quantity);
    const assertCurrentIdentity = () => {
      if (!user || walletOwnerRef.current !== user.id || selectedAccountRef.current?.toLowerCase() !== account.toLowerCase()) {
        throw new Error("Tài khoản đã thay đổi trong lúc checkout. Không gửi giao dịch của phiên cũ.");
      }
    };
    assertPurchaseBudget(await purchaseBudget(account, totalGross));
    assertCurrentIdentity();
    const usdc = new ethers.Interface([
      "function approve(address spender, uint256 amount) external returns (bool)",
    ]);
    const hub = new ethers.Interface([
      "function commitToBuy(uint256 campaignId, bytes32 campaignIdentity, uint256 quantity, bool requireEarlySlot, uint256 maxAuthQuantity, uint256 authDeadline, bytes authSignature) external returns (uint256)",
    ]);
    const args = [params.campaignId, params.campaignIdentity, params.quantity, params.requireEarlySlot,
      params.maxAuthQuantity, params.authDeadline, params.authSignature];
    const commitData = hub.encodeFunctionData("commitToBuy", args);
    const approveData = usdc.encodeFunctionData("approve", [hubAddress, totalGross]);
    const verify = async (txHash: string) => {
      const proof = await verifyArcCommitment(txHash, { hubAddress, buyer: account, campaignId: params.campaignId,
        campaignIdentity: params.campaignIdentity, quantity: params.quantity, maxGross: totalGross });
      await refreshBalance();
      return { txHash, orderId: proof.orderId };
    };

    if (walletMode === "CIRCLE_EMBEDDED") {
      params.onStep?.("APPROVE");
      await assertCallBudget(account, usdcAddress, approveData, totalGross);
      assertCurrentIdentity();
      await sendCircleTransaction(
        usdcAddress,
        approveData,
        { type: "USDC_APPROVE", amount: totalGross.toString() }
      );
      await assertCallBudget(account, hubAddress, commitData, totalGross);
      assertCurrentIdentity();
      params.onStep?.("BROADCAST");
      const result = await sendCircleTransaction(
        hubAddress,
        commitData,
        { type: "COMMIT_BUY", campaignId: params.campaignId.toString(), quantity: params.quantity.toString() }
      );
      params.onBroadcast?.(result.txHash);
      return verify(result.txHash);
    }

    const signer = await ensureArcExternalSigner();
    const usdcContract = new ethers.Contract(
      usdcAddress,
      [
        "function allowance(address,address) view returns (uint256)",
        "function approve(address,uint256) returns (bool)",
      ],
      signer
    );
    const readUsdc = new ethers.Contract(usdcAddress, usdcContract.interface.fragments, getReadProvider());
    params.onStep?.("APPROVE");
    // Replace oversized legacy allowances too: consent is capped to this purchase.
    if ((await readUsdc.allowance(account, hubAddress)) !== totalGross) {
      await assertCallBudget(account, usdcAddress, approveData, totalGross);
      assertCurrentIdentity();
      const approvalReceipt = await (await usdcContract.approve(hubAddress, totalGross)).wait();
      if (!approvalReceipt || approvalReceipt.status !== 1) throw new Error("Approve USDC chưa thành công");
    }
    await assertCallBudget(account, hubAddress, commitData, totalGross);
    assertCurrentIdentity();
    params.onStep?.("BROADCAST");
    const commitSigner = await ensureArcExternalSigner();
    assertCurrentIdentity();
    const hubContract = new ethers.Contract(hubAddress, hub.fragments, commitSigner);
    const transaction = await hubContract.commitToBuy(
      params.campaignId,
      params.campaignIdentity,
      params.quantity,
      params.requireEarlySlot,
      params.maxAuthQuantity,
      params.authDeadline,
      params.authSignature
    );
    params.onBroadcast?.(transaction.hash);
    return verify(transaction.hash);
  };

  const runOrderAction = async (
    functionName: "claimBuyerFunds" | "claimSellerProceeds" | "confirmReceipt" | "openDispute",
    args: unknown[],
    intent: CircleIntent
  ) => {
    const signatures = {
      claimBuyerFunds: "function claimBuyerFunds(uint256,uint256[]) returns (uint256)",
      claimSellerProceeds: "function claimSellerProceeds(uint256,uint256[]) returns (uint256)",
      confirmReceipt: "function confirmReceipt(uint256,uint256)",
      openDispute: "function openDispute(uint256,uint256,bytes32)",
    };
    const contractInterface = new ethers.Interface([signatures[functionName]]);
    if (walletMode === "CIRCLE_EMBEDDED") {
      return sendCircleTransaction(
        hubAddress,
        contractInterface.encodeFunctionData(functionName, args),
        intent
      );
    }
    const signer = await ensureArcExternalSigner();
    const contract = new ethers.Contract(hubAddress, contractInterface.fragments, signer);
    const transaction = await contract[functionName](...args);
    await transaction.wait();
    return { txHash: transaction.hash as string };
  };

  const claimBuyerFundsOnchain = (campaignId: number, orderIds: number[]) =>
    runOrderAction("claimBuyerFunds", [campaignId, orderIds], {
      type: "CLAIM_BUYER",
      campaignId: campaignId.toString(),
      orderIds: orderIds.map(String),
    });

  const claimSellerProceedsOnchain = (campaignId: number, orderIds: number[]) =>
    runOrderAction("claimSellerProceeds", [campaignId, orderIds], {
      type: "CLAIM_SELLER",
      campaignId: campaignId.toString(),
      orderIds: orderIds.map(String),
    });

  const confirmReceiptOnchain = (campaignId: number, orderId: number) =>
    runOrderAction("confirmReceipt", [campaignId, orderId], {
      type: "CONFIRM_RECEIPT",
      campaignId: campaignId.toString(),
      orderId: orderId.toString(),
    });

  const openDisputeOnchain = (campaignId: number, orderId: number, reason: string) =>
    runOrderAction(
      "openDispute",
      [campaignId, orderId, ethers.keccak256(ethers.toUtf8Bytes(reason))],
      { type: "OPEN_DISPUTE", campaignId: campaignId.toString(), orderId: orderId.toString() }
    );

  const claimDeliveryBreachOnchain = (campaignId: number, orderId: number) => {
    const contractInterface = new ethers.Interface([
      "function claimDeliveryBreach(uint256 campaignId,uint256 orderId)",
    ]);
    return sendHubCall(contractInterface, "claimDeliveryBreach", [campaignId, orderId], {
      type: "CLAIM_DELIVERY_BREACH",
      campaignId: campaignId.toString(),
      orderId: orderId.toString(),
    });
  };

  const settleUndisputedOrderOnchain = (campaignId: number, orderId: number) => {
    const contractInterface = new ethers.Interface([
      "function settleUndisputedOrder(uint256 campaignId,uint256 orderId)",
    ]);
    return sendHubCall(contractInterface, "settleUndisputedOrder", [campaignId, orderId], {
      type: "SETTLE_UNDISPUTED",
      campaignId: campaignId.toString(),
      orderId: orderId.toString(),
    });
  };

  const resolveDisputeOnchain = (
    campaignId: number,
    orderId: number,
    buyerShare: string,
    sellerShare: string
  ) => {
    const contractInterface = new ethers.Interface([
      "function resolveDispute(uint256 campaignId,uint256 orderId,uint256 buyerShare,uint256 sellerShare)",
    ]);
    return sendHubCall(
      contractInterface,
      "resolveDispute",
      [campaignId, orderId, BigInt(buyerShare), BigInt(sellerShare)],
      {
        type: "RESOLVE_DISPUTE",
        campaignId: campaignId.toString(),
        orderId: orderId.toString(),
        buyerShare,
        sellerShare,
      }
    );
  };

  return (
    <Web3Context.Provider
      value={{
        account,
        chainId,
        usdcBalance,
        balanceError,
        balanceLoading,
        isConnecting,
        hubAddress,
        usdcAddress,
        walletMode,
        externalWalletConfigured: external.configured,
        externalSignerReady,
        reconnectExternalWallet,
        loginWithExternalWallet,
        connectExternalWallet,
        getExternalSigner,
        switchToCircleWallet,
        createCampaignOnchain,
        recordDeliveryOnchain,
        commitToBuyOnchain,
        claimBuyerFundsOnchain,
        claimSellerProceedsOnchain,
        confirmReceiptOnchain,
        openDisputeOnchain,
        claimDeliveryBreachOnchain,
        settleUndisputedOrderOnchain,
        resolveDisputeOnchain,
        refreshBalance,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => useContext(Web3Context);
