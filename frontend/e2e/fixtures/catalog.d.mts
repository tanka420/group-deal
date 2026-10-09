export function emptyCatalog(url: string, hubAddress?: string): {
  version: '1.0'; chainId: 5042002; hubAddress: string;
  amountEncoding: 'USDC base-unit integer strings (6 decimals)'; campaigns: never[];
  pagination: {limit: number; sort: string; nextCursor: null; hasMore: false};
  filters: {q: string; category: string; status: string | null; metric: string | null; sort: string};
  categories: never[]; categoriesScope: 'PUBLIC_CURRENT_DEPLOYMENT';
  summary: {scope: 'MATCHING_PUBLIC_CURRENT_DEPLOYMENT'; campaignCount: 0; openCampaignCount: 0; totalGrossCommitted: '0'; projection: {source: 'INDEXER'; financialStateChainVerified: false; fetchedAt: number}};
};
