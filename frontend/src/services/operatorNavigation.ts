export const operatorPaths={DEALS:'deals',DISPUTES:'disputes',VERIFICATIONS:'verifications',RECONCILIATION:'reconciliation',LOGS:'audit',OUTBOX:'outbox',OPERATIONS:'operations',LEGACY:'recovery',USERS:'users',PERMISSIONS:'permissions',SETTINGS:'settings',SUPPORT:'support'} as const;
export type OperatorSection=keyof typeof operatorPaths;
export function operatorSection(path=window.location.pathname):OperatorSection {const part=path.split('/')[2];return (Object.keys(operatorPaths) as OperatorSection[]).find(k=>operatorPaths[k]===part)??'DISPUTES';}
export function operatorPath(section:OperatorSection){return '/admin/'+operatorPaths[section];}
export function readDirectoryQuery(){const p=new URLSearchParams(window.location.search),q=(p.get('q')??'').slice(0,180),raw=p.get('role');return {q,role:(['buyer','seller','operator'].includes(raw??'')?raw:'ALL') as import('./operatorAdministration').RoleFilter};}
export function directoryPath(q:string,role:string){const p=new URLSearchParams();if(q.trim())p.set('q',q.trim());if(role!=='ALL')p.set('role',role);return '/admin/users'+(p.size?'?'+p:'');}
export function accountReturnPath(){const back=new URLSearchParams(window.location.search).get('returnTo');return back&&/^\/admin\/users(?:\?|$)/.test(back)&&!/[\\#]/.test(back)?back:'/admin/users';}
