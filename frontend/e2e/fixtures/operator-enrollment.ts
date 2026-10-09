import {ethers} from 'ethers';
import {createRequire} from 'node:module';
const manifest=createRequire(import.meta.url)('../../../shared/manifests/arc-testnet.json');
export const operatorFixtureWallet=ethers.getAddress(manifest.roles.operator.address);
/** Explicit mocked backend metadata only. Does not prove a controller signature or live authority. */
export function operatorFixtureStatus(accountId:string,wallet:string|null,operatorRolePresent:boolean,controllerVerified:boolean,now:number){
 const activeWallet=wallet===null?null:ethers.getAddress(wallet),eligible=activeWallet===operatorFixtureWallet,enrolled=controllerVerified&&operatorRolePresent&&eligible;
 const authority={chainId:manifest.chainId,hubAddress:ethers.getAddress(manifest.contracts.GroupDealHub.address),protocolVersion:manifest.protocolVersion??1,operatorAddress:operatorFixtureWallet,authorizedSigner:ethers.getAddress(manifest.roles.authorizedSigner.address),ownerAddress:ethers.getAddress(manifest.roles.owner.address),securityAuthority:ethers.getAddress(manifest.roles.securityAuthority.address),bytecodeHash:manifest.contracts.GroupDealHub.bytecodeHash,blockNumber:manifest.contracts.GroupDealHub.deploymentBlock+1,blockHash:ethers.id('LOCAL_OPERATOR_ENROLLMENT_METADATA_FIXTURE'),observedAt:now};
 return{accountId,status:enrolled?'ENROLLED':eligible?'READY':'WALLET_MISMATCH',expectedWallet:operatorFixtureWallet,activeWallet,chainId:authority.chainId,hubAddress:authority.hubAddress,authority,eligible,operatorRolePresent,enrolled,enrollmentNonceDigest:enrolled?ethers.sha256(ethers.toUtf8Bytes('LOCAL_FIXTURE:'+accountId)).slice(2):null,controllerSignatureRequired:!enrolled};
}
