import {store,EventJournalRecord,CampaignRecord} from '../db/store';
import {config} from '../config';
import {projectionId} from './deploymentBindings';
import {accessiblePublicCampaignRecord} from './publicCampaign';
import {sellerFollowSchema} from '../domain/sellerFollow';
import {sellerFollowKey} from './sellerFollowService';
import {journalNotificationSource,notificationSource} from './notificationSource';
import {NotificationService} from './notificationService';
const events:Record<string,[string,string,string,string]>={
 CampaignCreated:['Deal công khai mới từ seller','Seller có deal công khai mới đã gắn sự kiện tạo trên chain. Xem license và điều khoản trước khi tham gia.','A new public deal from a seller','A new public deal has a bound chain creation event. Check its license and terms before joining.'],
 TierUnlocked:['Deal đã mở thêm mốc giá','Một deal công khai bạn theo dõi đã mở mốc giá trên chain. Giá cuối chỉ được xác định khi chốt deal.','A deal unlocked a price tier','A public deal you follow unlocked a chain price tier. Finalization determines its clearing price.'],
 CampaignTermsUpdated:['Điều khoản deal đã thay đổi','Điều khoản chain của một deal công khai đã thay đổi. Xem trạng thái rà soát trước khi tham gia.','Deal terms changed','A public deal changed its chain terms. Check its review status before joining.'],
 CampaignFinalized:['Deal công khai đã chốt giá','Một deal công khai bạn theo dõi đã chốt giá trên chain. Xem trạng thái và điều khoản hiện tại trong deal.','A public deal finalized','A public deal you follow finalized on chain. Open the deal for its current status and terms.'],
 EmergencyCancelled:['Deal công khai đã bị hủy','Một deal công khai bạn theo dõi đã có sự kiện hủy từ Security Authority. Xem trạng thái hiện tại trong deal.','A public deal was cancelled','A public deal you follow has a Security Authority cancellation event. Check its current status in the deal.'],
};
/** Called only after a verified journal row and public owner binding exist. Never catch up old events. */
export function notifySellerFollowers(row:EventJournalRecord,campaignId?:string,target=store):void{
 const words=events[row.eventName];if(!words||row.chainId!==config.arcChainId||row.contractAddress.toLowerCase()!==config.hubAddress.toLowerCase()||row.payload.campaignId===undefined)return;
 // Verified journal and notification are assembled in the same unfinished domain transaction.
 const candidate=target.db.campaigns[campaignId??projectionId(target.db,'campaigns',String(row.payload.campaignId))],c=candidate&&accessiblePublicCampaignRecord(candidate,target.db.products)?candidate:undefined;if(!c||c.visibility!=='PUBLIC'||c.projectionOrigin!=='VERIFIED_PUBLISH')return;
 const basic=journalNotificationSource(row);if(basic.kind!=='CHAIN_EVENT')return;const source={...basic,kind:'SELLER_FOLLOW_EVENT' as const,campaignId:c.id,sellerId:c.sellerId};
 // Validate canonical event/campaign coordinates before any recipient is considered.
 if(!notificationSource(source,c.sellerId,{allowPendingCampaign:true,state:target.db}))return;
 for(const [key,value]of Object.entries(target.db.sellerFollows)){const p=sellerFollowSchema.safeParse(value);if(!p.success)continue;const f=p.data;if(key!==f.id||f.id!==sellerFollowKey(f.userId,f.sellerId)||f.sellerId!==c.sellerId||!f.following||!target.db.users[f.userId])continue;
  const selected=row.eventName==='CampaignCreated'?f.notifyNewDeals:f.notifyDealUpdates,since=row.eventName==='CampaignCreated'?f.newDealsSince:f.dealUpdatesSince;
  if(!selected||source.occurredAt<Math.floor(since/1000)*1000)continue;
  NotificationService.create(f.userId,{type:'SELLER_FOLLOW_'+row.eventName,title:words[0],message:words[1],translations:{en:{title:words[2],message:words[3]}},link:'#campaign-'+c.id,source,channel:'IN_APP_ONLY',dedupeKey:'seller-follow:'+row.id},target);
 }
}
/** Indexer-first publication: retry from that exact creation journal after API binding. */
export function notifyFollowedCampaignPublished(c:CampaignRecord):void{
 for(const row of Object.values(store.db.eventJournal))if(row.eventName==='CampaignCreated'&&row.chainId===config.arcChainId&&row.contractAddress.toLowerCase()===config.hubAddress.toLowerCase()&&row.txHash.toLowerCase()===c.txHash?.toLowerCase()&&String(row.payload.campaignId)===String(c.onchainCampaignId)&&String(row.payload.termsHash).toLowerCase()===c.creationTermsHash?.toLowerCase()&&String(row.payload.sellerPayoutWallet).toLowerCase()===c.sellerPayoutWallet.toLowerCase())notifySellerFollowers(row,c.id);
}
