import {ethers} from 'ethers';
import {store,CampaignRecord} from '../db/store';
import {config} from '../config';
import {accessiblePublicCampaign,canonicalCampaignUrl,publicWidgetDto} from './publicCampaign';
import {validSellerId,sellerProfilePath} from './publicSellerIdentity';
import {readPublicSeller} from '../../../shared/publicSeller.mjs';
import type {PublicProjectionState} from '../db/rowPersistence';
import {publicLeaf} from './publicMetadata';
export function publicSellerCampaigns(id:string,state?:PublicProjectionState):CampaignRecord[] {
 if(!validSellerId(id))throw new Error('NOT_FOUND');state??=store.readPublicProjectionState({sellerId:id},config.arcChainId,config.hubAddress);if(!Object.hasOwn(state.users,id)||!state.users[id].sellerProfile)throw new Error('NOT_FOUND');
 const campaigns=Object.values(state.campaigns).filter(c=>c.sellerId===id&&c.visibility==='PUBLIC'&&accessiblePublicCampaign(c.id,state));
 if(!campaigns.length)throw new Error('NOT_FOUND');
 return campaigns;
}
/** Counts cover visible campaigns of the current deployment only. No financial totals or invented rating. */
export function publicSellerDto(id:string){
 if(!validSellerId(id))throw Error('NOT_FOUND');const state=store.readPublicProjectionState({sellerId:id},config.arcChainId,config.hubAddress),campaigns=publicSellerCampaigns(id,state),profile=state.users[id].sellerProfile!;
 if(typeof profile.displayName!=='string'||!profile.displayName.trim()||profile.displayName.length>80||typeof profile.bio!=='string'||profile.bio.length>2000||!ethers.isAddress(profile.payoutWallet))throw new Error('PROJECTION_UNAVAILABLE');
 const payoutWallet=ethers.getAddress(profile.payoutWallet),payoutLinked=state.users[id].payoutCredentialLinked;
 const origin=canonicalCampaignUrl('seller-profile'),profileUrl=origin?new URL(origin).origin+'/'+sellerProfilePath(id):null;
 const snapshots=campaigns.map(c=>publicWidgetDto(c,state)),products=new Set(campaigns.flatMap(c=>typeof c.productSnapshot?.productId==='string'?[c.productSnapshot.productId]:[]));
 return readPublicSeller({id,displayName:profile.displayName,bio:profile.bio,payoutWallet,payoutWalletStatus:payoutLinked?'ACCOUNT_CREDENTIAL_LINKED':'UNVERIFIED',verifiedSellerBadge:publicLeaf(profile.verifiedSellerBadge??false,'boolean'),profileUrl,profilePath:sellerProfilePath(id),chainId:config.arcChainId,hubAddress:config.hubAddress,
  metrics:{scope:'PUBLIC_CURRENT_DEPLOYMENT' as const,publicCampaignCount:campaigns.length,openCampaignCount:snapshots.filter(s=>!s.purchaseHeld).length,finalizedCampaignCount:campaigns.filter(c=>c.status==='FINALIZED').length,cancelledCampaignCount:campaigns.filter(c=>c.status==='CANCELLED').length,productCount:products.size},
  projection:{source:'INDEXER',financialStateChainVerified:false,fetchedAt:Date.now()}},id,{chainId:config.arcChainId,hubAddress:config.hubAddress});
}
