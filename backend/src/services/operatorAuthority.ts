import fs from 'node:fs';
import path from 'node:path';
import {ethers} from 'ethers';
import {config} from '../config';
import {ArcReadProvider} from './arcReadProvider';
import {validateRuntimeSecurity} from './runtimeSecurity';
import {OperatorEnrollmentError,parseOperatorAuthority,assertOperatorAuthority,sameOperatorAuthority,type OperatorAuthority} from '../domain/operatorEnrollment';
const root=path.resolve(__dirname,'../../..');
/** No config-only/cached role grant. Every enrollment observes canonical current Hub roles. */
export async function readCurrentOperatorAuthority(previous?:OperatorAuthority,fixture?:{provider:any;manifest:any}):Promise<OperatorAuthority>{
 if(fixture&&(process.env.NODE_ENV!=='test'||config.arcChainId!==31337))throw new OperatorEnrollmentError('OPERATOR_AUTHORITY_FIXTURE_DISABLED',503);
 let provider:any;try{
  if(!fixture)validateRuntimeSecurity();
  const m=fixture?.manifest??JSON.parse(fs.readFileSync(path.join(root,'shared/manifests/arc-testnet.json'),'utf8'));
  const signer=new ethers.Wallet(config.authorizedSignerPrivateKey).address;
  if(m.chainId!==config.arcChainId||m.contracts?.GroupDealHub?.address?.toLowerCase()!==config.hubAddress.toLowerCase()||m.contracts.GroupDealHub.deploymentBlock!==config.deploymentBlock||(m.protocolVersion??1)!==config.protocolVersion||m.contracts?.USDC?.address?.toLowerCase()!==config.usdcAddress.toLowerCase()||m.roles?.operator?.address?.toLowerCase()!==config.operatorAddress.toLowerCase()||m.roles?.authorizedSigner?.address?.toLowerCase()!==signer.toLowerCase()||!ethers.isAddress(m.roles?.owner?.address)||m.roles?.securityAuthority?.type!=='safe-multisig'||!ethers.isAddress(m.roles.securityAuthority.address))throw new OperatorEnrollmentError('OPERATOR_AUTHORITY_MANIFEST_MISMATCH',503);
  provider=fixture?.provider??new ArcReadProvider();
  if(Number((await provider.getNetwork()).chainId)!==config.arcChainId)throw new OperatorEnrollmentError('OPERATOR_AUTHORITY_NETWORK_MISMATCH',503);
  const block=await provider.getBlockNumber(),canonical=await provider.getBlock(block);
  if(!Number.isSafeInteger(block)||block<config.deploymentBlock||!canonical?.hash||!ethers.isHexString(canonical.hash,32))throw new OperatorEnrollmentError('OPERATOR_AUTHORITY_CANONICAL_BLOCK_UNAVAILABLE',503);
  if(previous){const p=parseOperatorAuthority(previous);if(p.chainId!==config.arcChainId||p.hubAddress.toLowerCase()!==config.hubAddress.toLowerCase()||(await provider.getBlock(p.blockNumber))?.hash!==p.blockHash)throw new OperatorEnrollmentError('OPERATOR_AUTHORITY_CHANGED',409);}
  const hub=new ethers.Contract(config.hubAddress,['function operatorAddress() view returns(address)','function authorizedSigner() view returns(address)','function owner() view returns(address)','function securityAuthority() view returns(address)','function usdcToken() view returns(address)','function protocolVersion() view returns(uint256)'],provider);
  const [code,tokenCode,operatorAddress,authorizedSigner,ownerAddress,securityAuthority,tokenAddress]=await Promise.all([provider.getCode(config.hubAddress,block),provider.getCode(config.usdcAddress,block),hub.operatorAddress({blockTag:block}),hub.authorizedSigner({blockTag:block}),hub.owner({blockTag:block}),hub.securityAuthority({blockTag:block}),hub.usdcToken({blockTag:block})]);
  if(!code||code==='0x'||ethers.keccak256(code).toLowerCase()!==m.contracts.GroupDealHub.bytecodeHash?.toLowerCase()||!tokenCode||tokenCode==='0x'||authorizedSigner.toLowerCase()!==signer.toLowerCase()||ownerAddress.toLowerCase()!==m.roles.owner.address.toLowerCase()||securityAuthority.toLowerCase()!==m.roles.securityAuthority.address.toLowerCase()||tokenAddress.toLowerCase()!==config.usdcAddress.toLowerCase())throw new OperatorEnrollmentError('OPERATOR_AUTHORITY_DEPLOYMENT_OR_ROLE_MISMATCH',403);
  if(config.protocolVersion===2&&await hub.protocolVersion({blockTag:block})!==2n)throw new OperatorEnrollmentError('OPERATOR_AUTHORITY_PROTOCOL_MISMATCH',503);
  if((await provider.getBlock(block))?.hash!==canonical.hash)throw new OperatorEnrollmentError('OPERATOR_AUTHORITY_CHANGED',409);
  const authority=assertOperatorAuthority({chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion,operatorAddress,authorizedSigner,ownerAddress,securityAuthority,bytecodeHash:ethers.keccak256(code),blockNumber:block,blockHash:canonical.hash,observedAt:Date.now()},{chainId:config.arcChainId,hubAddress:config.hubAddress,protocolVersion:config.protocolVersion,operatorAddress:config.operatorAddress});
  if(previous)sameOperatorAuthority(parseOperatorAuthority(previous),authority);return authority;
 }catch(error){if(error instanceof OperatorEnrollmentError)throw error;throw new OperatorEnrollmentError('OPERATOR_AUTHORITY_UNAVAILABLE',503);}
 finally{if(!fixture)provider?.destroy?.();}
}
