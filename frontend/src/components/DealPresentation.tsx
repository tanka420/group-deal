import { useState } from "react";
import { CheckCircle2, Clock, ImageIcon, ShieldCheck } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { displayUSDC } from "../services/orderAccounting";

export type DealTier = { threshold: number; price: string };
export function useDealLanguage() {
  const { language } = useLanguage();
  return { language, text: (vi: string, en: string) => language === "en" ? en : vi };
}
export function PriceDisplay({ amount, large = false }: { amount: string; large?: boolean }) {
  const valid = /^\d+$/.test(amount);
  return <span className={`deal-price ${large ? "deal-price-large" : ""}`}><strong>{valid ? displayUSDC(amount) : "—"}</strong> <small>USDC</small></span>;
}
export function PriceTierRail({ tiers, current = 0, metric, count, preview = false, canUnlock = false, finalized = false }: { tiers: DealTier[]; current?: number; metric: string; count?: number; preview?: boolean; canUnlock?: boolean; finalized?: boolean }) {
  const { text } = useDealLanguage();
  const unit = metric === "BUYER_COUNT" ? text("tài khoản đủ điều kiện", "eligible accounts") : text("đơn vị cam kết", "committed units");
  return <section className="price-tier-rail" aria-label={text("Các bậc giá nhóm", "Group pricing tiers")}>
    <h3>{text("Tiến độ giá nhóm", "Group pricing progress")}</h3><p className="muted">{text("Mốc mở giá theo", "Pricing milestones by")} {unit}</p>
    <ol style={{ "--tier-count": tiers.length } as React.CSSProperties}>{tiers.map((tier, index) => <li key={index} className={!preview && index === current ? "tier-current" : !preview && index < current ? "tier-passed" : ""} aria-current={!preview && index === current ? "step" : undefined}>
      <span className="rail-dot" aria-hidden="true" />
      <PriceDisplay amount={tier.price} />
      <span>{tier.threshold}+</span>
      {!preview && index === current && <strong className="rail-current-label">{finalized?text("Bậc chốt", "Final tier"):canUnlock?text("Đang áp dụng", "Current tier"):text("Bậc đã mở", "Unlocked tier")}</strong>}
    </li>)}</ol>
    {!preview && canUnlock && !finalized && count !== undefined && tiers[current + 1] && <div className="tier-next"><p>{text("Cần thêm", "Another")} <strong>{Math.max(0, tiers[current + 1].threshold - count)}</strong> {unit} {text("để mở bậc tiếp theo.", "to unlock the next tier.")}</p><p>{text("Giá ở bậc tiếp theo", "Next tier price")}: <PriceDisplay amount={tiers[current + 1].price}/></p></div>}
  </section>;
}
export function DealKeyFacts({ product, slaSeconds }: { product: any; slaSeconds: number }) {
  const { text } = useDealLanguage(), license = product?.license;
  return <dl className="deal-key-facts"><div><dt>{text("Phiên bản nhận được", "Included edition")}</dt><dd>{license?.edition || "—"}</dd></div><div><dt>{text("Seat mỗi đơn vị", "Seats per unit")}</dt><dd>{Number.isSafeInteger(license?.seatsPerUnit) ? license.seatsPerUnit : "—"}</dd></div><div><dt>{text("Giao sau khi chốt deal", "Delivery after finalization")}</dt><dd>{[86400,172800].includes(slaSeconds) ? `${slaSeconds/3600} ${text("giờ", "hours")}` : "—"}</dd></div></dl>;
}
export function DealDeadline({ startTime, endTime, now, status }: { startTime?:number;endTime: number; now: number; status: string }) {
  const { text, language } = useDealLanguage();
  const pending=["ACTIVE","PUBLISHED"].includes(status)&&Number.isSafeInteger(startTime)&&now<startTime!&&startTime!<=endTime;
  const deadline=pending?startTime!:endTime,remaining=Math.max(0,deadline-now);
  const date = Number.isFinite(deadline) ? new Date(deadline * 1000) : null;
  const active = ["ACTIVE", "PUBLISHED"].includes(status) && now <= endTime;
  return <div className="deal-deadline"><Clock size={20} aria-hidden="true"/><div><span>{pending?text("Cam kết mở sau","Commitments open in"):active ? text("Đóng cam kết sau", "Commitments close in") : text("Thời điểm đóng cam kết", "Commitment deadline")}</span><strong>{active ? `${Math.floor(remaining / 86400)}${text(" ngày", "d")} ${Math.floor(remaining % 86400 / 3600)}${text(" giờ", "h")} ${Math.floor(remaining % 3600 / 60)}${text(" phút", "m")}` : text("Đã đóng", "Closed")}</strong>{date && <time dateTime={date.toISOString()}>{new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-GB", { year:"numeric", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", timeZoneName:"short" }).format(date)}</time>}</div></div>;
}
export function ProductGallery({ title, thumbnailUrl, media = [] }: { title: string; thumbnailUrl?: string; media?: { url: string; alt: string }[] }) {
  const { text } = useDealLanguage();
  const images = [{ url: thumbnailUrl || "", alt: title }, ...media].filter((item, index, list) => item.url && list.findIndex(other => other.url === item.url) === index);
  const [selected, setSelected] = useState(0), [failed, setFailed] = useState<string[]>([]);
  const item = images[selected] || images[0];
  return <section className="product-gallery" aria-label={text("Hình ảnh sản phẩm", "Product images")}><div className="product-gallery-main">{item && !failed.includes(item.url) ? <img src={item.url} alt={item.alt} onError={() => setFailed(old => [...old, item.url])}/> : <div className="gallery-empty"><ImageIcon size={40}/><span>{text("Chưa có ảnh hiển thị", "Image unavailable")}</span></div>}</div>{images.length > 1 && <div className="product-gallery-thumbs">{images.map((image, index) => <button className={selected === index ? "selected" : ""} key={image.url} aria-label={`${text("Xem ảnh", "View image")} ${index + 1}: ${image.alt}`} aria-pressed={selected === index} onClick={() => setSelected(index)}><img src={image.url} alt="" loading="lazy"/></button>)}</div>}</section>;
}
export function SellerIdentity({ seller }: { seller: { id?:string;profilePath?:string;displayName?: string; bio?: string; verifiedSellerBadge?: boolean; verifiedRightsBadge?: boolean } | null }) {
  const { text } = useDealLanguage();
  const profilePath=seller?.id&&/^[A-Za-z0-9_-]{1,128}$/.test(seller.id)&&seller.profilePath==='#seller-profile-'+seller.id?seller.profilePath:null;
  return <section className="seller-identity"><div className="seller-avatar" aria-hidden="true">{seller?.displayName?.slice(0, 1) || "S"}</div><div><strong>{profilePath?<a href={profilePath}>{seller?.displayName || text("Người bán", "Seller")}</a>:seller?.displayName || text("Người bán", "Seller")}</strong><div className="deal-badges">{seller?.verifiedSellerBadge && <span className="badge badge-verified-seller"><CheckCircle2 size={14}/>{text("Seller đã xác minh", "Verified seller")}</span>}{seller?.verifiedRightsBadge && <span className="badge badge-verified-rights"><ShieldCheck size={14}/>{text("Quyền phân phối đã duyệt", "Approved distribution rights")}</span>}</div>{seller?.bio && <p className="muted">{seller.bio}</p>}</div></section>;
}
export function LicenseSummary({ product, rights }: { product: any; rights?: any }) {
  const { text, language } = useDealLanguage();
  const license = product?.license;
  if (!license) return <section className="glass-card"><h2>{text("Sản phẩm và license", "Product and license")}</h2><p>{text("Chưa có phiên bản license đã ghim. Mua mới cần được kiểm tra bởi hệ thống.", "A pinned license version is unavailable. New purchases require verification.")}</p></section>;
  return <section className="glass-card product-deal-detail"><h2>{text("Sản phẩm và license đã ghim", "Pinned product and license")}</h2><dl className="detail-list"><dt>{text("Nhà cung cấp", "Vendor")}</dt><dd>{product.vendor}</dd><dt>License</dt><dd>{license.edition} · {license.seatsPerUnit} {text("seat/đơn vị", "seats/unit")}</dd><dt>{text("Phạm vi sử dụng", "Usage scope")}</dt><dd>{license.usageScope === "COMMERCIAL" ? text("Thương mại", "Commercial") : text("Cá nhân", "Personal")}</dd><dt>{text("Thời hạn", "Duration")}</dt><dd>{license.durationDays === null ? text("Theo license, không hết hạn tự động", "Per license; no automatic expiry") : `${license.durationDays} ${text("ngày", "days")}`}</dd><dt>{text("Kích hoạt trong", "Activation window")}</dt><dd>{license.activationWindowDays === null ? text("Theo điều khoản license", "Per license terms") : `${license.activationWindowDays} ${text("ngày sau giao hàng", "days after delivery")}`}</dd><dt>{text("Khu vực", "Regions")}</dt><dd>{license.regions?.join(", ")}</dd><dt>{text("Chuyển nhượng", "Transferability")}</dt><dd>{license.transferable ? text("Được phép theo license", "Permitted by license") : text("Không được chuyển nhượng", "Non-transferable")}</dd><dt>{text("Quyền phân phối", "Distribution rights")}</dt><dd>{rights?.status === "APPROVED" ? `${text("Đã duyệt đến", "Approved until")} ${rights.validUntil ? new Date(rights.validUntil * 1000).toLocaleDateString(language === "en" ? "en-GB" : "vi-VN") : "—"}` : text("Chưa đủ điều kiện mua mới", "Not eligible for new purchases")}</dd></dl><p>{license.usageTerms}</p><h3>{text("Yêu cầu tương thích", "Compatibility requirements")}</h3><ul>{product.requirements?.map((requirement: string) => <li key={requirement}>{requirement}</li>)}</ul><h3>{text("Hỗ trợ", "Support")}</h3><p>{product.supportPolicy}</p></section>;
}

/** Presentation only. Authorization rechecks account, rights and all financial terms on chain. */
export function purchaseIssue(campaign: any, now: number): "TERMS_REVIEW" | "NOT_STARTED" | "CLOSED" | "SOLD_OUT" | "RIGHTS" | null {
  if (campaign.termsPolicyReviewRequired) return "TERMS_REVIEW";
  if (!["PUBLISHED", "ACTIVE"].includes(campaign.status) || now > campaign.endTime) return "CLOSED";
  if (Number.isSafeInteger(campaign.startTime) && now < campaign.startTime) return "NOT_STARTED";
  if (campaign.inventoryLimit > 0 && campaign.totalUnitsCommitted >= campaign.inventoryLimit) return "SOLD_OUT";
  if (!campaign.product?.license || campaign.rights?.status !== "APPROVED" || !Number.isSafeInteger(campaign.rights.validUntil) || campaign.rights.validUntil < campaign.endTime + campaign.deliverySlaSeconds) return "RIGHTS";
  return null;
}
export function issueText(issue: ReturnType<typeof purchaseIssue>, text: (vi: string, en: string) => string): string | null {
  if (issue === "TERMS_REVIEW") return text("Tạm dừng mua mới: điều khoản trên chain cần được rà soát và gắn lại với product/license.", "New purchases are on hold: changed chain terms need a reviewed product/license binding.");
  if (issue === "NOT_STARTED") return text("Deal chưa mở cam kết theo thời điểm trong dữ liệu đang hiển thị. Kiểm tra lại trước khi tham gia.", "Commitments have not opened according to the displayed start time. Check again before joining.");
  if (issue === "CLOSED") return text("Deal đã đóng cam kết. Bạn vẫn có thể theo dõi đơn và quyền nhận tiền đã mua.", "This deal is closed for commitments. Existing orders and claims remain available.");
  if (issue === "SOLD_OUT") return text("Đã hết số lượng theo projection hiện tại.", "Sold out according to the current projection.");
  if (issue === "RIGHTS") return text("Product/license hoặc quyền phân phối chưa đủ điều kiện mua mới.", "The product/license or distribution rights are not eligible for new purchases.");
  return null;
}
