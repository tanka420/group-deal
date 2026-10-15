import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWeb3 } from '../context/Web3Context';
import { useLanguage } from '../context/LanguageContext';
import { WalletManager } from '../components/WalletManager';
import { FundingModal } from '../components/FundingModal';

export function WalletPage({onOpenAuth}:{onOpenAuth:()=>void}) {
  const {user,token}=useAuth(),{account,usdcBalance,balanceError}=useWeb3(),{language}=useLanguage(),en=language==='en';
  const [funding,setFunding]=useState(false);
  return <section className="account-page"><h1>{en?'Wallet':'Ví'}</h1><p>Arc Testnet · USDC</p>
    <div className="glass-card wallet-overview"><h2>{en?'Selected wallet':'Ví đang chọn'}</h2><p className="font-mono wallet-address">{account||(en?'No active wallet':'Chưa có ví hoạt động')}</p>
      <p>{en?'Wallet balance':'Số dư ví'}: <strong>{usdcBalance===null?(en?'Unavailable':'Chưa có dữ liệu'):`${usdcBalance} USDC`}</strong>{balanceError&&<span> · {en?'Update pending':'Chưa cập nhật'}</span>}</p>
      <button className="btn btn-primary" onClick={()=>setFunding(true)}>{en?'Fund USDC':'Nạp USDC'}</button>
      {!user&&<button className="btn btn-secondary" onClick={onOpenAuth}>{en?'Sign in':'Đăng nhập'}</button>}
    </div>
    {user&&token&&<WalletManager key={user.id} token={token} userId={user.id} embedded/>}
    <FundingModal isOpen={funding} onClose={()=>setFunding(false)}/>
  </section>;
}
