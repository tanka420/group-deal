/** Illustrative design content, derived from the existing Testnet UI fixture. */
export const examples=[
 {id:'master',title:'Studio Design Toolkit',category:'Thiết kế',categoryEn:'Design',description:'Bộ tài nguyên thiết kế dành cho giao diện, tài liệu và các dự án sản phẩm số.',descriptionEn:'A design resource collection for interfaces, documentation and digital product projects.',edition:'Personal toolkit',prices:[120,105,89,75],people:37,kind:'kit',color:'blue'},
 {id:'layout',title:'Product Launch Templates',category:'Template',categoryEn:'Templates',description:'Mẫu tài liệu để lên kế hoạch, sắp xếp nội dung và chuẩn bị giới thiệu sản phẩm.',descriptionEn:'Templates for planning, organizing content and preparing a product launch.',edition:'Template collection',prices:[80,70,60,50],people:24,kind:'planner',color:'violet'},
 {id:'guide',title:'Design Systems Handbook',category:'Sách số',categoryEn:'Ebooks',description:'Tài liệu thực hành về cách tổ chức token, component và quy chuẩn giao diện.',descriptionEn:'A practical guide to organizing tokens, components and interface conventions.',edition:'Digital handbook',prices:[45,39,33,28],people:12,kind:'book',color:'green'}
];
export function exampleCampaigns(masterFixture) {
 return examples.map(item=>{
  const base=masterFixture(),index=item.people>=20?1:0;
  const campaign={...base.campaign,id:item.id,title:item.title,description:item.description,category:item.category,thumbnailUrl:'/design/art/'+item.id+'.svg',tiers:[1,20,50,100].map((threshold,i)=>({threshold,price:String(item.prices[i]*1000000)})),currentUnlockedTier:index,totalBuyerCount:item.people,totalUnitsCommitted:item.people,totalGrossCommitted:String(item.people*item.prices[index]*1000000),earlyRebateEnabled:false,product:{...base.campaign.product,title:item.title,description:item.description,vendor:'GroupDeal Design Preview',license:{...base.campaign.product.license,edition:item.edition,usageTerms:'Điều khoản minh họa cho bản chọn hướng thiết kế; không phải sản phẩm đang bán.'}}};
  return {...item,campaign,seller:{...base.seller,displayName:'GroupDeal Design Preview',bio:'Sản phẩm và số liệu minh họa.'}};
 });
}
