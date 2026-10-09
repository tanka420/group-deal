import deployment from '../../../shared/contracts.json';
export type AccountRole='buyer'|'seller'|'operator';
export type RoleFilter='ALL'|AccountRole;
export type AccountRow={id:string;roles:AccountRole[];createdAt:number;loginMethod:'CIRCLE_EMAIL'|'EVM_WALLET'|null;activeWallet:string|null;displayName:string|null};
type Metadata={version:'1.0';operatorAccountId:string;chainId:number;hubAddress:string;revision:number;observedAt:number};
export type AccountDirectory=Metadata&{scope:'OPERATOR_ACCOUNT_DIRECTORY';role:RoleFilter;limit:number;users:AccountRow[];pagination:{nextCursor:string|null}};
export type RuntimeSettings=Metadata&{scope:'OPERATOR_RUNTIME_CONFIGURATION';usdcAddress:string;deploymentBlock:number;protocolVersion:number;operatorWallet:string;production:boolean;integrations:{circleConfigured:boolean;smtpConfigured:boolean;emailApiConfigured:boolean}};
const roles=['buyer','seller','operator'] as const;
const integer=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const address=(v:unknown):v is string=>typeof v==='string'&&/^0x[0-9a-fA-F]{40}$/.test(v);
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128&&!['constructor','prototype','__proto__'].includes(v);
function metadata(value:any,userId:string):Metadata{
 if(!value||value.version!=='1.0'||value.operatorAccountId!==userId||value.chainId!==deployment.chainId||!address(value.hubAddress)||value.hubAddress.toLowerCase()!==deployment.contracts.GroupDealHub.address.toLowerCase()||!integer(value.revision)||!integer(value.observedAt)||value.observedAt>8640000000000000)throw Error('OPERATOR_ADMINISTRATION_RESPONSE_INVALID');
 return{version:'1.0',operatorAccountId:userId,chainId:value.chainId,hubAddress:value.hubAddress,revision:value.revision,observedAt:value.observedAt};
}
export function parseAccountDirectory(value:unknown,userId:string,role:RoleFilter):AccountDirectory {
 const v=value as any,meta=metadata(v,userId);
 if(v.scope!=='OPERATOR_ACCOUNT_DIRECTORY'||v.role!==role||v.limit!==20||!Array.isArray(v.users)||v.users.length>20||!v.pagination||!(v.pagination.nextCursor===null||typeof v.pagination.nextCursor==='string'&&/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(v.pagination.nextCursor)&&v.pagination.nextCursor.length<=2048&&v.users.length===20))throw Error('OPERATOR_USERS_RESPONSE_INVALID');
 const users:AccountRow[]=v.users.map((r:any)=>{
  if(!r||!id(r.id)||!Array.isArray(r.roles)||r.roles.length>3||new Set(r.roles).size!==r.roles.length||r.roles.some((role:unknown)=>!roles.includes(role as AccountRole))||role!=='ALL'&&!r.roles.includes(role)||!integer(r.createdAt)||r.createdAt>8640000000000000||![null,'CIRCLE_EMAIL','EVM_WALLET'].includes(r.loginMethod)||!(r.activeWallet===null||address(r.activeWallet))||!(r.displayName===null||typeof r.displayName==='string'&&r.displayName.length<=160))throw Error('OPERATOR_USERS_RESPONSE_INVALID');
  return{id:r.id,roles:[...r.roles],createdAt:r.createdAt,loginMethod:r.loginMethod,activeWallet:r.activeWallet,displayName:r.displayName};
 });
 if(new Set(users.map(r=>r.id)).size!==users.length)throw Error('OPERATOR_USERS_RESPONSE_INVALID');
 return{...meta,scope:'OPERATOR_ACCOUNT_DIRECTORY',role,limit:20,users,pagination:{nextCursor:v.pagination.nextCursor}};
}
export function parseRuntimeSettings(value:unknown,userId:string):RuntimeSettings {
 const v=value as any,meta=metadata(v,userId),integrations=v.integrations;
 if(v.scope!=='OPERATOR_RUNTIME_CONFIGURATION'||!address(v.usdcAddress)||v.usdcAddress.toLowerCase()!==deployment.contracts.USDC.address.toLowerCase()||!integer(v.deploymentBlock)||v.deploymentBlock!==deployment.deploymentBlock||v.protocolVersion!==((deployment as typeof deployment&{protocolVersion?:number}).protocolVersion??1)||!address(v.operatorWallet)||typeof v.production!=='boolean'||!integrations||!['circleConfigured','smtpConfigured','emailApiConfigured'].every(k=>typeof integrations[k]==='boolean'))throw Error('OPERATOR_SETTINGS_RESPONSE_INVALID');
 return{...meta,scope:'OPERATOR_RUNTIME_CONFIGURATION',usdcAddress:v.usdcAddress,deploymentBlock:v.deploymentBlock,protocolVersion:v.protocolVersion,operatorWallet:v.operatorWallet,production:v.production,integrations:{circleConfigured:integrations.circleConfigured,smtpConfigured:integrations.smtpConfigured,emailApiConfigured:integrations.emailApiConfigured}};
}
