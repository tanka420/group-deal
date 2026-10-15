import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { useAuth } from "./AuthContext";
import { useExternalWallet } from "./ExternalWalletContext";
import { getArcReadProvider, readArcBalance } from "../services/arcRpc";
import { PurchaseParams, purchaseBudget, assertPurchaseBudget, assertCallBudget, verifyArcCommitment, assertReviewedCallBudget, assertCurrentCallBudget, type CallBudget } from "../services/checkout";
import { HUB_ABI } from "../contracts/hubAbi";
import {CircleFeeReviewModal} from "../components/CircleFeeReviewModal";
import {assertCircleFeeBudget,assertCurrentCircleFeeBalance,CircleFeeReviewError,type CircleIntent,type CircleFeeBudget,type CircleFeeRequest} from "../services/circleFeeReview";
import {readCircleOperationStatus,circleRecoveryMessage,CircleRecoveryError,type RecoveryOperation,type CircleRecoveryStatus} from '../services/circleOperationRecovery';
import {UiError,uiMessage} from '../utils/uiMessage';
import {ExternalFeeReviewModal,type ExternalFeeRequest} from '../components/ExternalFeeReviewModal';
import {operationRequest,requireMatchingOperation,localBroadcast,type TransactionOperation} from '../services/transactionOperations';

type WalletMode = "EXTERNAL_REOWN" | "CIRCLE_EMBEDDED" | "DISCONNECTED";

export interface CampaignDraftForChain {
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
  createCampaignOnchain: (campaign: CampaignDraftForChain, onBroadcast?: (hash:string)=>void|Promise<void>) => Promise<{ txHash: string }>;
  broadcastPreparedOperation: (operation: {id:string;action:string;resourceId:string;chainId:number;hubAddress:string;principal:string;calldata:string;purchaseQuote?:{lockedUnitPrice:string}},onBroadcast:(hash:string)=>void|Promise<void>) => Promise<{txHash:string}>;
  recoverCircleOperation: (operation:RecoveryOperation)=>Promise<CircleRecoveryStatus>;
  continueCircleOperation: (operation:TransactionOperation,onBroadcast:(hash:string)=>void|Promise<void>)=>Promise<{txHash:string}>;
  preflightPreparedOperation: (operation:TransactionOperation)=>Promise<void>;
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
    user,realm,
    token,
    circleCredentials,
    executeCircleChallenge,
    loginWithWallet,getSessionEpoch,
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
  const [circleFeeRequest,setCircleFeeRequest]=useState<CircleFeeRequest|null>(null);
  const circleFeePending=useRef<{request:CircleFeeRequest;resolve:(budget:CircleFeeBudget)=>void;reject:(error:Error)=>void}|null>(null);
  const circleTransactionFlight=useRef(false);
  const [externalFeeRequest,setExternalFeeRequest]=useState<ExternalFeeRequest|null>(null);
  const externalFeePending=useRef<{request:ExternalFeeRequest;resolve:(budget:CallBudget)=>void;reject:(error:Error)=>void}|null>(null);
  const externalTransactionFlight=useRef(false);
  const externalIdentityRef=useRef(external);externalIdentityRef.current=external;
  const externalStopped=()=>new UiError(uiMessage('Đã dừng trước khi mở ví. Giữ yêu cầu để kiểm tra lại.','Stopped before opening the wallet. Keep the request for review.'));
  const stopExternalFeeReview=()=>{const pending=externalFeePending.current;externalFeePending.current=null;setExternalFeeRequest(null);pending?.reject(externalStopped());};
  useEffect(()=>{const timer=window.setInterval(()=>{try{externalFeePending.current?.request.assertCurrent();}catch{stopExternalFeeReview();}},250);return()=>{window.clearInterval(timer);const pending=externalFeePending.current;externalFeePending.current=null;pending?.reject(externalStopped());};},[]);
  useEffect(()=>{if(externalFeePending.current)try{externalFeePending.current.request.assertCurrent();}catch{stopExternalFeeReview();}},[user?.id,user?.activeWallet,token,walletMode,external.address,external.connected]);
  const approveExternalFee=(budget:CallBudget)=>{const pending=externalFeePending.current;if(!pending)return;try{pending.request.assertCurrent();assertReviewedCallBudget(budget,pending.request);}catch{stopExternalFeeReview();return;}externalFeePending.current=null;setExternalFeeRequest(null);pending.resolve(budget);};
  const circleIdentityRef=useRef({walletId:user?.circleWallet?.walletId,userToken:circleCredentials?.userToken,walletMode});
  circleIdentityRef.current={walletId:user?.circleWallet?.walletId,userToken:circleCredentials?.userToken,walletMode};
  const stopCircleFeeReview=()=>{const pending=circleFeePending.current;circleFeePending.current=null;setCircleFeeRequest(null);pending?.reject(new CircleFeeReviewError('CIRCLE_FEE_CANCELLED'));};
  useEffect(()=>{const timer=window.setInterval(()=>{try{circleFeePending.current?.request.assertCurrent();}catch{stopCircleFeeReview();}},250);return()=>{window.clearInterval(timer);const pending=circleFeePending.current;circleFeePending.current=null;pending?.reject(new CircleFeeReviewError('CIRCLE_FEE_CANCELLED'));};},[]);
  useEffect(()=>{if(circleFeePending.current)try{circleFeePending.current.request.assertCurrent();}catch{stopCircleFeeReview();}},[user?.id,user?.activeWallet,user?.circleWallet?.walletId,token,circleCredentials?.userToken,walletMode]);
  const reviewCircleFee=(request:CircleFeeRequest)=>new Promise<CircleFeeBudget>((resolve,reject)=>{if(circleFeePending.current){reject(new CircleFeeReviewError('CIRCLE_FEE_BUSY'));return;}circleFeePending.current={request,resolve,reject};setCircleFeeRequest(request);});
  const approveCircleFee=(budget:CircleFeeBudget)=>{const pending=circleFeePending.current;if(!pending)return;try{pending.request.assertCurrent();assertCircleFeeBudget(budget,pending.request);}catch{stopCircleFeeReview();return;}circleFeePending.current=null;setCircleFeeRequest(null);pending.resolve(budget);};
  const walletOwnerRef = useRef<string | null>(null);
  const selectedAccountRef = useRef(account);
  selectedAccountRef.current = account;
  const authScopeRef=useRef({userId:user?.id,token,activeWallet:user?.activeWallet});
  authScopeRef.current={userId:user?.id,token,activeWallet:user?.activeWallet};
  const captureWalletScope=()=>{
    const expected={...authScopeRef.current},epoch=getSessionEpoch?.();
    const assertCurrent=()=>{const now=authScopeRef.current;if((epoch!==undefined&&getSessionEpoch()!==epoch)||now.userId!==expected.userId||now.token!==expected.token||now.activeWallet?.toLowerCase()!==expected.activeWallet?.toLowerCase())throw new Error("Phiên đăng nhập hoặc ví hoạt động đã thay đổi");};
    return {epoch,assertCurrent};
  };

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
    if ((ownerChanged || walletMode === "DISCONNECTED" || user.activeWallet?.toLowerCase()!==selectedAccountRef.current?.toLowerCase()) && user.activeWallet) {
      setAccount(ethers.getAddress(user.activeWallet));
      const circleSelected = realm!=='ADMIN' && user.circleWallet?.address.toLowerCase() === user.activeWallet.toLowerCase();
      setWalletMode(circleSelected ? "CIRCLE_EMBEDDED" : "EXTERNAL_REOWN");
      setChainId(circleSelected ? ARC_CHAIN_ID : null);
    }
  }, [user, walletMode,realm]);

  useEffect(() => {
    if (walletMode === "EXTERNAL_REOWN" && external.address) {
      // Wallet account changes never silently change the authenticated identity.
      setChainId(Number(external.chainId || 0));
    }
  }, [external.address, external.chainId, walletMode]);

  const getReadProvider = getArcReadProvider;
  const assertExternalForeground=()=>{if(document.visibilityState!=='visible')throw new UiError(uiMessage('Đưa tab GroupDeal ra trước để mở ví. Giữ intent hiện tại và kiểm tra lịch sử ví nếu đã gửi giao dịch.','Bring the GroupDeal tab to the foreground to open the wallet. Keep this intent and check wallet history if a transaction was sent.'));};

  const ensureArcExternalSigner = async (requireIdentity = true): Promise<ethers.Signer> => {
    const scope=captureWalletScope();
    if (!external.provider) await external.connect();
    scope.assertCurrent();
    const initialSigner = await external.getSigner();
    scope.assertCurrent();
    const browserProvider = initialSigner.provider as ethers.BrowserProvider | null;
    if (!browserProvider || typeof browserProvider.send !== "function") {
      throw new Error("Chưa kết nối ví EVM qua Reown AppKit");
    }
    const currentChain=await browserProvider.send('eth_chainId',[]);
    scope.assertCurrent();
    if(typeof currentChain!=='string'||!/^0x[0-9a-f]+$/i.test(currentChain))throw new Error('Chưa xác minh được mạng của ví ngoài');
    if(BigInt(currentChain)!==BigInt(ARC_CHAIN_ID)) {
    try {
      await browserProvider.send("wallet_switchEthereumChain", [{ chainId: ARC_CHAIN_HEX }]);
    } catch (error: any) {
      if (error?.code !== 4902) throw error;
      scope.assertCurrent();
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
    }
    scope.assertCurrent();
    const signer = await external.getSigner();
    scope.assertCurrent();
    if (requireIdentity && (!user?.activeWallet ||
      (await signer.getAddress()).toLowerCase() !== user.activeWallet.toLowerCase())) {
      throw new Error("Ví đang kết nối khác ví tài khoản. Chọn đúng ví hoặc đăng nhập lại bằng ví mới.");
    }
    const network = await signer.provider?.getNetwork();
    scope.assertCurrent();
    if (!network || Number(network.chainId) !== ARC_CHAIN_ID) {
      throw new Error("Ví ngoài chưa chuyển sang Arc Testnet (chain ID 5042002)");
    }
    return signer;
  };

  const getExternalSigner = () => ensureArcExternalSigner();
  const preflightPreparedOperation:Web3ContextType['preflightPreparedOperation']=async(operation)=>{
    // Keep Circle's existing challenge/credential policy; this preflight is for external wallets.
    if(walletMode!=='EXTERNAL_REOWN')return;
    const scope=captureWalletScope();scope.assertCurrent();
    if(!user||operation.phase!=='PREPARED'||operation.txHash||localBroadcast(user.id,operation.id)||operation.chainId!==ARC_CHAIN_ID||operation.hubAddress.toLowerCase()!==hubAddress.toLowerCase()||operation.principal.toLowerCase()!==account?.toLowerCase())throw externalStopped();
    assertExternalForeground();await ensureArcExternalSigner();scope.assertCurrent();assertExternalForeground();
  };
  const reconnectExternalWallet = async () => { await ensureArcExternalSigner(); };
  const externalSignerReady = Boolean(external.connected && external.provider && account &&
    external.address?.toLowerCase() === account.toLowerCase());

  const loginWithExternalWallet = async (): Promise<string> => {
    const scope=captureWalletScope();
    setIsConnecting(true);
    try {
      await external.connect();
      scope.assertCurrent();
      const signer = await ensureArcExternalSigner(false);
      scope.assertCurrent();
      const authenticatedUser = await loginWithWallet(signer,scope.epoch);
      if(scope.epoch!==undefined&&getSessionEpoch()!==scope.epoch+1)throw new Error("Phiên đăng nhập đã thay đổi");
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
    const scope=captureWalletScope();
    setIsConnecting(true);
    try {
      await external.connect();
      scope.assertCurrent();
      const signer = await ensureArcExternalSigner(false);
      scope.assertCurrent();
      const updated = await linkExternalWallet(signer,scope.epoch);
      if(scope.epoch!==undefined&&getSessionEpoch()!==scope.epoch)throw new Error("Phiên đăng nhập đã thay đổi");
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
    if(user.activeWallet?.toLowerCase()!==user.circleWallet.address.toLowerCase())throw new Error("WALLET_SELECTION_PROOF_REQUIRED");
    setAccount(user.circleWallet.address);
    setWalletMode("CIRCLE_EMBEDDED");
    setChainId(ARC_CHAIN_ID);
  };

  const waitForCircleTransaction = async (challengeId: string,onBroadcast:((hash:string)=>void|Promise<void>)|undefined,assertCurrent:()=>void): Promise<string> => {
    assertCurrent();
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
      assertCurrent();
      if (data.challenge?.status === "FAILED" || data.challenge?.status === "EXPIRED") {
        throw new Error(data.challenge.errorMessage || `Circle challenge ${data.challenge.status}`);
      }
      transactionId = data.challenge?.correlationIds?.[0];
      if (transactionId) break;
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    if (!transactionId) throw new Error("Circle challenge completed without a transaction ID");

    let reportedHash:string|undefined;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const data = await readJson(
        await fetch(`/api/circle/transactions/${encodeURIComponent(transactionId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ userToken: circleCredentials.userToken, challengeId }),
        })
      );
      assertCurrent();
      const transaction = data.transaction;
      if(transaction?.txHash&&transaction.txHash!==reportedHash){reportedHash=transaction.txHash;await onBroadcast?.(transaction.txHash);assertCurrent();}
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
    intent: CircleIntent,
    stableOperationId?:string,
    onBroadcast?:(hash:string)=>void|Promise<void>,
    grossUsdc=0n,
    existingChallengeId?:string
  ): Promise<{ txHash: string }> => {
    if (!token || !circleCredentials || !user?.circleWallet) {
      throw new Error("Vui lòng xác thực lại Circle trước khi ký giao dịch");
    }
    if(circleTransactionFlight.current)throw new CircleFeeReviewError('CIRCLE_FEE_BUSY');
    circleTransactionFlight.current=true;
    try {
    const scope=captureWalletScope();scope.assertCurrent();
    const expectedCircle={...circleIdentityRef.current};
    const assertCurrent=()=>{scope.assertCurrent();const current=circleIdentityRef.current;if(current.walletId!==expectedCircle.walletId||current.userToken!==expectedCircle.userToken||current.walletMode!=='CIRCLE_EMBEDDED'||walletOwnerRef.current!==user.id||selectedAccountRef.current?.toLowerCase()!==account?.toLowerCase())throw new CircleFeeReviewError('CIRCLE_FEE_CANCELLED');};
    assertCurrent();
    const expectedOwner = user.id;
    const expectedAccount = account;
    const operationId = stableOperationId||`circle:${intent.type.toLowerCase()}:${crypto.randomUUID()}`;
    // Continuation uses the verified existing challenge without requesting another one.
    const challenge = existingChallengeId ? {challengeId:existingChallengeId} : await readJson(
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
    scope.assertCurrent();
    if (walletOwnerRef.current !== expectedOwner || selectedAccountRef.current !== expectedAccount) throw new Error("Tài khoản đã thay đổi; không ký challenge của phiên cũ");
    const existing=await readJson(await fetch(`/api/circle/challenges/${encodeURIComponent(challenge.challengeId)}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({userToken:circleCredentials.userToken})}));
    scope.assertCurrent();
    assertCurrent();
    if(!existing.challenge?.correlationIds?.[0]){
      if(existing.challenge?.id!==challenge.challengeId||!(existingChallengeId?['PENDING']:['PENDING','IN_PROGRESS']).includes(existing.challenge?.status)||!account)throw new CircleFeeReviewError('CIRCLE_FEE_UNAVAILABLE');
      const request:CircleFeeRequest={id:operationId,account,walletId:user.circleWallet.walletId,token,userToken:circleCredentials.userToken,contractAddress,callData,intent,grossUsdc:intent.type==='USDC_APPROVE'?BigInt(intent.amount):grossUsdc,assertCurrent};
      const budget=await reviewCircleFee(request);
      assertCurrent();assertCircleFeeBudget(budget,request);
      // Wait for the approved dialog to close; frame callbacks pause in background tabs.
      await new Promise<void>((resolve,reject)=>{
        const deadline=Date.now()+3_000;
        const check=()=>{try{
          assertCurrent();
          if(!document.querySelector<HTMLDialogElement>('dialog[aria-labelledby="circle-fee-title"]')?.open){resolve();return;}
          if(Date.now()>=deadline){reject(new CircleFeeReviewError('CIRCLE_FEE_UNAVAILABLE'));return;}
          window.setTimeout(check,25);
        }catch(error){reject(error);}};
        window.setTimeout(check,0);
      });
      assertCurrent();assertCircleFeeBudget(budget,request);
      const latest=await readJson(await fetch('/api/circle/challenges/'+encodeURIComponent(challenge.challengeId),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({userToken:circleCredentials.userToken})}));
      assertCurrent();
      if(!latest.challenge?.correlationIds?.[0]){if(latest.challenge?.id!==challenge.challengeId||!(existingChallengeId?['PENDING']:['PENDING','IN_PROGRESS']).includes(latest.challenge?.status))throw new CircleFeeReviewError('CIRCLE_FEE_UNAVAILABLE');await assertCurrentCircleFeeBalance(budget,request,assertCurrent);assertCurrent();await executeCircleChallenge(challenge.challengeId);}
    }
    assertCurrent();
    return { txHash: await waitForCircleTransaction(challenge.challengeId,onBroadcast,assertCurrent) };
    } finally {circleTransactionFlight.current=false;}
  };

  const sendReviewedExternalCall=async(signer:ethers.Signer,to:string,data:string,intent:CircleIntent,grossUsdc:bigint,send:()=>Promise<ethers.ContractTransactionResponse>)=>{
    if(externalTransactionFlight.current)throw new UiError(uiMessage('Một yêu cầu ví ngoài đang được xử lý. Chờ kết quả trước khi ký yêu cầu khác.','An external wallet request is in progress. Wait for its outcome before signing another.'));
    externalTransactionFlight.current=true;
    try{
      const scope=captureWalletScope(),principal=account,owner=user?.id,expectedExternal=externalIdentityRef.current;
      const assertCurrent=()=>{scope.assertCurrent();const active=externalIdentityRef.current;if(!principal||!owner||walletOwnerRef.current!==owner||selectedAccountRef.current?.toLowerCase()!==principal.toLowerCase()||circleIdentityRef.current.walletMode!=='EXTERNAL_REOWN'||active.address&&active.address.toLowerCase()!==principal.toLowerCase()||expectedExternal.connected&&!active.connected)throw externalStopped();};
      const assertWallet=async()=>{assertCurrent();const provider=signer.provider as ethers.BrowserProvider|null;if(!provider||typeof provider.send!=='function')throw externalStopped();const [accounts,chain]=await Promise.all([provider.send('eth_accounts',[]),provider.send('eth_chainId',[])]);assertCurrent();if(!Array.isArray(accounts)||typeof accounts[0]!=='string'||accounts[0].toLowerCase()!==principal!.toLowerCase()||BigInt(chain)!==BigInt(ARC_CHAIN_ID))throw externalStopped();};
      assertCurrent();assertExternalForeground();await assertWallet();
      const request:ExternalFeeRequest={id:crypto.randomUUID(),account:principal!,to,data,intent,grossUsdc,assertCurrent};
      const budget=await new Promise<CallBudget>((resolve,reject)=>{externalFeePending.current={request,resolve,reject};setExternalFeeRequest(request);});
      await assertCurrentCallBudget(budget,request,assertCurrent);await assertWallet();assertCurrent();assertReviewedCallBudget(budget,request);
      assertExternalForeground();
      return await send();
    }finally{externalTransactionFlight.current=false;}
  };

  const sendHubCall = async (
    contractInterface: ethers.Interface,
    functionName: string,
    args: unknown[],
    intent: CircleIntent,
    onBroadcast?: (hash:string)=>void|Promise<void>,
    stableOperationId?:string,
    existingCircleChallengeId?:string
  ): Promise<{ txHash: string }> => {
    if (walletMode === "CIRCLE_EMBEDDED") {
      const result=await sendCircleTransaction(
        hubAddress,
        contractInterface.encodeFunctionData(functionName, args),
        intent,stableOperationId,onBroadcast,0n,existingCircleChallengeId
      );
      return result;
    }
    const signer = await ensureArcExternalSigner();
    const contract = new ethers.Contract(hubAddress, contractInterface.fragments, signer);
    const transaction = await sendReviewedExternalCall(signer,hubAddress,contractInterface.encodeFunctionData(functionName,args),intent,0n,()=>contract[functionName](...args));
    await onBroadcast?.(transaction.hash);
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) throw new Error("Giao dịch Arc đã bị revert");
    return { txHash: transaction.hash as string };
  };

  const createCampaignOnchain = async (campaign: CampaignDraftForChain, onBroadcast?: (hash:string)=>void|Promise<void>) => {
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
    }, onBroadcast);
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

  const broadcastPreparedOperation = (operation:Parameters<Web3ContextType['broadcastPreparedOperation']>[0],onBroadcast:Parameters<Web3ContextType['broadcastPreparedOperation']>[1],existingCircleChallengeId?:string):Promise<{txHash:string}> => {
    if(existingCircleChallengeId&&(walletMode!=='CIRCLE_EMBEDDED'||operation.action==='BUY'))throw new CircleRecoveryError();
    if(operation.chainId!==ARC_CHAIN_ID||operation.hubAddress.toLowerCase()!==hubAddress.toLowerCase()||operation.principal.toLowerCase()!==account?.toLowerCase())throw new Error("Kết nối đúng ví principal và deployment của intent trước khi ký");
    const iface=new ethers.Interface(HUB_ABI);
    const call=iface.parseTransaction({data:operation.calldata});
    if(!call)throw new Error("Intent chưa có calldata hợp lệ");
    if(operation.action==="BUY"&&call.name==="commitToBuy"){
      if(!operation.purchaseQuote)throw new Error("Thiếu quote mua đã kiểm tra");
      return commitToBuyOnchain({campaignId:Number(call.args.campaignId),campaignIdentity:String(call.args.campaignIdentity),quantity:Number(call.args.quantity),requireEarlySlot:call.args.requireEarlySlot,maxAuthQuantity:Number(call.args.maxAuthQuantity),authDeadline:Number(call.args.authDeadline),authSignature:String(call.args.authSignature),lockedUnitPriceUSDC:operation.purchaseQuote.lockedUnitPrice,operationId:operation.id,onBroadcast});
    }
    let intent:CircleIntent;
    if(operation.action==="PUBLISH"&&call.name==="createCampaign")intent={type:"CREATE_CAMPAIGN",draftId:operation.resourceId};
    else if(operation.action==="DELIVER"&&call.name==="recordDelivery")intent={type:"RECORD_DELIVERY",orderId:operation.resourceId,proofHash:String(call.args[2])};
    else if(operation.action==="BUYER_CLAIM"&&call.name==="claimBuyerFunds")intent={type:"CLAIM_BUYER",campaignId:String(call.args[0]),orderIds:call.args[1].map(String)};
    else if(operation.action==="SELLER_CLAIM"&&call.name==="claimSellerProceeds")intent={type:"CLAIM_SELLER",campaignId:String(call.args[0]),orderIds:call.args[1].map(String)};
    else if(operation.action==="CONFIRM"&&call.name==="confirmReceipt")intent={type:"CONFIRM_RECEIPT",campaignId:String(call.args[0]),orderId:String(call.args[1])};
    else if(operation.action==="DISPUTE"&&call.name==="openDispute")intent={type:"OPEN_DISPUTE",campaignId:String(call.args[0]),orderId:String(call.args[1])};
    else if(operation.action==="BREACH"&&call.name==="claimDeliveryBreach")intent={type:"CLAIM_DELIVERY_BREACH",campaignId:String(call.args[0]),orderId:String(call.args[1])};
    else if(operation.action==="SETTLE"&&call.name==="settleUndisputedOrder")intent={type:"SETTLE_UNDISPUTED",campaignId:String(call.args[0]),orderId:String(call.args[1])};
    else if(operation.action==="RESOLVE"&&call.name==="resolveDispute")intent={type:"RESOLVE_DISPUTE",campaignId:String(call.args[0]),orderId:String(call.args[1]),buyerShare:String(call.args[2]),sellerShare:String(call.args[3])};
    else throw new Error("Thao tác chưa hỗ trợ ký từ lịch sử giao dịch");
    if(iface.encodeFunctionData(call.name,Array.from(call.args)).toLowerCase()!==operation.calldata.toLowerCase())throw new Error("Intent calldata không canonical");
    // Contract argument resolution mutates nested arrays; decoded ethers Results are read-only.
    return sendHubCall(iface,call.name,call.args.toArray(true),intent,onBroadcast,`circle:${operation.id}`,existingCircleChallengeId);
  };

  const readOwnedCircleOperation=async(operation:RecoveryOperation,allowMissingReceipt=false)=>{
    if(!user||!token||!circleCredentials||walletMode!=='CIRCLE_EMBEDDED'||operation.principal.toLowerCase()!==account?.toLowerCase()||operation.chainId!==ARC_CHAIN_ID||operation.hubAddress.toLowerCase()!==hubAddress.toLowerCase())throw new CircleRecoveryError('SESSION');
    const scope=captureWalletScope(),expected={...circleIdentityRef.current},owner=user.id,principal=account;
    const assertCurrent=()=>{scope.assertCurrent();const current=circleIdentityRef.current;if(current.walletId!==expected.walletId||current.userToken!==expected.userToken||current.walletMode!=='CIRCLE_EMBEDDED'||walletOwnerRef.current!==owner||selectedAccountRef.current?.toLowerCase()!==principal?.toLowerCase())throw new CircleRecoveryError('SESSION');};
    assertCurrent();return readCircleOperationStatus(operation,token,circleCredentials.userToken,assertCurrent,allowMissingReceipt);
  };
  const recoverCircleOperation:Web3ContextType['recoverCircleOperation']=async(operation)=>{const result=await readOwnedCircleOperation(operation);if(!result)throw new CircleRecoveryError();return result;};
  const continueCircleOperation:Web3ContextType['continueCircleOperation']=async(operation,onBroadcast)=>{
    const scope=captureWalletScope();scope.assertCurrent();
    const assertPending=(current:TransactionOperation)=>{scope.assertCurrent();if(!user||!token||walletMode!=='CIRCLE_EMBEDDED'||current.action==='BUY'||current.phase!=='AWAITING_SIGNATURE'||current.txHash||localBroadcast(user.id,current.id))throw new CircleRecoveryError();};
    assertPending(operation);
    const response=await operationRequest<{operation:TransactionOperation}>(token,`/api/transactions/${encodeURIComponent(operation.id)}`);
    scope.assertCurrent();const current=requireMatchingOperation(response,operation);assertPending(current);
    const status=await recoverCircleOperation(current);assertPending(current);
    const hash=status.transaction?.txHash;
    if(hash){await onBroadcast(hash);scope.assertCurrent();return{txHash:hash};}
    if(status.challenge.status!=='PENDING'||status.challenge.correlationIds?.length||status.transaction)throw new UiError(circleRecoveryMessage(status));
    return broadcastPreparedOperation(current,onBroadcast,status.challenge.id);
  };

  const commitToBuyOnchain: Web3ContextType["commitToBuyOnchain"] = async (params) => {
    if (!account || !ethers.isAddress(hubAddress) || !ethers.isAddress(usdcAddress)) throw new Error("Chưa có ví hoặc cấu hình hợp đồng Arc hợp lệ");
    if (!Number.isSafeInteger(params.quantity) || params.quantity <= 0) throw new Error("Số lượng mua không hợp lệ");
    const totalGross = BigInt(params.lockedUnitPriceUSDC) * BigInt(params.quantity);
    const checkoutScope=captureWalletScope();checkoutScope.assertCurrent();
    const assertCurrentIdentity = () => {
      checkoutScope.assertCurrent();
      if (!user || walletOwnerRef.current !== user.id || selectedAccountRef.current?.toLowerCase() !== account.toLowerCase()) {
        throw new Error("Tài khoản đã thay đổi trong lúc checkout. Không gửi giao dịch của phiên cũ.");
      }
    };
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
      assertCurrentIdentity();
      const proof = await verifyArcCommitment(txHash, { hubAddress, buyer: account, campaignId: params.campaignId,
        campaignIdentity: params.campaignIdentity, quantity: params.quantity, maxGross: totalGross });
      assertCurrentIdentity();
      await refreshBalance();
      assertCurrentIdentity();
      return { txHash, orderId: proof.orderId };
    };
    if(walletMode==='CIRCLE_EMBEDDED'&&params.operationId){
      const known=await readOwnedCircleOperation({id:params.operationId,action:'BUY',chainId:ARC_CHAIN_ID,hubAddress,principal:account,calldata:commitData},true);assertCurrentIdentity();
      if(known){const hash=known.transaction?.txHash;if(!hash)throw new UiError(circleRecoveryMessage(known));await params.onBroadcast?.(hash);assertCurrentIdentity();return verify(hash);}
    }
    if (params.authDeadline <= Math.floor(Date.now() / 1000) + 30) throw new Error("Chứng thực mua sắp hết hạn; lấy chứng thực mới");
    assertPurchaseBudget(await purchaseBudget(account, totalGross));
    assertCurrentIdentity();

    if (walletMode === "CIRCLE_EMBEDDED") {
      params.onStep?.("APPROVE");
      await assertCallBudget(account, usdcAddress, approveData, totalGross);
      assertCurrentIdentity();
      await sendCircleTransaction(
        usdcAddress,
        approveData,
        { type: "USDC_APPROVE", amount: totalGross.toString() },
        params.operationId?`circle:${params.operationId}:approve`:undefined
      );
      await assertCallBudget(account, hubAddress, commitData, totalGross);
      assertCurrentIdentity();
      params.onStep?.("BROADCAST");
      const result = await sendCircleTransaction(
        hubAddress,
        commitData,
        { type: "COMMIT_BUY", campaignId: params.campaignId.toString(), quantity: params.quantity.toString() },
        params.operationId?`circle:${params.operationId}:commit`:undefined,
        params.onBroadcast,
        totalGross
      );
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
      const approvalReceipt = await (await sendReviewedExternalCall(signer,usdcAddress,approveData,{type:'USDC_APPROVE',amount:totalGross.toString()},totalGross,()=>usdcContract.approve(hubAddress,totalGross))).wait();
      if (!approvalReceipt || approvalReceipt.status !== 1) throw new Error("Approve USDC chưa thành công");
    }
    await assertCallBudget(account, hubAddress, commitData, totalGross);
    assertCurrentIdentity();
    params.onStep?.("BROADCAST");
    const commitSigner = await ensureArcExternalSigner();
    assertCurrentIdentity();
    const hubContract = new ethers.Contract(hubAddress, hub.fragments, commitSigner);
    const transaction = await sendReviewedExternalCall(commitSigner,hubAddress,commitData,{type:'COMMIT_BUY',campaignId:String(params.campaignId),quantity:String(params.quantity)},totalGross,()=>{assertCurrentIdentity();if(params.authDeadline<=Math.floor(Date.now()/1000)+30)throw new UiError(uiMessage('Chứng thực mua sắp hết hạn; giữ yêu cầu và kiểm tra lại.','Purchase authorization is expiring; keep the request and review it again.'));return hubContract.commitToBuy(
      params.campaignId,
      params.campaignIdentity,
      params.quantity,
      params.requireEarlySlot,
      params.maxAuthQuantity,
      params.authDeadline,
      params.authSignature
    );});
    await params.onBroadcast?.(transaction.hash);
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
    const transaction = await sendReviewedExternalCall(signer,hubAddress,contractInterface.encodeFunctionData(functionName,args),intent,0n,()=>contract[functionName](...args));
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
        broadcastPreparedOperation,
        commitToBuyOnchain,
        recoverCircleOperation,
        continueCircleOperation,
        preflightPreparedOperation,
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
      {externalFeeRequest&&<ExternalFeeReviewModal key={externalFeeRequest.id} request={externalFeeRequest} onApprove={approveExternalFee} onCancel={stopExternalFeeReview}/>}
      {circleFeeRequest&&<CircleFeeReviewModal key={circleFeeRequest.id} request={circleFeeRequest} onApprove={approveCircleFee} onCancel={stopCircleFeeReview}/>}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => useContext(Web3Context);
