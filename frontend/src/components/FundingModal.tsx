import {ARC_IS_MAINNET} from '../../../shared/network.mjs';
import {WalletReceive} from './WalletReceive';
import {DialogSurface} from './DialogSurface';
import {ARC_CHAIN_ID,ARC_KIT_CHAIN,ARC_EXPLORER,ARC_CHAIN_NAME} from '../../../shared/network.mjs';
import React, { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { ethers } from 'ethers';
import { createPortal } from 'react-dom';
import type { AppKit, BridgeEstimateResult } from '@circle-fin/app-kit';
import type { EIP1193Provider } from 'viem';
import { useLanguage } from '../context/LanguageContext';
import { useWeb3 } from '../context/Web3Context';
import { useAuth } from '../context/AuthContext';
import { useExternalWallet } from '../context/ExternalWalletContext';
import { readArcBalance } from '../services/arcRpc';
import { bridgeSources, BridgeSource, bridgeQuoteSummary, parseUsdc } from '../services/paymentSafety';
import { BridgeKind, BridgeOperation, BridgeSafetyError, bridgeExplorer, bridgeRetryContext, canonicalBridgeRoute, readBridgeRpc } from '../services/bridgeRecovery';
import { BridgeInspection, BridgeJournal, assertBridgeSourceAvailable, attachBridgeRecoveryHash, guardedBridgeProvider,
  inspectBridgeJournal, loadBridgeJournal, newBridgeJournal, saveBridgeJournal, withBridgeLocks } from '../services/bridgeJournal';
import { uiMessage, UiError, UiMessage, messageText } from '../utils/uiMessage';
import {signerHoldMessage} from '../services/signerHoldMessage';
import { X, Coins, ArrowRightLeft, ExternalLink, Fuel, Copy, Check } from 'lucide-react';
import {BridgeFeeReview} from './BridgeFeeReview';
import {readBridgeFeeBudget,assertReviewedBridgeFee,bridgeFeeIsFresh,type BridgeFeeInput,type BridgeFeeBudget} from '../services/bridgeFeeReview';
import {configureBridgeAdapter} from '../services/bridgeAdapter';
import {BridgeServerClient,serverBridgeMessage,serverBridgeJournal,saveServerBridgeJournal,type ServerBridgeRecord} from '../services/bridgeServer';
import '../styles/funding.css';

interface FundingModalProps { isOpen: boolean; onClose: () => void; requiredUsdc?: string; onContinueCheckout?: () => void }
type PreparedQuote = { operation: BridgeOperation; estimate: BridgeEstimateResult; expiresAt: number };
let circleAppKitPromise: Promise<AppKit> | null = null;
async function getCircleAppKit(): Promise<AppKit> {
  circleAppKitPromise ||= import('@circle-fin/app-kit').then(({ AppKit: Kit }) => new Kit()).catch(() => {
    circleAppKitPromise = null; throw new BridgeSafetyError('BRIDGE_SDK_UNAVAILABLE');
  });
  let timer: ReturnType<typeof setTimeout>|undefined;
  try { return await Promise.race([circleAppKitPromise, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new BridgeSafetyError('BRIDGE_SDK_UNAVAILABLE')), 20_000);
  })]); } finally { clearTimeout(timer); }
}
function fundingError(error: unknown): UiMessage {
  if (error instanceof UiError) return error.displayMessage;
  const code = error instanceof BridgeSafetyError ? error.code : '';
  const hold=signerHoldMessage(code);if(hold)return hold;
  if(code==='BRIDGE_MINT_RECOVERY_CANCELLED')return uiMessage('Đã dừng xác nhận tiếp tục mint. Lượt burn và hồ sơ được giữ; chưa gửi mint mới.','Mint recovery confirmation stopped. The existing burn and record are retained; no new mint was sent.');
  if(['BRIDGE_MINT_RECOVERY_INVALID','BRIDGE_MINT_RECOVERY_EXPIRED'].includes(code))return uiMessage('Xác nhận tiếp tục mint chưa khớp hoặc đã hết hạn. Giữ lượt burn và kiểm tra lại trước khi ký.','Mint recovery confirmation does not match or has expired. Keep the existing burn and check again before signing.');
  if(code==='BRIDGE_SOURCE_PROOF_CANCELLED')return uiMessage('Đã dừng xác nhận ví nguồn. Hồ sơ được giữ và chưa gửi giao dịch bridge.','Source wallet confirmation stopped. The record is retained and no bridge transaction was sent.');
  if(code==='BRIDGE_SOURCE_PROOF_EXPIRED')return uiMessage('Xác nhận ví nguồn đã hết hạn. Đọc lại hồ sơ trước khi ký.','Source wallet confirmation expired. Refresh the record before signing.');
  if(['BRIDGE_SERVER_UNAVAILABLE','BRIDGE_READ_UNAVAILABLE','BRIDGE_READ_BUDGET_EXHAUSTED'].includes(code))return uiMessage('Chưa đồng bộ được với server. Giữ hồ sơ và kiểm tra lại trước khi ký.','The server could not be synchronized. Keep the record and check again before signing.');
  if(['BRIDGE_SERVER_RECORD_CONFLICT','BRIDGE_SERVER_LEGACY_RECORD','BRIDGE_SERVER_RECORD_INVALID','BRIDGE_SERVER_WRITE_UNRESOLVED','BRIDGE_TRANSFER_WRITE_UNRESOLVED'].includes(code))return uiMessage('Hồ sơ server hoặc yêu cầu ký chưa khớp. Giữ hồ sơ, đối chiếu hash và chưa gửi bridge mới.','The server record or signing request does not match. Keep the record, check hashes and hold new bridging.');
  if (code === 'BRIDGE_FEE_CANCELLED') return uiMessage('Đã dừng ký bước bridge. Giữ hồ sơ để kiểm tra chain hoặc tiếp tục mint đã burn.', 'Bridge signing stopped. Keep the record to check chain state or resume the existing burn’s mint.');
  if (code === 'BRIDGE_FEE_STALE') return uiMessage('Ngân sách bridge hết hạn. Giữ hồ sơ và đọc lại trước chữ ký.', 'The bridge budget expired. Keep the record and refresh before signing.');
  if (code === 'BRIDGE_FEE_INSUFFICIENT') return uiMessage('Không đủ số dư cho gas hoặc USDC nguồn. Giữ hồ sơ và nạp thêm trước chữ ký.', 'Source USDC or gas funds are insufficient. Keep the record and fund before signing.');
  if (code === 'BRIDGE_FEE_UNAVAILABLE') return uiMessage('Chưa xác định được phí bridge. Giữ hồ sơ và đọc lại trước chữ ký.', 'Bridge fees are unavailable. Keep the record and refresh before signing.');
  if (code === 'BRIDGE_SESSION_CHANGED') return uiMessage('Phiên hoặc ví đã thay đổi. Hồ sơ cũ vẫn được giữ; không ký bước tiếp theo của phiên cũ.', 'The session or wallet changed. The original record is retained; no further signing is allowed for that session.');
  if (code === 'BRIDGE_STORAGE_UNAVAILABLE') return uiMessage('Không lưu/đọc được hồ sơ bridge. Chưa được phép ký giao dịch mới. Bật lưu trữ trình duyệt rồi kiểm tra lại.', 'The bridge record cannot be saved or read. New signing is blocked. Enable browser storage and check again.');
  if (['BRIDGE_RECORD_INVALID', 'BRIDGE_PROOF_INVALID', 'BRIDGE_REQUEST_INVALID', 'BRIDGE_ROUTE_INVALID', 'BRIDGE_RECEIPT_REORG', 'BRIDGE_HASH_OBSERVATION_INVALID'].includes(code)) return uiMessage('Hồ sơ, tuyến hoặc bằng chứng chain chưa khớp. Giữ hồ sơ và đối chiếu hash trên Explorer trước khi tiếp tục.', 'The record, route or chain evidence does not match. Keep the record and check the transaction hash on Explorer before continuing.');
  if (['BRIDGE_SOURCE_RESERVED', 'BRIDGE_REBURN_BLOCKED', 'BRIDGE_WRITE_UNRESOLVED'].includes(code)) return uiMessage('Ví nguồn có giao dịch chưa rõ kết quả. Khôi phục lượt cũ trước; không gửi burn mới.', 'The source wallet has an unresolved transaction. Recover the original operation before starting another burn.');
  if (code === 'BRIDGE_HASH_OBSERVATION_PENDING') return uiMessage('Chưa tìm thấy giao dịch từ hash này. Giữ hồ sơ, kiểm tra lại hash trong ví và đối chiếu sau.', 'The transaction could not be found for this hash yet. Keep the record, check the hash in your wallet and verify again later.');
  if (code === 'BRIDGE_RECEIPT_PENDING') return uiMessage('Chain chưa có receipt xác nhận. Giữ hồ sơ và kiểm tra lại sau; chưa gửi lại giao dịch.', 'The chain has no confirmed receipt yet. Keep the record and check again later; do not resend the transaction.');
  if (code === 'BRIDGE_ATTESTATION_PENDING') return uiMessage('Circle chưa có attestation hoàn tất của đúng lượt burn. Giữ hồ sơ và kiểm tra lại sau.', 'Circle has no completed attestation for this exact burn yet. Keep the record and check again later.');
  if (code === 'BRIDGE_READ_UNAVAILABLE') return uiMessage('Chưa đọc được chain. Hồ sơ được giữ; thử kiểm tra lại sau.', 'The chain cannot be read yet. The record is retained; check again later.');
  if (code === 'BRIDGE_SDK_UNAVAILABLE') return uiMessage('Không tải được công cụ bridge. Thử lại khi kết nối ổn định.', 'The bridge tool could not load. Retry when the connection is available.');
  return uiMessage('Chưa thể hoàn tất nạp tiền. Kiểm tra hồ sơ và lịch sử ví trước khi thử lại; không bỏ qua cảnh báo của ví.', 'Funding could not complete. Check the record and wallet history before retrying; keep wallet security warnings enabled.');
}
const issue = (vi: string, en: string): never => { throw new UiError(uiMessage(vi, en)); };

const TestnetFundingModal: React.FC<FundingModalProps> = ({ isOpen, onClose, requiredUsdc, onContinueCheckout }) => {
  const { language } = useLanguage();
  const text = (vi: string, en: string) => language === 'vi' ? vi : en;
  const show = (message: UiMessage) => messageText(message, language);
  const { account, usdcBalance, balanceError, refreshBalance } = useWeb3();
  const { token, user, getSessionEpoch } = useAuth();
  const external = useExternalWallet();const externalRef=useRef(external);externalRef.current=external;
  const [tab, setTab] = useState<'FAUCET'|'BRIDGE'|'ONRAMP'>('FAUCET');
  const [source, setSource] = useState<BridgeSource>('Ethereum_Sepolia');
  const [amount, setAmount] = useState('1');
  const [quote, setQuote] = useState<PreparedQuote|null>(null);
  const [feeReview,setFeeReview]=useState<{request:BridgeFeeInput;changed:boolean}|null>(null);
  const feeResolver=useRef<{resolve:(budget:BridgeFeeBudget)=>void;reject:(error:BridgeSafetyError)=>void}|null>(null);
  const [journal, setJournal] = useState<BridgeJournal|null>(null);
  const [serverRecord,setServerRecord]=useState<ServerBridgeRecord|null>(null),[serverReady,setServerReady]=useState(false),[serverRefresh,setServerRefresh]=useState(0);
  const [sourceProof,setSourceProof]=useState<ServerBridgeRecord|null>(null);const sourceResolver=useRef<{resolve:()=>void;reject:(e:BridgeSafetyError)=>void}|null>(null);
  const cancelSource=(code='BRIDGE_SOURCE_PROOF_CANCELLED')=>{const pending=sourceResolver.current;sourceResolver.current=null;pending?.reject(new BridgeSafetyError(code));if(alive.current)setSourceProof(null);};
  const [inspection, setInspection] = useState<BridgeInspection>({ state: 'UNKNOWN' });
  const [recordFault, setRecordFault] = useState(false);
  const [busy, setBusy] = useState(false), [faucetBusy, setFaucetBusy] = useState(false);
  const [progress, setProgress] = useState<UiMessage|null>(null), [error, setError] = useState<UiMessage|null>(null);
  const [faucetMessage, setFaucetMessage] = useState<UiMessage|null>(null);
  const [recoveryKind, setRecoveryKind] = useState<BridgeKind>('burn'), [recoveryHash, setRecoveryHash] = useState('');
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), busyRef = useRef(false), alive = useRef(true), copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const scope = useRef({ account, token, id: user?.id, epoch: getSessionEpoch(), isOpen });
  const generation = useRef(0);
  if (scope.current.account !== account || scope.current.token !== token || scope.current.id !== user?.id || scope.current.isOpen !== isOpen) generation.current++;
  scope.current = { account, token, id: user?.id, epoch: getSessionEpoch(), isOpen };
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const cancelFee=(code='BRIDGE_FEE_CANCELLED')=>{const pending=feeResolver.current;feeResolver.current=null;pending?.reject(new BridgeSafetyError(code));if(alive.current)setFeeReview(null);};
  useEffect(()=>()=>{cancelFee('BRIDGE_SESSION_CHANGED');cancelSource('BRIDGE_SESSION_CHANGED');},[account,token,user?.id,isOpen,external.provider]);
  useEffect(()=>{if(sourceProof)document.getElementById('funding-source-proof-title')?.focus();},[sourceProof?.id]);
  const capture = () => {
    const expected = { ...scope.current };
    const expectedGeneration = generation.current;
    return () => alive.current && generation.current === expectedGeneration && scope.current.isOpen && expected.epoch === getSessionEpoch() &&
      expected.account?.toLowerCase() === scope.current.account?.toLowerCase() && expected.token === scope.current.token && expected.id === scope.current.id;
  };
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(copyTimer.current); }; }, []);
  useEffect(() => {
    if (!isOpen) return;
    const node = dialog.current, previous = document.activeElement as HTMLElement|null, overflow = document.body.style.overflow;
    node?.showModal(); document.body.style.overflow = 'hidden';
    return () => { node?.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, [isOpen]);
  useEffect(() => { setQuote(null); }, [source, amount, account, token]);
  useEffect(() => { if (isOpen && requiredUsdc) { setTab('FAUCET'); setAmount(requiredUsdc); } }, [isOpen, requiredUsdc]);
  useEffect(() => {
    setInspection({ state: 'UNKNOWN' }); setJournal(null); setError(null); setProgress(null); setRecoveryHash(''); setRecordFault(false); setCopied(false);setServerRecord(null);setServerReady(false);
    if (!account || !isOpen) return;
    try {
      const saved = loadBridgeJournal(account, localStorage, sessionStorage);
      setJournal(saved);
      if (saved) { setSource(saved.operation.source); setAmount(saved.operation.amount); }
    } catch (e) { setRecordFault(true); setError(fundingError(e)); }
  }, [account, token, isOpen]);
  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith('groupdeal_bridge:')) {
        cancelFee('BRIDGE_SESSION_CHANGED'); setQuote(null); setInspection({ state: 'UNKNOWN' });
        if (!account) return;
        try { setJournal(loadBridgeJournal(account, localStorage, sessionStorage)); setRecordFault(false); }
        catch (e) { setRecordFault(true); setError(fundingError(e)); }
      }
    };
    window.addEventListener('storage', listener); return () => window.removeEventListener('storage', listener);
  }, [account]);

  const client=(current:()=>boolean)=>{if(!token||!user||!account)throw new BridgeSafetyError('BRIDGE_SESSION_CHANGED');return new BridgeServerClient(token,user.id,account,()=>{if(!current())throw new BridgeSafetyError('BRIDGE_SESSION_CHANGED');});};
  const syncServer=async(api:BridgeServerClient,r:ServerBridgeRecord,own:BridgeJournal|null)=>{let record=r;if(own){if(own.id!==r.id)throw new BridgeSafetyError('BRIDGE_SERVER_RECORD_CONFLICT');for(const w of own.writes){const selected=record.writes.find(p=>p.id===w.id);if(w.hash&&selected?.state==='REQUESTED'){if(w.dataHash!==selected.calldataHash||w.nonce!==selected.nonce||w.afterBlock!==selected.afterBlock)throw new BridgeSafetyError('BRIDGE_SERVER_RECORD_CONFLICT');record=await api.attach(record,w.id,w.hash);}}}const restored=serverBridgeJournal(record,own);saveServerBridgeJournal(restored,localStorage,sessionStorage);return{record,journal:restored};};
  useEffect(()=>{if(!account||!token||!user||!isOpen)return;let active=true;const sessionCurrent=capture(),current=()=>active&&sessionCurrent();void(async()=>{try{const api=client(current),local=loadBridgeJournal(account,localStorage,sessionStorage),record=await api.current();if(!current())return;let selected=record;if(local?.legacyDigest){selected=null;}else if(local&&record?.id!==local.id){try{selected=await api.get(local.id);}catch(e){if(!(e instanceof BridgeSafetyError&&e.code==='BRIDGE_TRANSFER_NOT_FOUND'))throw e;selected=null;}}if(!current())return;if(selected){const restored=await syncServer(api,selected,local);if(!current())return;setServerRecord(restored.record);setJournal(restored.journal);setSource(restored.journal.operation.source);setAmount(restored.journal.operation.amount);}setServerReady(true);}catch(e){if(current()){setServerReady(false);setError(fundingError(e));}}})();return()=>{active=false;};},[account,token,user?.id,isOpen,serverRefresh]);
  const updateInspection = async (own: BridgeJournal, current: () => boolean) => {
    setInspection({state:'UNKNOWN'});
    setProgress(uiMessage('Đang đối chiếu receipt từng bước trên chain...', 'Checking each step receipt on chain...'));
    const api=client(current);let selected:ServerBridgeRecord|null=null;if(!own.legacyDigest){try{selected=await api.get(own.id);}catch(e){if(!(e instanceof BridgeSafetyError&&e.code==='BRIDGE_TRANSFER_NOT_FOUND'))throw e;}}
    let local=own;if(selected){const synced=await syncServer(api,selected,own);selected=synced.record;local=synced.journal;if(current()){setServerRecord(selected);setJournal(local);}}
    const result = await inspectBridgeJournal(local);if(selected){if(selected.phase==='RESERVED'&&!selected.writes.length&&local.settled){selected=await api.close(selected,'stop-before-burn');if(current())setServerRecord(selected);}const server=await api.inspect(selected);if(server.state!==result.state&&!(selected.phase==='CLOSED'&&selected.completion?.outcome==='CANCELLED'&&result.state==='NO_BURN'))result.state='UNKNOWN';if(['MINTED','NO_BURN'].includes(server.state)&&result.state===server.state){selected=await api.close(selected,'complete');if(current())setServerRecord(selected);}}
    if (!current()) return;
    setInspection(result); setJournal({ ...local, writes: [...local.writes] });
    if (result.state === 'MINTED') {
      setProgress(uiMessage('Receipt Arc xác nhận đã mint đúng USDC cho ví nhận. Kiểm tra số dư trước khi mua.', 'The Arc receipt confirms the correct USDC mint to the recipient. Check the balance before buying.'));
      await refreshBalance();
    } else if (result.state === 'BURNED') setProgress(uiMessage('Chain nguồn xác nhận burn. Có thể tiếp tục attestation/mint của lượt này; không burn lại.', 'The source chain confirms the burn. Continue attestation/mint for this operation without another burn.'));
    else if (result.state === 'NO_BURN') setProgress(uiMessage('Lượt đã dừng trước burn hoặc burn đã revert. Hồ sơ được giữ; có thể lấy báo giá mới.', 'The operation stopped before burn, or the burn reverted. The record is retained; a new quote can be requested.'));
    else setProgress(uiMessage('Kết quả còn chưa rõ. Đối chiếu hash trong lịch sử ví và kiểm tra chain; không xóa hồ sơ để gửi lại.', 'The outcome is still unknown. Check the wallet-history hash and chain; retain the record instead of resetting it.'));
  };
  const recover = async (attach = false) => {
    if (!account || !journal || busyRef.current) return;
    const current = capture(); busyRef.current = true; setBusy(true); setError(null);
    try {
      await withBridgeLocks(journal.operation.sender, account, async () => {
        const own = loadBridgeJournal(account, localStorage, sessionStorage);
        if (!own || !current()) throw new BridgeSafetyError('BRIDGE_SESSION_CHANGED');
        if (attach) await attachBridgeRecoveryHash(own, recoveryKind, recoveryHash.trim(), readBridgeRpc);
        if (current()) setJournal({ ...own, writes: [...own.writes] });
        else saveServerBridgeJournal(own,localStorage,sessionStorage);
        await updateInspection(own, current);
      });
    } catch (e) { if (current()) {setError(fundingError(e));setProgress(null);} }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  const execute = async (retry = false) => {
    if (!retry) return; // New bridge entry is Coming soon; retain existing burn/mint recovery.
    if (busyRef.current || !account || !token || !user) return;
    const sessionCurrent=capture();let capturedProvider:typeof external.provider;const current=()=>{if(!sessionCurrent())return false;try{return !capturedProvider||externalRef.current.getProvider()===capturedProvider;}catch{return false;}},recipient=account;
    let own: BridgeJournal|null = null;
    let serverHold:BridgeSafetyError|undefined;
    busyRef.current = true; setBusy(true); setError(null); setProgress(uiMessage('Đang chuẩn bị bridge và kiểm tra ví...', 'Preparing the bridge and checking the wallet...'));
    const assertCurrent = () => { if (!current()) throw new BridgeSafetyError('BRIDGE_SESSION_CHANGED'); };
    try {
      try { parseUsdc(amount); if (amount.length > 80 || parseUsdc(amount) > ethers.MaxUint256) throw new Error(); }
      catch { issue('Số USDC phải lớn hơn 0 và có tối đa 6 chữ số thập phân.', 'USDC must be greater than zero with up to 6 decimal places.'); }
      if (!external.configured) issue('Kết nối ví ngoài chưa được cấu hình. Có thể dùng Circle faucet.', 'The external wallet connection is not configured. Circle faucet remains available.');
      if (!external.provider) {
        // Reown's connection UI is outside this native dialog's top layer.
        // Keep this component/session alive while its connection UI is active.
        dialog.current?.close();
        try { await external.connect(); } finally { if (current()) dialog.current?.showModal(); }
      }
      assertCurrent();
      const provider=externalRef.current.getProvider();capturedProvider=provider;const accounts=await provider.request({method:'eth_accounts'});assertCurrent();
      if (!Array.isArray(accounts) || !accounts.length || !ethers.isAddress(accounts[0])) throw new BridgeSafetyError('BRIDGE_SESSION_CHANGED');
      const sender = ethers.getAddress(accounts[0]);
      await withBridgeLocks(sender, recipient, async () => {
        assertCurrent();
        const previous = loadBridgeJournal(recipient, localStorage, sessionStorage);
        const state = previous ? await inspectBridgeJournal(previous) : null; assertCurrent();
        if (previous && previous.operation.sender.toLowerCase() !== sender.toLowerCase() && retry) throw new BridgeSafetyError('BRIDGE_SESSION_CHANGED');
        if (retry && state?.state !== 'BURNED') throw new BridgeSafetyError('BRIDGE_REBURN_BLOCKED');
        if (!retry && previous && !['MINTED','NO_BURN'].includes(state!.state)) throw new BridgeSafetyError('BRIDGE_WRITE_UNRESOLVED');
        await assertBridgeSourceAvailable(sender, previous?.id, localStorage, undefined, sessionStorage); assertCurrent();
        const operation: BridgeOperation = retry && previous ? previous.operation : { source, amount, sender, recipient };
        const api=client(current);let server=await api.current();assertCurrent();if(server?.phase==='RESERVED'&&(previous?.id!==server.id||server.scope.source!==operation.source||server.scope.sender!==sender.toLowerCase()||server.scope.amountBaseUnits!==parseUsdc(operation.amount).toString()))throw new BridgeSafetyError('BRIDGE_SERVER_RECORD_CONFLICT');if(previous&&(previous.legacyDigest||!server||server.id!==previous.id))throw new BridgeSafetyError('BRIDGE_SERVER_LEGACY_RECORD');if(retry&&(!server||server.id!==previous?.id))throw new BridgeSafetyError('BRIDGE_SERVER_LEGACY_RECORD');
        const guarded = guardedBridgeProvider(provider, { current, operation, retry, burn: state?.burn, journal: () => own,
          server:{reserve:async(write,transaction)=>{if(!server)throw new BridgeSafetyError('BRIDGE_SERVER_WRITE_UNRESOLVED');try{const prepared=await api.ready(server,write,transaction,retry?async message=>{assertCurrent();setProgress(uiMessage('Ví nguồn cần xác nhận lại để tiếp tục mint của lượt burn đã có.','The source wallet needs a fresh confirmation to mint the existing burn.'));const verifyWallet=async()=>{const [chain,accounts]=await Promise.all([provider.request({method:'eth_chainId'}),provider.request({method:'eth_accounts'})]);assertCurrent();if(BigInt(String(chain))!==BigInt(ARC_CHAIN_ID)||!Array.isArray(accounts)||String(accounts[0]).toLowerCase()!==operation.sender.toLowerCase())throw new BridgeSafetyError('BRIDGE_SESSION_CHANGED')};await verifyWallet();const signature=await provider.request({method:'personal_sign',params:[ethers.hexlify(ethers.toUtf8Bytes(message)),operation.sender]});await verifyWallet();if(typeof signature!=='string')throw new BridgeSafetyError('BRIDGE_MINT_RECOVERY_INVALID');return signature}:undefined);server=prepared.record;if(current())setServerRecord(server);return prepared;}catch(e){if(e instanceof BridgeSafetyError&&(signerHoldMessage(e.code)||['BRIDGE_MINT_RECOVERY_CANCELLED','BRIDGE_MINT_RECOVERY_INVALID','BRIDGE_MINT_RECOVERY_EXPIRED','BRIDGE_SESSION_CHANGED'].includes(e.code)))serverHold=e;throw e;}},broadcast:async(write,hash)=>{if(!server)throw new BridgeSafetyError('BRIDGE_SERVER_WRITE_UNRESOLVED');server=await api.attach(server,write.id,hash,true);if(current())setServerRecord(server);}},
          reviewWrite:async({kind,chainId,transaction})=>{
            // The guarded SDK is paused here and has not reserved this write.
            // An existing REQUESTED/hash is still governed by receipt recovery.
            if(own){own.settled=true;saveBridgeJournal(own);}
            let changed=false;let candidate:Record<string,unknown>={...Object.fromEntries(Object.entries(transaction).filter(([,value])=>value!==undefined)),value:transaction.value??'0x0',chainId:ethers.toQuantity(chainId),nonce:ethers.toQuantity(BigInt(String(await provider.request({method:'eth_getTransactionCount',params:[operation.sender,'pending']}))))};
            for(;;){assertCurrent();let request:BridgeFeeInput={id:crypto.randomUUID(),operation,kind,chainId,transaction:candidate,assertCurrent};const seed=await readBridgeFeeBudget(request);assertCurrent();if(candidate.gas===undefined)candidate={...candidate,gas:ethers.toQuantity(seed.gasLimit)};if(candidate.gasPrice===undefined&&candidate.maxFeePerGas===undefined)candidate={...candidate,gasPrice:ethers.toQuantity(seed.gasPrice)};request={...request,transaction:candidate};
              const reviewed=await new Promise<BridgeFeeBudget>((resolve,reject)=>{feeResolver.current={resolve,reject};setFeeReview({request,changed});});assertCurrent();
              const fresh=await readBridgeFeeBudget(request);assertCurrent();
              if(!bridgeFeeIsFresh(reviewed)||fresh.feeReserve>reviewed.feeReserve||fresh.shortfall>0n||fresh.tokenShortfall>0n||BigInt(String(candidate.gas))<fresh.gasLimit||BigInt(String(candidate.maxFeePerGas??candidate.gasPrice))<fresh.gasPrice){changed=true;candidate={...candidate,gas:ethers.toQuantity(fresh.gasLimit),...(candidate.maxFeePerGas!==undefined?{maxFeePerGas:ethers.toQuantity(fresh.gasPrice)}:{gasPrice:ethers.toQuantity(fresh.gasPrice)})};continue;}
              assertReviewedBridgeFee(reviewed,request);assertReviewedBridgeFee(fresh,request);return Object.assign(()=>{assertCurrent();assertReviewedBridgeFee(fresh,request);if(own)own.settled=false;},{transaction:structuredClone(candidate)});
            }
          },
          changed: value => {
            if (!current()) return;
            setJournal({ ...value, writes: [...value.writes] });
            const write = value.writes[value.writes.length - 1];
            if (write?.state === 'REQUESTED') setProgress(uiMessage(`Đang chờ ví xác nhận bước ${write.kind}.`, `Waiting for wallet confirmation of ${write.kind}.`));
            if (write?.state === 'BROADCAST') setProgress(uiMessage(`Ví đã trả hash bước ${write.kind}. Đang chờ bằng chứng chain; chưa xác nhận hoàn tất.`, `The wallet returned a ${write.kind} hash. Waiting for chain evidence; completion is not confirmed.`));
          } });
        await guarded.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: bridgeSources[operation.source].chainIdHex }] }); assertCurrent();
        const kit = await getCircleAppKit(); assertCurrent();
        const { createViemAdapterFromProvider } = await import('@circle-fin/adapter-viem-v2'); assertCurrent();
        const adapter = configureBridgeAdapter(await createViemAdapterFromProvider({ provider: guarded as unknown as EIP1193Provider })); assertCurrent();
        const sourceProvider = new ethers.BrowserProvider(provider);
        if (Number((await sourceProvider.getNetwork()).chainId) !== bridgeSources[operation.source].chainId) throw new BridgeSafetyError('BRIDGE_ROUTE_INVALID');
        if (!retry) {
          const usdc = new ethers.Contract(bridgeSources[operation.source].usdc, ['function balanceOf(address) view returns (uint256)'], sourceProvider);
          const [balance, native] = await Promise.all([usdc.balanceOf(sender), sourceProvider.getBalance(sender)]); assertCurrent();
          if (balance < parseUsdc(amount)) issue('Không đủ USDC trên mạng nguồn để bridge.', 'The source wallet has insufficient USDC for the bridge.');
          if (native === 0n) issue(`Ví nguồn không có ETH trên ${bridgeSources[operation.source].label}. Nạp ETH testnet trước khi bridge.`, `The source wallet has no ETH on ${bridgeSources[operation.source].label}. Add testnet ETH before bridging.`);
          const route = canonicalBridgeRoute(kit, operation);
          // User-controlled adapters resolve the connected signing address themselves.
          // The estimate and guarded writes still bind it to the captured sender.
          const params = { from: { adapter, chain: route.source }, to: { adapter, chain: route.destination, recipientAddress: recipient, useForwarder: false },
            token: 'USDC' as const, amount, config: { batchTransactions: false, transferSpeed: 'SLOW' as const, maxFee: '0' } };
          const estimate = await kit.estimateBridge(params); assertCurrent();
          if (estimate.token !== 'USDC' || parseUsdc(estimate.amount) !== parseUsdc(amount) || String(estimate.source.chain) !== source ||
            estimate.source.address.toLowerCase() !== sender.toLowerCase() || String(estimate.destination.chain) !== ARC_KIT_CHAIN ||
            (estimate.destination.recipientAddress || estimate.destination.address).toLowerCase() !== recipient.toLowerCase()) throw new BridgeSafetyError('BRIDGE_ROUTE_INVALID');
          const summary = bridgeQuoteSummary(estimate, source, amount);
          if (native < summary.sourceGas) issue('Không đủ ETH nguồn cho ngân sách gas.', 'Insufficient source ETH for the gas budget.');
          if (summary.arcGas > 0n && await readArcBalance(sender) < summary.arcGas) issue('Ví ký mint cần USDC gas trên Arc. Nạp gas trước khi burn.', 'The mint signer needs USDC gas on Arc. Fund its gas before burning.');
          assertCurrent();
          const old = quote && JSON.stringify(quote.operation) === JSON.stringify(operation) ? bridgeQuoteSummary(quote.estimate, source, amount) : null;
          if (!quote || quote.expiresAt <= Date.now() || !old || summary.received < old.received || summary.sourceGas > old.sourceGas || summary.arcGas > old.arcGas) {
            setQuote({ operation, estimate, expiresAt: Date.now() + 60_000 });
            setProgress(uiMessage('Báo giá đã sẵn sàng. Kiểm tra số nhận và gas rồi xác nhận; chưa gửi giao dịch.', 'The quote is ready. Review the received amount and gas before confirming; no transaction has been sent.')); return;
          }
          if(server&&['CHALLENGE','RESERVED'].includes(server.phase)&&!server.writes.length&&(server.phase==='RESERVED'||Date.now()<server.expiresAt)&&server.scope.source===operation.source&&server.scope.sender===operation.sender.toLowerCase()&&server.scope.amountBaseUnits===parseUsdc(operation.amount).toString()){own=serverBridgeJournal(server,previous);saveBridgeJournal(own);}else{own = newBridgeJournal(operation, previous);server=await api.create(own.id,operation);}assertCurrent();setServerRecord(server);setJournal(own);setInspection({state:'UNKNOWN'});
          if(server.phase==='CHALLENGE'){const challenge=server;if(Date.now()>=challenge.expiresAt)throw new BridgeSafetyError('BRIDGE_SOURCE_PROOF_EXPIRED');await new Promise<void>((resolve,reject)=>{sourceResolver.current={resolve,reject};setSourceProof(challenge);});assertCurrent();const [signedChain,signedAccounts]=await Promise.all([provider.request({method:'eth_chainId'}),provider.request({method:'eth_accounts'})]);assertCurrent();if(BigInt(String(signedChain))!==BigInt(bridgeSources[operation.source].chainId)||!Array.isArray(signedAccounts)||String(signedAccounts[0]).toLowerCase()!==operation.sender.toLowerCase())throw new BridgeSafetyError('BRIDGE_SESSION_CHANGED');const signature=await provider.request({method:'personal_sign',params:[ethers.hexlify(ethers.toUtf8Bytes(serverBridgeMessage(challenge))),operation.sender]});assertCurrent();if(typeof signature!=='string')throw new BridgeSafetyError('BRIDGE_SOURCE_PROOF_INVALID');server=await api.authorize(challenge,signature);assertCurrent();setServerRecord(server);}
          await kit.bridge({ ...params, quote: estimate.quote, invocationMeta: { traceId: own.id.replace(/-/g, ''), callers: [{ type: 'app', name: 'GroupDeal', version: '1.0.0' }] } });
        } else {
          own = previous!; saveBridgeJournal(own); setInspection({ state: 'UNKNOWN' });
          const route = canonicalBridgeRoute(kit, operation);
          await kit.retryBridge(bridgeRetryContext(operation, route, state!.burn!), { from: adapter, to: adapter });
        }
        // AppKit may return a failed result instead of throwing the guarded provider error.
        if(serverHold)throw serverHold;
        // SDK return is not financial proof. Only the captured writes and chain
        // receipts determine recovery state. No raw SDK errors are persisted.
        own.settled = true; saveBridgeJournal(own);
        if (current()) { setQuote(null); await updateInspection(own, current); }
      });
    } catch (e) {
      const pending = own as BridgeJournal|null;
      if (pending) { pending.settled = true; try { saveBridgeJournal(pending); } catch {} }
      if (current()) { setError(fundingError(e)); setQuote(null); setProgress(null); }
    } finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  const claimFaucet = async () => {
    if (!token || !account || faucetBusy) return;
    const current = capture(); setFaucetBusy(true); setFaucetMessage(null);
    try {
      const response = await fetch('/api/faucet/usdc', { method: 'POST', signal: AbortSignal.timeout(25_000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ address: account }) });
      if (!current()) return;
      if (!response.ok) issue('Faucet chưa nhận được yêu cầu. Có thể dùng trang Circle hoặc thử lại sau.', 'The faucet did not accept the request. Use the Circle page or retry later.');
      setFaucetMessage(uiMessage('Faucet đã nhận yêu cầu. Chờ giao dịch và kiểm tra số dư trên Arc.', 'The faucet accepted the request. Wait for the transaction and check the Arc balance.'));
      await refreshBalance();
    } catch (e) { if (current()) setFaucetMessage(fundingError(e)); }
    finally { if (alive.current) setFaucetBusy(false); }
  };
  const serverHeld=serverRecord?.phase==='RESERVED'&&serverRecord.writes.length>0;
  const unlinked=!!journal&&(!!journal.legacyDigest||!serverRecord||serverRecord.id!==journal.id);
  const unresolved = unlinked || recordFault || (tab==='BRIDGE'&&!serverReady) || (!!journal && !['MINTED','NO_BURN'].includes(inspection.state)&&!(serverRecord&&['CHALLENGE','RESERVED'].includes(serverRecord.phase)&&!serverRecord.writes.length));
  const stopBeforeBurn=async()=>{if(busyRef.current||!serverRecord)return;const current=capture();busyRef.current=true;setBusy(true);setError(null);try{const closed=await client(current).close(serverRecord,'stop-before-burn');if(!current())return;setServerRecord(closed);const own=serverBridgeJournal(closed,journal);saveBridgeJournal(own);setJournal(own);await updateInspection(own,current);}catch(e){if(current())setError(fundingError(e));}finally{busyRef.current=false;if(alive.current)setBusy(false);}};
  const copyAddress = async () => {
    if (!account) return;
    const current = capture();
    try { await navigator.clipboard.writeText(account); if (!current()) return; setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => { if (current()) setCopied(false); }, 2000); }
    catch { if (current()) setFaucetMessage(uiMessage('Không chép được địa chỉ. Bạn có thể chọn và chép thủ công.', 'The address could not be copied. Select it and copy it manually.')); }
  };
  if (!isOpen) return null;
  return createPortal(
    <dialog ref={dialog} className="funding-dialog" aria-labelledby="funding-title" onCancel={event => { event.preventDefault(); onCloseRef.current(); }} onClick={event => {
      const box = event.currentTarget.getBoundingClientRect();
      if (event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) onClose();
    }} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)')].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="modal-header"><h2 id="funding-title"><Coins size={22} aria-hidden="true" />{text(`Nạp USDC — ${ARC_CHAIN_NAME}`,`Add USDC — ${ARC_CHAIN_NAME}`)}</h2><button type="button" className="modal-close" onClick={onClose} aria-label={text('Đóng nạp USDC','Close funding')}><X size={18} /></button></div>
      <div className="funding-balance"><div><span>{text(`Số dư ví người mua (${ARC_CHAIN_NAME})`,`Buyer wallet balance (${ARC_CHAIN_NAME})`)}</span><strong className="font-mono">{!account ? text('Chưa kết nối ví','No connected wallet') : usdcBalance === null ? text('Đang tải số dư...','Loading balance...') : `${usdcBalance} USDC`}</strong></div><span><Fuel size={14} aria-hidden="true" />{text('Gas trừ từ cùng số dư','Gas uses the same balance')}</span></div>
      {balanceError && <p role="status">{text('Chưa đọc được số dư mới. Kiểm tra lại trước khi mua.','The latest balance could not be read. Check again before buying.')}</p>}
      <p>{text('Tiền mua hàng và gas trên Arc cùng sử dụng USDC. Nạp tiền không tạo đơn hàng.','Purchases and gas on Arc use the same USDC balance. Funding does not create an order.')}</p>
      {feeReview&&<BridgeFeeReview key={feeReview.request.id} request={feeReview.request} changed={feeReview.changed} onCancel={()=>cancelFee()} onApprove={budget=>{const pending=feeResolver.current;feeResolver.current=null;setFeeReview(null);pending?.resolve(budget);}}/>}
      {sourceProof&&<div className="funding-panel funding-source-proof" aria-labelledby="funding-source-proof-title"><h3 id="funding-source-proof-title" tabIndex={-1}>{text('Xác nhận quyền sở hữu ví nguồn','Confirm source wallet ownership')}</h3><p>{text('Chữ ký này gắn ví nguồn với lượt bridge bên dưới. Nó không gửi giao dịch, tiêu tiền hoặc thêm ví đăng nhập. Sau đó, bạn vẫn duyệt phí riêng cho từng bước.','This signature binds the source wallet to this bridge. It submits no transaction, spends no funds and adds no sign-in wallet. You will still review fees separately for each step.')}</p><dl><dt>{text('Ví nguồn','Source wallet')}</dt><dd className="font-mono">{sourceProof.scope.sender}</dd><dt>{text('Mạng nguồn','Source network')}</dt><dd>{bridgeSources[sourceProof.scope.source].label}</dd><dt>USDC</dt><dd>{ethers.formatUnits(sourceProof.scope.amountBaseUnits,6)}</dd><dt>{text('Ví nhận trên Arc','Recipient on Arc')}</dt><dd className="font-mono">{sourceProof.scope.recipient}</dd></dl><details><summary>{text('Xem thông điệp sẽ ký','View the message to sign')}</summary><pre>{serverBridgeMessage(sourceProof)}</pre></details><div className="funding-proof-actions"><button type="button" className="btn btn-secondary" onClick={()=>cancelSource()}>{text('Dừng và giữ hồ sơ','Stop and keep the record')}</button><button type="button" className="btn btn-primary" onClick={()=>{const pending=sourceResolver.current;sourceResolver.current=null;setSourceProof(null);pending?.resolve();}}>{text('Xác nhận ví nguồn trong ví','Confirm source wallet in wallet')}</button></div></div>}
      {!feeReview&&!sourceProof&&<div className="funding-tabs" role="group" aria-label={text('Cách nạp tiền','Funding method')}>
        <button type="button" className={`btn btn-sm ${tab === 'FAUCET' ? 'btn-primary':'btn-secondary'}`} aria-pressed={tab === 'FAUCET'} onClick={() => setTab('FAUCET')}>Testnet Faucet</button>
        <button type="button" className={`btn btn-sm ${tab === 'BRIDGE' ? 'btn-primary':'btn-secondary'}`} aria-pressed={tab === 'BRIDGE'} onClick={() => setTab('BRIDGE')}>{text('Bridge · Sắp ra mắt / Hồ sơ cũ','Bridge · Coming soon / Previous records')}</button>
        <button type="button" className={`btn btn-sm ${tab === 'ONRAMP' ? 'btn-primary':'btn-secondary'}`} aria-pressed={tab === 'ONRAMP'} onClick={() => setTab('ONRAMP')}>{text('Thẻ/ngân hàng','Card/bank')}</button>
      </div>}
      {!feeReview&&!sourceProof&&tab === 'FAUCET' && <div className="funding-panel">
        <p>{text('Nhận USDC testnet cho địa chỉ bên dưới. Token testnet dùng để kiểm thử và không có giá trị tiền thật.','Receive testnet USDC at the address below. Testnet tokens are for testing and have no real monetary value.')}</p>
        {account ? <div className="funding-address"><span className="font-mono">{account}</span><button type="button" className="btn btn-sm btn-secondary" onClick={() => void copyAddress()}>{copied ? <Check size={14} aria-hidden="true" />:<Copy size={14} aria-hidden="true" />}{copied ? text('Đã chép','Copied'):text('Chép','Copy')}</button></div> : <p>{text('Hãy đăng nhập và chọn ví nhận trước.','Sign in and select a recipient wallet first.')}</p>}
        <button type="button" className="btn btn-primary" disabled={!token || !account || faucetBusy} onClick={() => void claimFaucet()}>{faucetBusy ? text('Đang yêu cầu faucet...','Requesting faucet...'):text('Nhận USDC testnet trực tiếp','Request testnet USDC')}</button>
        {faucetMessage && <p role="status">{show(faucetMessage)}</p>}
        <a className="btn btn-secondary" href="https://faucet.circle.com" target="_blank" rel="noreferrer">{text('Faucet dự phòng (Circle)','Alternative faucet (Circle)')}<ExternalLink size={14} aria-hidden="true" /></a>
        <button type="button" className="btn btn-secondary" disabled={!account} onClick={() => void refreshBalance()}>{text('Tôi đã nhận USDC — cập nhật số dư','I received USDC — refresh balance')}</button>
      </div>}
      {!feeReview&&!sourceProof&&tab === 'BRIDGE' && <div className="funding-panel">
        {!external.configured && <p>{text('Kết nối ví ngoài chưa được cấu hình. Có thể dùng Circle faucet.', 'The external wallet connection is not configured. Circle faucet remains available.')}</p>}
        <p>{text('Bridge mới đang được phát triển. Các hồ sơ cũ bên dưới vẫn có thể kiểm tra và tiếp tục attestation / mint.','New bridge transfers are coming soon. Previous records below can still be checked and continued through attestation / mint.')}</p>
        <label htmlFor="funding-source">{text('Mạng nguồn','Source network')}</label><select id="funding-source" value={source} disabled onChange={event => setSource(event.target.value as BridgeSource)}>{Object.entries(bridgeSources).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select>
        <label htmlFor="funding-amount">{text('Số USDC cần bridge','USDC amount to bridge')}</label><input id="funding-amount" inputMode="decimal" maxLength={80} value={amount} disabled onChange={event => setAmount(event.target.value)} />
        <dl><dt>{text('Đích','Destination')}</dt><dd>{ARC_CHAIN_NAME} ({ARC_CHAIN_ID})</dd><dt>{text('Ví nhận','Recipient')}</dt><dd className="font-mono">{account || text('Hãy đăng nhập trước','Sign in first')}</dd></dl>
        {quote && (() => { const summary = bridgeQuoteSummary(quote.estimate, quote.operation.source, quote.operation.amount); return <div className="funding-quote" role="status"><p>{text('Số nhận dự kiến tối thiểu','Estimated minimum received')}: {ethers.formatUnits(summary.received,6)} USDC</p><p>{text('Phí USDC dự kiến','Estimated USDC fee')}: {ethers.formatUnits(summary.feesUsdc,6)}</p><p>{text('Ngân sách gas (+20%)','Gas budget (+20%)')}: {ethers.formatUnits(summary.sourceGas,18)} ETH; {ethers.formatUnits(summary.arcGas,18)} USDC Arc</p><p>{text('Báo giá hiệu lực 60 giây, kiểm tra lại trước ký. CCTP standard cần chờ finality nguồn.','The quote lasts 60 seconds and is checked again before signing. Standard CCTP waits for source finality.')}</p></div>; })()}
        <button type="button" className="btn btn-primary" disabled>{text('Bridge mới · Sắp ra mắt','New bridge · Coming soon')}</button>
        {progress && <p role="status">{show(progress)}</p>}{error && <p role="alert" className="funding-error">{show(error)}</p>}
        <p aria-live="polite" data-bridge-server={serverReady?'ready':'unavailable'}>{!serverReady?text('Đang đối chiếu hồ sơ server. Chưa được phép ký bridge.','Checking the server record. Bridge signing is not available yet.'):serverRecord?text('Hồ sơ được đồng bộ với server; các hash và receipt vẫn cần được đối chiếu.','The record is synchronized with the server; hashes and receipts still require verification.'):text('Server chưa có hồ sơ bridge cho ví nhận này.','The server has no bridge record for this recipient.')}</p>
        {!serverReady&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>{setServerReady(false);setServerRefresh(v=>v+1);}}>{text('Đọc lại hồ sơ server','Refresh server record')}</button>}
        {unlinked&&<p>{text('Hồ sơ trình duyệt cũ chưa được tiếp nhận trên server. Có thể đối chiếu receipt; ký tiếp cần hoàn tất tiếp nhận hồ sơ.','This browser record has not been admitted by the server. Receipts can be checked; further signing requires record admission.')}</p>}
        {journal && <div className="funding-recovery"><p>{text('Hồ sơ bridge được giữ sau reload. Đóng cửa sổ dừng yêu cầu ký tiếp theo; giao dịch đã được ví chấp thuận vẫn có thể lên chain.','The bridge record survives reload. Closing stops further signing requests; a transaction already approved in the wallet can still reach the chain.')}</p>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void recover()}>{text('Kiểm tra trạng thái trên chain','Check chain status')}</button>
          {serverRecord?.phase==='RESERVED'&&!serverRecord.writes.some(w=>w.kind==='burn'||w.kind==='mint'||w.state==='REQUESTED')&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void stopBeforeBurn()}>{text('Dừng hồ sơ trước burn','Stop the record before burn')}</button>}
          {serverHeld&&journal.writes.some(w=>w.state==='REJECTED')&&<p>{text('Ví đã từ chối, nhưng server vẫn giữ yêu cầu chưa rõ kết quả. Đối chiếu chain trước khi gửi tiếp.','The wallet declined, but the server still holds an unresolved request. Check chain state before continuing.')}</p>}
          {inspection.state === 'BURNED' && <button type="button" className="btn btn-secondary" disabled={busy || !serverRecord || serverRecord.id!==journal.id} onClick={() => void execute(true)}>{text('Tiếp tục attestation / mint','Continue attestation / mint')}</button>}
          {unresolved && <><label htmlFor="funding-recovery-kind">{text('Bước trong lịch sử ví','Wallet-history step')}</label><select id="funding-recovery-kind" value={recoveryKind} disabled={busy} onChange={event => setRecoveryKind(event.target.value as BridgeKind)}><option value="approve">Approve</option><option value="burn">Burn</option><option value="mint">Mint (Arc)</option></select><label htmlFor="funding-recovery-hash">{text('Hash giao dịch cần đối chiếu','Transaction hash to verify')}</label><input id="funding-recovery-hash" value={recoveryHash} maxLength={66} autoComplete="off" spellCheck={false} disabled={busy} onChange={event => setRecoveryHash(event.target.value)} /><button type="button" className="btn btn-secondary" disabled={busy || !/^0x[\da-f]{64}$/i.test(recoveryHash.trim())} onClick={() => void recover(true)}>{text('Đối chiếu hash và phục hồi','Verify hash and recover')}</button></>}
          {journal.writes.map(write => {
            const proof = write.state === 'BROADCAST' ? inspection.receipts?.find(row => row.writeId === write.id && row.proof.kind === write.kind && row.proof.hash.toLowerCase() === write.hash?.toLowerCase())?.proof : undefined;
            const state = proof ? (proof.reverted ? 'reverted' : 'confirmed') : write.state === 'BROADCAST' ? 'pending' : write.state === 'REJECTED' ? 'rejected' : 'requested';
            return <div key={write.id} className="funding-write" data-bridge-write-kind={write.kind} data-bridge-receipt={state}><strong>{write.kind}</strong>: {state === 'confirmed' ? text('receipt xác nhận thành công','receipt confirms success') : state === 'reverted' ? text('receipt xác nhận giao dịch revert','receipt confirms a reverted transaction') : state === 'pending' ? text('ví đã trả hash; chờ đối chiếu receipt','wallet returned a hash; receipt check pending') : state === 'rejected' ? text('ví từ chối','wallet declined') : text('đã mở yêu cầu ký; chưa rõ kết quả','signing requested; outcome unknown')}{bridgeExplorer(write.kind,journal.operation.source,write.hash) && <a href={bridgeExplorer(write.kind,journal.operation.source,write.hash)} target="_blank" rel="noreferrer">{write.hash}<ExternalLink size={11} aria-hidden="true" /></a>}</div>;
          })}
        </div>}
        <p>{text('Nếu ví cảnh báo rủi ro, hãy kiểm tra mạng, hợp đồng và quyền approve trước khi ký.','If the wallet warns of risk, review the network, contract and approval before signing.')}</p>
      </div>}
      {!feeReview&&!sourceProof&&tab === 'ONRAMP' && <p>{text(`Thanh toán thẻ/ngân hàng chưa được cung cấp. Trên ${ARC_CHAIN_NAME}, dùng faucet hoặc nhận USDC từ ví khác.`,`Card and bank funding is not available. On ${ARC_CHAIN_NAME}, use the faucet or receive USDC from another wallet.`)}</p>}
      {!feeReview&&!sourceProof&&requiredUsdc && onContinueCheckout && <div className="funding-checkout"><p>{text('Số cần nạp dự kiến','Estimated funding needed')}: {requiredUsdc} USDC. {text('Sau khi nạp, hệ thống kiểm tra lại số dư, gas và chiến dịch trước khi xin chữ ký mua.','After funding, the balance, gas and campaign are checked again before requesting a purchase signature.')}</p><button type="button" className="btn btn-primary" disabled={busy || unresolved} onClick={onContinueCheckout}>{text('Kiểm tra số dư và tiếp tục mua','Check balance and continue buying')}</button></div>}
    </dialog>, document.body);
};

/** Mainnet exposes a receiving address and an external bridge; no internal funding transaction. */
export const FundingModal:React.FC<FundingModalProps> = props=>{
 const {account}=useWeb3(),{language}=useLanguage();
 if(!ARC_IS_MAINNET)return <TestnetFundingModal {...props}/>;
 if(!props.isOpen)return null;
 if(account)return <WalletReceive account={account} onClose={props.onClose}>{props.onContinueCheckout&&<button type="button" className="btn btn-primary" onClick={props.onContinueCheckout}>{language==='en'?'Check balance and continue':'Kiểm tra số dư và tiếp tục'}</button>}</WalletReceive>;
 return <DialogSurface label={language==='en'?'Receive USDC':'Nhận USDC'} onClose={props.onClose}><p>{language==='en'?'Connect a wallet to receive USDC on Arc Mainnet.':'Kết nối ví để nhận USDC trên Arc Mainnet.'}</p></DialogSurface>;
};
