import {config} from '../config';
import {store} from '../db/store';
import {pagePublicCampaigns} from './publicPagination';
import {publicCampaignDto,publicWidgetDto} from './publicCampaign';

/** Matching public projections across all pages; never an allocation or chain proof. */
export function publicCatalog(query:unknown){
 const state=store.readPublicProjectionState({},config.arcChainId,config.hubAddress),page=pagePublicCampaigns(Object.values(state.campaigns),query,undefined,state),fetchedAt=Date.now();
 const cards=new Map(page.matching.map(c=>[c.id,publicWidgetDto(c,state)]));
 let gross=0n;
 for(const c of page.matching){
  if(typeof c.totalGrossCommitted!=='string'||! /^(0|[1-9]\d{0,77})$/.test(c.totalGrossCommitted)||BigInt(c.totalGrossCommitted)>=(1n<<256n))throw new Error('PROJECTION_UNAVAILABLE');
  gross+=BigInt(c.totalGrossCommitted);
 }
 return {
  hubAddress:config.hubAddress,
  campaigns:page.selected.map(c=>({...publicCampaignDto(c,state),card:cards.get(c.id)!})),
  pagination:page.pagination,filters:page.filters,
  categories:page.categories,categoriesScope:'PUBLIC_CURRENT_DEPLOYMENT' as const,
  summary:{scope:'MATCHING_PUBLIC_CURRENT_DEPLOYMENT' as const,campaignCount:page.matching.length,openCampaignCount:[...cards.values()].filter(c=>!c.purchaseHeld).length,totalGrossCommitted:gross.toString(),projection:{source:'INDEXER' as const,financialStateChainVerified:false as const,fetchedAt}},
 };
}
