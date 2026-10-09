import { artifacts, ethers } from "hardhat";

/** Solidity templates contain zeroed EIP-712/USDC immutables. Pin the fully initialized runtime, including metadata. */
export async function compiledV2Runtime(hubAddress:string,usdcAddress:string,chainId:bigint):Promise<string> {
  const name="contracts/GroupDealHubV2.sol:GroupDealHubV2",build=await artifacts.getBuildInfo(name);
  if(!build)throw new Error("Compiled v2 build information is missing");
  const output=build.output.contracts["contracts/GroupDealHubV2.sol"].GroupDealHubV2;
  const immutableNames=new Map<string,string>();
  function walk(node:any):void {
    if(!node||typeof node!=="object")return;
    if(node.nodeType==="VariableDeclaration"&&node.mutability==="immutable")immutableNames.set(String(node.id),node.name);
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==="object")walk(value);
  }
  for(const source of Object.values(build.output.sources))walk(source.ast);
  const shortString=(text:string)=>{const source=ethers.toUtf8Bytes(text);if(source.length>31)throw new Error("Unsupported EIP-712 short string");const bytes=new Uint8Array(32);bytes.set(source);bytes[31]=source.length;return ethers.hexlify(bytes);};
  const words:Record<string,string>={
    usdcToken:ethers.zeroPadValue(ethers.getAddress(usdcAddress),32),
    _cachedThis:ethers.zeroPadValue(ethers.getAddress(hubAddress),32),_cachedChainId:ethers.toBeHex(chainId,32),
    _cachedDomainSeparator:ethers.TypedDataEncoder.hashDomain({name:"GroupDealHub",version:"1",chainId,verifyingContract:hubAddress}),
    _hashedName:ethers.id("GroupDealHub"),_hashedVersion:ethers.id("1"),_name:shortString("GroupDealHub"),_version:shortString("1"),
  };
  const runtime=ethers.getBytes("0x"+output.evm.deployedBytecode.object),patched=new Set<string>();
  const immutableReferences=output.evm.deployedBytecode.immutableReferences;
  if(!immutableReferences)throw new Error("Compiled v2 immutable references are missing");
  for(const [id,references] of Object.entries(immutableReferences)) {
    const variable=immutableNames.get(id),word=variable&&words[variable];
    if(!word)throw new Error("Unrecognized runtime immutable; update the artifact proof before deployment");
    patched.add(variable!);
    for(const reference of references) {
      if(reference.length!==32||reference.start<0||reference.start+32>runtime.length)throw new Error("Invalid compiled immutable reference");
      runtime.set(ethers.getBytes(word),reference.start);
    }
  }
  if(patched.size!==Object.keys(words).length)throw new Error("Compiled immutable set differs from the pinned financial protocol");
  return ethers.hexlify(runtime);
}
