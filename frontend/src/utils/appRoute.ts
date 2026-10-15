/** Fragment routes share the same identifiers as existing generated links. */
export type OperatorDealView = "OVERVIEW" | "ORDERS" | "TRANSACTIONS" | "SETTLEMENT" | "REFUNDS" | "DISPUTES" | "AUDIT";
export type OperatorDealSelection = { id: string; view: OperatorDealView };
export type AppRoute =
  | { kind: "tab"; tab: "home" | "explore" | "orders" | "seller" | "operator" | "docs" | "wallet" | "account" | "notifications" }
  | { kind: "campaign" | "public-seller" | "order"; id: string }
  | { kind: "seller-section"; view: "orders"|"revenue"|"disputes"|"products"|"profile"|"integrations"|"create" }
  | {kind:"operator-section";view:string}
  | {kind:"operator-user";id:string}
  | {kind:"operator-support";path:string}
  | { kind: "support"; path: string }
  | ({ kind: "operator-deal" } & OperatorDealSelection)
  | { kind: "not-found" };

export function parseAppHash(hash: string): AppRoute {
  switch (hash) {
    case "": case "#": case "#explore": return { kind: "tab", tab: "explore" };
    case "#home": return {kind:"tab",tab:"home"};
    case "#orders": return { kind: "tab", tab: "orders" };
    case "#seller": return { kind: "tab", tab: "seller" };
    case "#operator": return { kind: "tab", tab: "operator" };
    case "#docs": return { kind: "tab", tab: "docs" };
    case "#wallet": return { kind: "tab", tab: "wallet" };
    case "#account": return { kind: "tab", tab: "account" };
    case "#notifications": return { kind: "tab", tab: "notifications" };
  }
  const operatorSection=/^#operator\/(deals|disputes|verifications|reconciliation|audit|outbox|operations|recovery|users|permissions|settings|support)$/.exec(hash);
  if(operatorSection)return {kind:'operator-section',view:operatorSection[1]};
  const operatorUser=/^#operator\/users\/([A-Za-z0-9_-]{1,128})$/.exec(hash);if(operatorUser)return {kind:'operator-user',id:operatorUser[1]};
  const operatorSupport=/^#operator\/support\/(tickets\/tkt_[a-f0-9-]{36}|orders\/[A-Za-z0-9_-]{1,180})$/.exec(hash);if(operatorSupport)return {kind:'operator-support',path:operatorSupport[1]};
  const operatorDeal = /^#operator\/deals\/([A-Za-z0-9_-]{1,180})(?:\/(overview|orders|transactions|settlement|refunds|disputes|audit))?$/.exec(hash);
  const seller=/^#seller\/(orders|revenue|disputes|products|profile|integrations|create)$/.exec(hash);
  if(seller)return {kind:'seller-section',view:seller[1] as Extract<AppRoute,{kind:'seller-section'}>['view']};
  if(/^#order-[A-Za-z0-9_-]{1,180}$/.test(hash))return {kind:'order',id:hash.slice(7)};
  if (operatorDeal) return { kind: "operator-deal", id: operatorDeal[1], view: (operatorDeal[2] || "overview").toUpperCase() as OperatorDealView };
  if (/^#campaign-[A-Za-z0-9_-]{1,180}$/.test(hash)) return { kind: "campaign", id: hash.slice("#campaign-".length) };
  if (/^#seller-profile-[A-Za-z0-9_-]{1,128}$/.test(hash)) return { kind: "public-seller", id: hash.slice("#seller-profile-".length) };
  if (hash === "#support" || /^#support-ticket-tkt_[a-f0-9-]{36}$/.test(hash) || /^#support-order-[A-Za-z0-9_-]{1,180}$/.test(hash)) return { kind: "support", path: hash.slice(1) };
  return { kind: "not-found" };
}

export function operatorDealHash(selection: OperatorDealSelection | null): string {
  return selection ? "#operator/deals/" + selection.id + "/" + selection.view.toLowerCase() : "#operator/deals";
}

export function routePath(route: AppRoute): string {
  if (route.kind === "tab") return route.tab === "operator" ? "/admin" : route.tab==='home'?'/':"/" + route.tab;
  if (route.kind === "campaign") return "/deals/" + route.id;
  if (route.kind === "order") return "/orders/" + route.id;
  if (route.kind === "seller-section") return '/seller/'+route.view;
  if (route.kind === "public-seller") return "/sellers/" + route.id;
  if (route.kind === "operator-deal") return "/admin/deals/" + route.id + "/" + route.view.toLowerCase();
  if(route.kind==='operator-section')return '/admin/'+route.view;
  if(route.kind==='operator-user')return '/admin/users/'+route.id;
  if(route.kind==='operator-support')return '/admin/support/'+route.path;
  if (route.kind === "support") return route.path === "support" ? "/support" : route.path.startsWith("support-ticket-") ? "/support/tickets/" + route.path.slice(15) : "/support/orders/" + route.path.slice(14);
  return "/not-found";
}

export function parseAppPath(path: string): AppRoute {
  if (path === "/") return parseAppHash("#home");
  const normalized = path.replace(/\/$/, "");
  if (normalized === "/admin") return parseAppHash("#operator");
  if (normalized.startsWith('/seller/')) return parseAppHash('#'+normalized.slice(1));
  if(normalized.startsWith('/admin/')&&!normalized.startsWith('/admin/deals/'))return parseAppHash('#operator/'+normalized.slice(7));
  if (normalized.startsWith("/admin/deals/")) return parseAppHash("#operator/deals/" + normalized.slice(13));
  if (normalized.startsWith("/deals/")) return parseAppHash("#campaign-" + normalized.slice(7));
  if (normalized.startsWith("/orders/")) return parseAppHash("#order-" + normalized.slice(8));
  if (normalized.startsWith("/sellers/")) return parseAppHash("#seller-profile-" + normalized.slice(9));
  if (normalized.startsWith("/support/tickets/")) return parseAppHash("#support-ticket-" + normalized.slice(17));
  if (normalized.startsWith("/support/orders/")) return parseAppHash("#support-order-" + normalized.slice(16));
  return parseAppHash("#" + normalized.slice(1));
}

export function readAppRoute(): AppRoute {
  // Existing notification, email and shared hash links remain valid.
  const legacy = parseAppHash(window.location.hash);
  return window.location.hash && window.location.hash !== '#main-content' ? legacy : parseAppPath(window.location.pathname);
}

export function appHref(value: string): string {
  if (value.startsWith("#") || value === "") return routePath(parseAppHash(value));
  return value;
}

export function navigateApp(value: string, replace = false) {
  const href = appHref(value);
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return;
  const url = new URL(href, window.location.origin);
  if (url.origin !== window.location.origin || parseAppPath(url.pathname).kind === "not-found") return;
  if (window.location.pathname + window.location.search + window.location.hash !== href) {
    window.history[replace ? "replaceState" : "pushState"](null, "", href);
  }
  window.dispatchEvent(new Event("groupdeal:navigate"));
}

export function migrateLegacyRoute() {
  if (!window.location.hash || parseAppHash(window.location.hash).kind === "not-found") return;
  const next = routePath(parseAppHash(window.location.hash));
  window.history.replaceState(window.history.state, "", next + window.location.search);
}
