import {store,CampaignRecord} from '../db/store';
import {config} from '../config';
import type {PublicProjectionState} from '../db/rowPersistence';
export const validSellerId=(id:string)=>/^[A-Za-z0-9_-]{1,128}$/.test(id)&&!['__proto__','prototype','constructor'].includes(id);
export const sellerProfilePath=(id:string)=>'#seller-profile-'+encodeURIComponent(id);
export function publicSellerLink(c:CampaignRecord,state:PublicProjectionState=store.readPublicProjectionState({campaignId:c.id},config.arcChainId,config.hubAddress)):{id?:string;profilePath?:string}{
 c=state.campaigns[c.id];if(!c)return {};const profile=state.users[c.sellerId]?.sellerProfile;
 return c.visibility==='PUBLIC'&&profile&&validSellerId(c.sellerId)?{id:c.sellerId,profilePath:sellerProfilePath(c.sellerId)}:{};
}
