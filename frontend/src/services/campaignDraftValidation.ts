import { ethers } from "ethers";
import {UiError,uiMessage} from "../utils/uiMessage";
export type EarlyRebateMode="FIXED"|"PERCENTAGE";

export type PricingFields = {
  title: string;
  tiers: { threshold: number; priceUSDC: string }[];
  maxPerAccount: string;
  inventory: string;
  duration: string;
  early: boolean;
  earlySlots: string;
  earlyAmount: string;
  earlyMode?: EarlyRebateMode;
  earlyPercent?: string;
  protocolVersion?: 1|2;
};
export type PricingErrors = Record<string, string>;

export function parseEarlyRebatePercent(value:string):number|null{if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(value))return null;const [whole,fraction='']=value.split('.'),bps=Number(whole)*100+Number(fraction.padEnd(2,'0'));return bps>0&&bps<=10000?bps:null;}
export function formatEarlyRebatePercent(bps:number):string{if(!Number.isSafeInteger(bps)||bps<0||bps>10000)return '—';const fraction=String(bps%100).padStart(2,'0').replace(/0+$/,'');return String(Math.floor(bps/100))+(fraction?'.'+fraction:'');}
export function earlyRebateDraftFields(form:Pick<PricingFields,'early'|'earlySlots'|'earlyAmount'|'earlyMode'|'earlyPercent'>){return {earlyRebateEnabled:form.early,earlySlotsCount:form.early?Number(form.earlySlots):0,earlyRebateAmountUSDC:form.early&&form.earlyMode!=='PERCENTAGE'?form.earlyAmount:'0',earlyRebateBps:form.early&&form.earlyMode==='PERCENTAGE'?(parseEarlyRebatePercent(form.earlyPercent??'')??0):0};}
export function earlyRebateFormFromDraft(input:{earlyRebateEnabled:boolean;earlyRebateAmountUSDC:string;earlyRebateBps:number},protocolVersion:1|2){const invalid=()=>{throw new UiError(uiMessage('Bản nháp này cần editor/provider phù hợp; chưa chuyển đổi điều khoản tự động.','This draft needs a compatible editor or provider. Its terms have been preserved.'))};let fixed:bigint;try{fixed=ethers.parseUnits(input.earlyRebateAmountUSDC,6)}catch{return invalid()}if(!Number.isSafeInteger(input.earlyRebateBps)||input.earlyRebateBps<0||input.earlyRebateBps>10000||fixed<0n||input.earlyRebateBps>0&&(protocolVersion!==2||!input.earlyRebateEnabled||fixed!==0n))return invalid();return {earlyMode:(input.earlyRebateBps>0?'PERCENTAGE':'FIXED') as EarlyRebateMode,earlyAmount:input.earlyRebateEnabled?input.earlyRebateAmountUSDC:'0',earlyPercent:formatEarlyRebatePercent(input.earlyRebateBps)};}
export function earlyRebateDescription(input:{earlyRebateEnabled?:boolean;earlyRebateBps?:number;earlyRebateAmountUSDC?:string;earlyRebateAmount?:string},language:'vi'|'en',protocolVersion:1|2=1){if(!input.earlyRebateEnabled)return language==='vi'?'Không bật':'Off';if((input.earlyRebateBps??0)>0)return formatEarlyRebatePercent(input.earlyRebateBps!)+(language==='vi'?'% giá khóa của đơn vị đầu':'% of the first unit’s locked price');let amount=input.earlyRebateAmountUSDC;try{amount??=ethers.formatUnits(input.earlyRebateAmount??'0',6)}catch{amount='—'}return (protocolVersion===2?(language==='vi'?'Tối đa ':'Up to '):'')+amount+(language==='vi'?' USDC cho đơn vị đầu':' USDC for the first unit');}

// Presentation validation. The server still validates every draft and publication.
export function validateCampaignPricing(form: PricingFields, language: "vi" | "en" = "vi"): PricingErrors {
  const errors: PricingErrors = {};
  const text = (vi: string, en: string) => language === "en" ? en : vi;
  const locale = language === "en" ? "en-US" : "vi-VN";
  const integer = (id: string, value: string, min: number, max: number) => {
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
      errors[id] = text(`Nhập số nguyên từ ${min.toLocaleString(locale)} đến ${max.toLocaleString(locale)}.`, `Enter an integer from ${min.toLocaleString(locale)} to ${max.toLocaleString(locale)}.`);
      return null;
    }
    return Number(value);
  };
  const price = (id: string, value: string) => {
    if (!/^\d+(?:\.\d{1,6})?$/.test(value)) {
      errors[id] = text("Nhập USDC hợp lệ, tối đa 6 chữ số thập phân.", "Enter a valid USDC amount with up to 6 decimal places.");
      return null;
    }
    let amount: bigint;
    try { amount = ethers.parseUnits(value, 6); }
    catch { errors[id] = text("Số tiền vượt giới hạn xử lý; kiểm tra lại giá USDC.", "The amount exceeds the supported range; review the USDC price."); return null; }
    if (amount <= 0n || amount > ethers.MaxUint256) {
      errors[id] = text("Giá phải lớn hơn 0 và nằm trong giới hạn số tiền của contract.", "The price must be greater than 0 and within the contract amount limit.");
      return null;
    }
    return amount;
  };
  if (!form.title.trim() || form.title.trim().length > 180) errors["deal-title"] = text("Tên deal cần từ 1 đến 180 ký tự.", "The deal name must contain 1 to 180 characters.");
  const max = integer("deal-max", form.maxPerAccount, 1, 10000);
  const inventory = integer("deal-inventory", form.inventory, 0, 10000000);
  integer("deal-duration", form.duration, 1, 30);
  if (form.tiers.length < 2 || form.tiers.length > 5) errors["tier-price-0"] = text("Deal cần từ 2 đến 5 bậc giá.", "A deal needs 2 to 5 pricing tiers.");
  const amounts = form.tiers.map((tier, index) => price(`tier-price-${index}`, tier.priceUSDC));
  form.tiers.forEach((tier, index) => {
    const id = `tier-threshold-${index}`;
    if (!Number.isSafeInteger(tier.threshold) || tier.threshold < 1 || index === 0 && tier.threshold !== 1) errors[id] = text("Ngưỡng đầu là 1; các ngưỡng phải là số nguyên dương.", "The first threshold is 1; every threshold must be a positive integer.");
    else if (index > 0 && tier.threshold <= form.tiers[index - 1].threshold) errors[id] = text("Ngưỡng phải lớn hơn bậc trước.", "The threshold must exceed the previous tier.");
    if (index > 0 && amounts[index] !== null && amounts[index - 1] !== null && amounts[index]! >= amounts[index - 1]!) errors[`tier-price-${index}`] = text("Giá phải nhỏ hơn giá bậc trước.", "The price must be lower than the previous tier price.");
    if (inventory !== null && inventory > 0 && tier.threshold > inventory) errors[id] = text("Ngưỡng không được vượt tồn kho.", "The threshold must not exceed inventory.");
  });
  if (max !== null && inventory !== null && inventory > 0 && max > inventory) errors["deal-max"] = text("Giới hạn mỗi account không được vượt tồn kho.", "The per-account limit must not exceed inventory.");
  if (form.early) {
    integer("deal-early-slots", form.earlySlots, 1, 4294967295);
    const mode=form.earlyMode??'FIXED';
    if(!['FIXED','PERCENTAGE'].includes(mode))errors['deal-early-mode']=text('Chọn cách tính rebate thêm.','Choose an early rebate method.');
    else if(mode==='PERCENTAGE'){
      if(form.protocolVersion!==2)errors['deal-early-mode']=text('Môi trường hiện tại chỉ hỗ trợ rebate cố định bằng USDC.','This environment only supports a fixed USDC rebate.');
      if(parseEarlyRebatePercent(form.earlyPercent??'')===null)errors['deal-early-percent']=text('Nhập từ 0.01% đến 100%, tối đa 2 chữ số thập phân.','Enter 0.01% to 100% with up to 2 decimal places.');
    }else{
      const bonus=price('deal-early-amount',form.earlyAmount),limit=form.protocolVersion===2?amounts[0]:amounts[amounts.length-1];
      if(bonus!==null&&limit!==null&&limit!==undefined&&bonus>limit)errors['deal-early-amount']=form.protocolVersion===2?text('Rebate cố định không được vượt giá bậc đầu.','The fixed rebate must not exceed the first tier price.'):text('Deployment v1 yêu cầu rebate thêm không vượt giá bậc thấp nhất.','Deployment v1 requires the extra rebate not to exceed the lowest tier price.');
    }
  }
  return errors;
}
