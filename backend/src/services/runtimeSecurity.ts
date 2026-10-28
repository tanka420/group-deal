import {ARC_CHAIN_ID,ARC_IS_MAINNET,assertDeploymentConfigured} from '../../../shared/network.mjs';
import { ethers } from "ethers";
import { config } from "../config";

type SecurityRuntime=Pick<typeof config,"isProduction"|"arcChainId"|"jwtSecret"|"campaignIdentitySecret"|"masterEncryptionKey"|"masterEncryptionKeyId"|"authorizedSignerPrivateKey"|"operatorAddress">;
const publicDevelopmentAddresses=new Set(["0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266","0x70997970c51812dc3a010c7d01b50e0d17dc79c8","0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc","0x90f79bf6eb2c4f870365e785982e1f101e93b906","0x15d34aaf54267db7d7c367839aaf71a00a2c6a65","0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc","0x976ea74026e726554db657fa54763abd0c3a0aa9","0x14dc79964da2c08b23698b3d3cc7ca32193d9955","0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f","0xa0ee7a142d267c1f36714e4a8f75612f20a79720"]);

/** Arc networks carry real accounts/resources even when NODE_ENV is development. Validate before opening the DB, port or workers. */
export function validateRuntimeSecurity(runtime:SecurityRuntime=config,environment:NodeJS.ProcessEnv=process.env):void {
  if(ARC_IS_MAINNET){
    assertDeploymentConfigured();
    if(runtime.arcChainId!==5042)throw new Error("RUNTIME_SECURITY_INVALID: Mainnet environment requires chain 5042");
  }
  if(runtime.arcChainId===31337&&!runtime.isProduction)return;
  if(runtime.arcChainId!==ARC_CHAIN_ID&&runtime.arcChainId!==31337)throw new Error("RUNTIME_SECURITY_INVALID: unsupported chain configuration");
  const secrets=[
    ["JWT_SECRET",runtime.jwtSecret,"groupdeal-super-secret"],
    ["CAMPAIGN_IDENTITY_SECRET",runtime.campaignIdentitySecret,"groupdeal-campaign-identity"],
    ["MASTER_ENCRYPTION_KEY",runtime.masterEncryptionKey,"groupdeal-master-aes"],
  ] as const;
  for(const [name,value,defaultPrefix] of secrets)if(!environment[name]||value.length<32||value.includes(defaultPrefix)||value!==environment[name])
    throw new Error(`RUNTIME_SECURITY_INVALID: ${name} requires a configured non-default secret of at least 32 characters`);
  if(new Set(secrets.map(([,value])=>value)).size!==secrets.length)throw new Error("RUNTIME_SECURITY_INVALID: session, identity and encryption secrets must be distinct");
  if(!/^[-a-zA-Z0-9_]{1,64}$/.test(runtime.masterEncryptionKeyId)||["__proto__","constructor","prototype"].includes(runtime.masterEncryptionKeyId))throw new Error("RUNTIME_SECURITY_INVALID: invalid encryption key ID");
  let signer:string;
  try {
    if(!environment.AUTHORIZED_SIGNER_PRIVATE_KEY||runtime.authorizedSignerPrivateKey!==environment.AUTHORIZED_SIGNER_PRIVATE_KEY)throw new Error();
    signer=new ethers.Wallet(runtime.authorizedSignerPrivateKey).address;
  } catch {throw new Error("RUNTIME_SECURITY_INVALID: configured authorization signer key is missing or invalid");}
  if(publicDevelopmentAddresses.has(signer.toLowerCase()))throw new Error("RUNTIME_SECURITY_INVALID: public development signer cannot authorize this runtime");
  if(!environment.OPERATOR_ADDRESS||environment.OPERATOR_ADDRESS.toLowerCase()!==runtime.operatorAddress.toLowerCase()||!ethers.isAddress(runtime.operatorAddress)||runtime.operatorAddress===ethers.ZeroAddress||publicDevelopmentAddresses.has(runtime.operatorAddress.toLowerCase())
    || runtime.operatorAddress.toLowerCase()===signer.toLowerCase())throw new Error("RUNTIME_SECURITY_INVALID: configure a distinct non-development operator address");
}
