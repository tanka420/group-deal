/** A dedicated admin bearer can reach only operational routes, never public account mutations. */
export function adminSessionPath(path:string,method:string):boolean {
 return /^\/api\/(?:operator|admin-auth)(?:\/|$)/.test(path)
  ||/^\/api\/support(?:\/|$)/.test(path)
  ||/^\/api\/orders\/[A-Za-z0-9_-]+\/messages$/.test(path)
  ||/^\/api\/products\/rights(?:\/[A-Za-z0-9_-]+)?\/review$/.test(path)
  ||path==='/api/auth/wallet/challenge'&&method==='POST'
  ||/^\/api\/transactions(?:\/|$)/.test(path);
}
