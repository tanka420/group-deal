/** Display time consistently; API timestamps remain unchanged. */
export function dateTime(value:unknown,language:string,seconds=false):string {
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<=0)return '—';
 const stamp=seconds?value*1000:value;if(stamp>8640000000000000)return '—';
 return new Intl.DateTimeFormat(language==='en'?'en-GB':'vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(stamp);
}
