import {ARC_CHAIN_ID,ARC_EXPLORER,ARC_CHAIN_NAME} from '../../../shared/network.mjs';
import {pagePublicCampaigns} from "../services/publicPagination";
import {publicRateLimit} from "../middleware/publicRateLimit";
import { Router } from "express";
import { store } from "../db/store";
import { config } from "../config";
import { accessiblePublicCampaign,publicCampaignDto,publicWidgetDto,validPublicCampaignId } from "../services/publicCampaign";
import {validSellerId} from '../services/publicSellerIdentity';
import {renderPublicWidget,setWidgetHeaders,renderUnavailableWidget} from "../services/publicWidgetHtml";
import {publicSellerDto,publicSellerCampaigns} from '../services/publicSeller';
import {publicCatalog} from '../services/publicCatalog';

export const publicRouter=Router();
publicRouter.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
publicRouter.use(publicRateLimit());
const metadata=()=>({version:"1.0",network:config.arcChainId===ARC_CHAIN_ID?`${ARC_CHAIN_NAME} (${ARC_CHAIN_ID})`:"Local development ("+config.arcChainId+")",chainId:config.arcChainId,amountEncoding:"USDC base-unit integer strings (6 decimals)"});
publicRouter.get('/catalog',(req,res,next)=>{try{res.json({...metadata(),...publicCatalog(req.query)});}catch(error){next(error);}});
publicRouter.get('/sellers/:id',(req,res,next)=>{try{if(Object.keys(req.query).length)throw new Error('VALIDATION');res.json({...metadata(),seller:publicSellerDto(req.params.id)});}catch(error){next(error);}});
publicRouter.get('/sellers/:id/campaigns',(req,res,next)=>{try{if(!validSellerId(req.params.id))throw Error('NOT_FOUND');const state=store.readPublicProjectionState({sellerId:req.params.id},config.arcChainId,config.hubAddress),records=publicSellerCampaigns(req.params.id,state),page=pagePublicCampaigns(records,req.query,req.params.id,state);res.json({...metadata(),campaigns:page.selected.map(c=>({...publicCampaignDto(c,state),card:publicWidgetDto(c,state)})),pagination:page.pagination});}catch(error){next(error);}});
publicRouter.get("/campaigns",(req,res,next)=>{
  try{const state=store.readPublicProjectionState({},config.arcChainId,config.hubAddress),page=pagePublicCampaigns(Object.values(state.campaigns),req.query,undefined,state);res.json({...metadata(),campaigns:page.selected.map(c=>publicCampaignDto(c,state)),pagination:page.pagination});}catch(error){next(error);}
});
publicRouter.get("/campaigns/:id",(req,res)=>{
  if(!validPublicCampaignId(req.params.id)){res.status(404).json({code:'NOT_FOUND',error:'Campaign not found'});return;}const state=store.readPublicProjectionState({campaignId:req.params.id},config.arcChainId,config.hubAddress),campaign=accessiblePublicCampaign(req.params.id,state);
  if(!campaign){res.status(404).json({code:"NOT_FOUND",error:"Campaign not found"});return;}
  res.json({...metadata(),campaign:publicCampaignDto(campaign,state)});
});
// JSON projection for a consumer-rendered card. A JSON endpoint is not an iframe document.
publicRouter.get("/campaigns/:id/widget-data",(req,res)=>{
  if(!validPublicCampaignId(req.params.id)){res.status(404).json({code:'NOT_FOUND',error:'Campaign not found'});return;}const state=store.readPublicProjectionState({campaignId:req.params.id},config.arcChainId,config.hubAddress),campaign=accessiblePublicCampaign(req.params.id,state);
  if(!campaign){res.status(404).json({code:"NOT_FOUND",error:"Campaign not found"});return;}
  const dto=publicCampaignDto(campaign,state);
  res.json({...metadata(),...publicWidgetDto(campaign,state),thumbnailUrl:dto.thumbnailUrl,product:dto.product});
});

// Actual HTML card, intentionally separate from JSON and every authenticated app flow.
publicRouter.get("/campaigns/:id/widget",(req,res)=>{
  const language=req.query.lang===undefined||req.query.lang==="vi"?"vi":req.query.lang==="en"?"en":null;
  const nonce=setWidgetHeaders(res);
  if(!language||Object.keys(req.query).some(key=>key!=="lang")){res.status(400).type("html").send(renderUnavailableWidget("vi"));return;}
  try {
    if(!validPublicCampaignId(req.params.id)){res.status(404).type('html').send(renderUnavailableWidget(language));return;}const state=store.readPublicProjectionState({campaignId:req.params.id},config.arcChainId,config.hubAddress),campaign=accessiblePublicCampaign(req.params.id,state);
    if(!campaign){res.status(404).type("html").send(renderUnavailableWidget(language));return;}
    res.type("html").send(renderPublicWidget(publicWidgetDto(campaign,state),language,nonce));
  }catch{res.status(503).type("html").send(renderUnavailableWidget(language));}
});

publicRouter.use((_req,res)=>{res.status(404).json({code:"NOT_FOUND",error:"Public API route not found"});});
publicRouter.use((error:unknown,_req:any,res:any,_next:any)=>{if(error instanceof Error&&error.message==='NOT_FOUND'){res.status(404).json({code:'NOT_FOUND',error:'Public resource not found'});return;}if(error instanceof Error&&error.message==="VALIDATION"){res.status(400).json({code:"VALIDATION",error:"Invalid public query or cursor"});return;}res.status(503).json({code:"SERVICE_UNAVAILABLE",error:"Public campaign projection unavailable"});});
