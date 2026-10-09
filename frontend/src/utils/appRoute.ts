/** Fragment routes share the same identifiers as existing generated links. */
export type OperatorDealView = "OVERVIEW" | "ORDERS" | "TRANSACTIONS" | "SETTLEMENT" | "REFUNDS" | "DISPUTES" | "AUDIT";
export type OperatorDealSelection = { id: string; view: OperatorDealView };
export type AppRoute =
  | { kind: "tab"; tab: "explore" | "orders" | "seller" | "operator" | "docs" }
  | { kind: "campaign" | "public-seller"; id: string }
  | { kind: "support"; path: string }
  | ({ kind: "operator-deal" } & OperatorDealSelection)
  | { kind: "not-found" };

export function parseAppHash(hash: string): AppRoute {
  switch (hash) {
    case "": case "#": case "#explore": return { kind: "tab", tab: "explore" };
    case "#orders": return { kind: "tab", tab: "orders" };
    case "#seller": return { kind: "tab", tab: "seller" };
    case "#operator": return { kind: "tab", tab: "operator" };
    case "#docs": return { kind: "tab", tab: "docs" };
  }
  const operatorDeal = /^#operator\/deals\/([A-Za-z0-9_-]{1,180})(?:\/(overview|orders|transactions|settlement|refunds|disputes|audit))?$/.exec(hash);
  if (operatorDeal) return { kind: "operator-deal", id: operatorDeal[1], view: (operatorDeal[2] || "overview").toUpperCase() as OperatorDealView };
  if (/^#campaign-[A-Za-z0-9_-]{1,180}$/.test(hash)) return { kind: "campaign", id: hash.slice("#campaign-".length) };
  if (/^#seller-profile-[A-Za-z0-9_-]{1,128}$/.test(hash)) return { kind: "public-seller", id: hash.slice("#seller-profile-".length) };
  if (hash === "#support" || /^#support-ticket-tkt_[a-f0-9-]{36}$/.test(hash) || /^#support-order-[A-Za-z0-9_-]{1,180}$/.test(hash)) return { kind: "support", path: hash.slice(1) };
  return { kind: "not-found" };
}

export function operatorDealHash(selection: OperatorDealSelection | null): string {
  return selection ? "#operator/deals/" + selection.id + "/" + selection.view.toLowerCase() : "#operator";
}
