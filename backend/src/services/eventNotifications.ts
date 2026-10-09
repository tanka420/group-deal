import {store,EventJournalRecord} from "../db/store";
import {projectionId} from "./deploymentBindings";
import {journalNotificationSource} from "./notificationSource";
import {NotificationService} from "./notificationService";
import {notifySellerFollowers} from './followNotifications';

/** Called inside the verified indexer transaction after its journal row exists. No financial writes. */
export function notifyJournalEvent(row:EventJournalRecord,target=store):void {
  const source=journalNotificationSource(row),args=row.payload;
  if(args.campaignId===undefined)return;
  const campaignId=projectionId(target.db,"campaigns",String(args.campaignId)),campaign=target.db.campaigns[campaignId];if(!campaign)return;
  notifySellerFollowers(row,campaignId,target);
  const order=args.orderId===undefined?undefined:target.db.orders[projectionId(target.db,"orders",String(args.orderId))];
  const send=(userId:string|undefined,type:string,title:string,message:string,titleEn:string,messageEn:string,link:string)=>{
    if(!userId)return;NotificationService.create(userId,{type,title,message,translations:{en:{title:titleEn,message:messageEn}},source,link,dedupeKey:`${row.id}:${type}`},target);
  };
  const buyers=()=>new Set(Object.values(target.db.orders).filter(o=>o.campaignId===campaignId).map(o=>o.buyerAccountId));
  const campaignNotice=(type:string,title:string,message:string,titleEn:string,messageEn:string)=>{
    send(campaign.sellerId,type,title,message,titleEn,messageEn,"#seller");for(const id of buyers())send(id,type,title,message,titleEn,messageEn,"#orders");
  };
  const orderNotice=(type:string,title:string,message:string,titleEn:string,messageEn:string)=>{
    send(campaign.sellerId,type,title,message,titleEn,messageEn,"#seller");send(order?.buyerAccountId,type,title,message,titleEn,messageEn,"#orders");
  };
  switch(row.eventName){
    case "CampaignCreated":
      // Unbound chain records must not guess a seller account from a payout address.
      if(campaign.projectionOrigin!=="CHAIN_UNBOUND")send(campaign.sellerId,"CAMPAIGN_PUBLISHED","Chiến dịch đã được xác nhận trên Arc",`Campaign #${campaignId} đã có sự kiện tạo chiến dịch trên Arc.`,"Campaign published on Arc",`Campaign #${campaignId} has a verified creation event on Arc.`,"#seller");break;
    case "CampaignTermsUpdated":campaignNotice("CAMPAIGN_TERMS_UPDATED","Điều khoản chain đã thay đổi",`Campaign #${campaignId} có hash điều khoản mới trên Arc. Kiểm tra trạng thái duyệt trước khi tham gia.`,"Campaign terms changed on chain",`Campaign #${campaignId} has a new terms hash on Arc. Check the review status before joining.`);break;
    case "CommitmentMade":orderNotice("ORDER_COMMITTED","Cam kết mua đã được xác nhận",`Order #${order?.id} đã được xác nhận trên Arc cho campaign #${campaignId}.`,"Commitment confirmed",`Order #${order?.id} was confirmed on Arc for campaign #${campaignId}.`);break;
    case "TierUnlocked":campaignNotice("TIER_UNLOCKED","Nhóm đã mở mốc giá mới",`Campaign #${campaignId} đã mở thêm một mốc giá trên Arc; giá cuối sẽ được xác định khi finalize.`,"A new price tier unlocked",`Campaign #${campaignId} unlocked a new price tier on Arc; finalization will determine the clearing price.`);break;
    case "CampaignFinalized":campaignNotice("CAMPAIGN_FINALIZED","Giá nhóm đã được chốt",`Campaign #${campaignId} đã chốt giá cuối trên Arc. Kiểm tra quyền rebate và giao hàng trong đơn.`,"Group price finalized",`Campaign #${campaignId} finalized its clearing price on Arc. Check rebate and delivery rights in your orders.`);break;
    case "DeliveryRecorded":orderNotice("ORDER_DELIVERED","Đã ghi nhận bằng chứng giao hàng",`Order #${order?.id} đã có bằng chứng trên Arc. Kiểm tra tài nguyên và thời hạn tranh chấp trong đơn.`,"Delivery proof recorded",`Order #${order?.id} has a delivery proof on Arc. Check the resource and dispute deadline in your order.`);break;
    case "DeliveryBreached":orderNotice("DELIVERY_BREACHED","Đã phân bổ quyền hoàn tiền do quá SLA",`Order #${order?.id} có phân bổ hoàn tiền trên Arc; kiểm tra số tiền còn có thể rút.`,"Refund allocated after delivery deadline",`Order #${order?.id} has a refund allocation on Arc; check the remaining claimable amount.`);break;
    case "OrderConfirmed":orderNotice("ORDER_CONFIRMED","Order đã được quyết toán",`Order #${order?.id} đã phân bổ proceeds cho seller trên Arc; phân bổ khác với đã rút tiền.`,"Order settled",`Order #${order?.id} allocated seller proceeds on Arc; allocation does not mean withdrawal.`);break;
    case "OrderDisputed":
      orderNotice("ORDER_DISPUTED","Đã ghi nhận mở tranh chấp",`Order #${order?.id} đã phát sự kiện mở tranh chấp trên Arc. Kiểm tra trạng thái hiện tại và quyền thao tác trong đơn.`,"Dispute opening recorded",`Order #${order?.id} emitted a dispute-opening event on Arc. Check the current status and available actions in the order.`);
      if(order?.deliveryStatus==="DISPUTED")for(const operator of Object.values(target.db.users).filter(u=>u.roles.includes("operator")))send(operator.id,"OPERATOR_DISPUTE_REVIEW","Có tranh chấp cần xử lý",`Order #${order.id} đang chờ phán quyết của operator.`,"Dispute needs review",`Order #${order.id} is awaiting an operator decision.`,"#operator");break;
    case "DisputeResolved":orderNotice("DISPUTE_RESOLVED","Tranh chấp đã được phân xử",`Order #${order?.id} đã cập nhật phân bổ buyer/seller trên Arc. Kiểm tra quyền rút tiền trong đơn.`,"Dispute resolved",`Order #${order?.id} updated buyer/seller allocations on Arc. Check withdrawal rights in the order.`);break;
    case "FundsClaimed":{
      const buyer=Number(args.claimType)===0,type=buyer?"BUYER_FUNDS_CLAIMED":"SELLER_FUNDS_CLAIMED";
      const recipient=String(args.recipient).toLowerCase();
      const ids=buyer?new Set(Object.values(target.db.orders).filter(o=>o.campaignId===campaignId&&o.buyerPrincipal.toLowerCase()===recipient&&o.transactionHistory?.some(t=>t.action==="BuyerFundsClaimed"&&t.txHash.toLowerCase()===row.txHash.toLowerCase()&&t.logIndex===row.logIndex)).map(o=>o.buyerAccountId)):new Set([campaign.sellerId]);
      for(const id of ids)send(id,type,"Giao dịch rút tiền đã được xác nhận",`Campaign #${campaignId} đã có giao dịch rút tiền ${buyer?"buyer":"seller"} được xác nhận trên Arc. Kiểm tra số tiền và các order trong lịch sử giao dịch.`,"Withdrawal confirmed",`Campaign #${campaignId} has a confirmed ${buyer?"buyer":"seller"} withdrawal on Arc. Check the amount and orders in transaction history.`,buyer?"#orders":"#seller");break;
    }
    case "EmergencyCancelled":campaignNotice("CAMPAIGN_CANCELLED","Chiến dịch đã bị hủy khẩn cấp",`Campaign #${campaignId} đã được Security Authority hủy trên Arc. Kiểm tra phần escrow chưa phân bổ và quyền hoàn tiền theo từng order.`,"Campaign cancelled by Security Authority",`Campaign #${campaignId} was cancelled on Arc. Check unallocated escrow and refund rights for each order.`);break;
  }
}
