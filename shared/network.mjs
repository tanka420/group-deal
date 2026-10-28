import mainnet from './manifests/arc-mainnet.json' with {type:'json'};
import testnet from './manifests/arc-testnet.json' with {type:'json'};
import local from './manifests/local.json' with {type:'json'};

/** Select one network for the entire process/bundle. Unknown values never fall back. */
export function networkManifest(environment='arc-mainnet') {
  switch(environment.toLowerCase()) {
    case 'arc-mainnet': case '5042': return mainnet;
    case 'arc-testnet': case 'arc': case '5042002': return testnet;
    case 'local': case 'hardhat': case '31337': return local;
    default: throw Error('NETWORK_ENVIRONMENT_UNSUPPORTED');
  }
}
const nodeEnvironment=globalThis['process']?.env?.APP_ENV;
export const ARC_NETWORK=networkManifest(import.meta.env?.VITE_APP_ENV || nodeEnvironment || 'arc-mainnet');
export const ARC_CHAIN_ID=ARC_NETWORK.chainId;
export const ARC_CHAIN_HEX=ARC_NETWORK.chainIdHex.toLowerCase();
export const ARC_CHAIN_NAME=ARC_NETWORK.networkName;
// Preserve existing Testnet client links while selecting Mainnet's official explorer.
export const ARC_EXPLORER=ARC_NETWORK.environment==='arc-testnet'?'https://testnet.arcscan.app':ARC_NETWORK.explorerUrl;
export const ARC_IS_MAINNET=ARC_NETWORK.environment==='arc-mainnet';
export const ARC_CIRCLE_BLOCKCHAIN=ARC_IS_MAINNET?'ARC':'ARC-TESTNET';
export const ARC_KIT_CHAIN=ARC_IS_MAINNET?'Arc':'Arc_Testnet';
export const ARC_BRIDGE_ENABLED=!ARC_IS_MAINNET;
export const ARC_SWAP_ENABLED=!ARC_IS_MAINNET;

/** A preparation manifest can be rendered but must never authorize a transaction. */
export function assertDeploymentConfigured(manifest=ARC_NETWORK) {
  if(manifest.environment!=='arc-mainnet')return;
  const address=v=>typeof v==='string'&&/^0x[\da-f]{40}$/i.test(v)&&!/^0x0{40}$/i.test(v);
  const hash=v=>typeof v==='string'&&/^0x[\da-f]{64}$/i.test(v)&&!/^0x0{64}$/i.test(v);
  const hub=manifest.contracts?.GroupDealHub,roles=manifest.roles;
  const authorities=['owner','authorizedSigner','operator','securityAuthority'].map(k=>roles?.[k]?.address);
  const safe=roles?.securityAuthority;
  const development=new Set(['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266','0x70997970c51812dc3a010c7d01b50e0d17dc79c8','0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc','0x90f79bf6eb2c4f870365e785982e1f101e93b906','0x15d34aaf54267db7d7c367839aaf71a00a2c6a65','0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc','0x976ea74026e726554db657fa54763abd0c3a0aa9','0x14dc79964da2c08b23698b3d3cc7ca32193d9955','0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f','0xa0ee7a142d267c1f36714e4a8f75612f20a79720']);
  if(manifest.chainId!==5042 || manifest.chainIdHex.toLowerCase()!=='0x13b2'
    ||manifest.contracts?.USDC?.address?.toLowerCase()!=='0x3600000000000000000000000000000000000000'
    ||manifest.contracts.USDC.businessDecimals!==6||manifest.contracts.USDC.nativeGasDecimals!==18
    ||manifest.deploymentStatus!=='VERIFIED'||![1,2].includes(manifest.protocolVersion)
    ||!address(hub?.address)||!hash(hub?.bytecodeHash)||!hash(hub?.txHash)
    ||!Number.isSafeInteger(hub?.deploymentBlock)||hub.deploymentBlock<=0
    ||!authorities.every(address)||new Set(authorities.map(a=>a.toLowerCase())).size!==4
    ||authorities.some(a=>development.has(a.toLowerCase()))
    ||safe?.type!=='safe-multisig'||!Array.isArray(safe.owners)||safe.owners.length<2||!safe.owners.every(address)
    ||safe.owners.some(a=>development.has(a.toLowerCase()))||!hash(safe.bytecodeHash)||!/^\d+\.\d+\.\d+$/.test(safe.safeVersion)
    ||new Set(safe.owners.map(a=>a.toLowerCase())).size!==safe.owners.length
    ||!Number.isInteger(safe.threshold)||safe.threshold<2||safe.threshold>safe.owners.length)
    throw Error('MAINNET_DEPLOYMENT_NOT_CONFIGURED');
}
