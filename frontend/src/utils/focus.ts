/** Keep page focus clear of the measured app header and the mobile purchase bar. */
export function revealFocus(element:HTMLElement|null){
  if(!element||!element.isConnected||element.closest('dialog,[role="dialog"],[aria-modal="true"]'))return;
  const purchaseBar=document.querySelector<HTMLElement>(".deal-join-cta"),barRect=purchaseBar?.getBoundingClientRect();
  if(purchaseBar?.contains(element)&&getComputedStyle(purchaseBar).position==="fixed")return;
  // Native focus can leave a step partially clipped in a horizontal scroll container.
  element.scrollIntoView({block:"nearest",inline:"nearest",behavior:"instant"});
  const headerElement=document.querySelector<HTMLElement>(".header");
  const header=headerElement&&["sticky","fixed"].includes(getComputedStyle(headerElement).position)?headerElement.getBoundingClientRect():null;
  const bottomInset=purchaseBar&&getComputedStyle(purchaseBar).position==="fixed"&&barRect&&barRect.top<innerHeight?Math.max(0,innerHeight-barRect.top):0;
  const top=Math.max(0,header?.bottom||0)+16,bottom=innerHeight-bottomInset-16,rect=element.getBoundingClientRect();
  const delta=rect.top<top?rect.top-top:rect.bottom>bottom?Math.min(rect.top-top,rect.bottom-bottom):0;
  if(delta)window.scrollBy({top:delta,behavior:"instant"});
}
export function focusPageElement(element:HTMLElement|null){
  if(!element)return;
  element.focus({preventScroll:true});revealFocus(element);
}
