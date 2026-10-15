'use strict';
// Offline evidence verification only. No provider, key, database or transaction API.
const {ethers}=require('../backend/node_modules/ethers');
const fs=require('node:fs');
const fail=()=>{throw Error('SAFE_CONTROL_PROOF_INVALID');};
const keys=(v,expected)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...expected].sort().join('|'))fail();};
const address=v=>{if(typeof v!=='string'||!ethers.isAddress(v)||v.toLowerCase()===ethers.ZeroAddress)fail();return v.toLowerCase();};
const hex=(v,n)=>{if(typeof v!=='string'||!new RegExp('^0x[0-9a-f]{'+n+'}$').test(v))fail();return v;};
const uint=v=>{if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,77})$/.test(v)||BigInt(v)>=2n**256n)fail();return v;};
function challenge(input){
 keys(input,['schemaVersion','purpose','challengeId','chainId','safe','safeRuntimeHash','safeNonce','threshold','owners','requiredIndependentOwner','manifestSha256','applicationCommit','fixedBlock','issuedAt','expiresAt']);
 if(input.schemaVersion!==1||input.purpose!=='GROUPDEAL_SAFE_OWNER_CONTROL_ONLY'||input.chainId!==5042002||input.threshold!==2||typeof input.challengeId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.challengeId))fail();
 if(!Array.isArray(input.owners)||input.owners.length!==3)fail();const owners=input.owners.map(address).sort(),requiredIndependentOwner=address(input.requiredIndependentOwner);if(new Set(owners).size!==3||!owners.includes(requiredIndependentOwner))fail();
 keys(input.fixedBlock,['number','hash']);if(!Number.isSafeInteger(input.fixedBlock.number)||input.fixedBlock.number<1)fail();
 if(!Number.isSafeInteger(input.issuedAt)||!Number.isSafeInteger(input.expiresAt)||input.issuedAt<0||input.expiresAt<=input.issuedAt||input.expiresAt-input.issuedAt>86400000||input.expiresAt>8640000000000000)fail();
 if(typeof input.manifestSha256!=='string'||!/^[a-f0-9]{64}$/.test(input.manifestSha256)||typeof input.applicationCommit!=='string'||!/^[a-f0-9]{40}$/.test(input.applicationCommit))fail();
 return{schemaVersion:1,purpose:input.purpose,challengeId:input.challengeId,chainId:5042002,safe:address(input.safe),safeRuntimeHash:hex(input.safeRuntimeHash,64),safeNonce:uint(input.safeNonce),threshold:2,owners,requiredIndependentOwner,manifestSha256:input.manifestSha256,applicationCommit:input.applicationCommit,fixedBlock:{number:input.fixedBlock.number,hash:hex(input.fixedBlock.hash,64)},issuedAt:input.issuedAt,expiresAt:input.expiresAt};
}
const challengeDigest=input=>ethers.id(JSON.stringify(challenge(input)));
function ownerMessage(input,owner){
 const c=challenge(input),a=address(owner);if(!c.owners.includes(a))fail();
 return[
  'GroupDeal Safe owner control evidence',
  'Scope: control evidence only. No transaction, transfer, approval, role change or execution is authorized.',
  'I attest that I control the owner key shown below. This signature alone does not prove independent human custody.',
  'Challenge: '+c.challengeId,'Challenge digest: '+challengeDigest(c),'Chain ID: '+c.chainId,
  'Safe: '+c.safe,'Owner: '+a,'Safe runtime hash: '+c.safeRuntimeHash,'Safe nonce observed: '+c.safeNonce,
  'Threshold observed: 2 of 3','Finalized block: '+c.fixedBlock.number,'Finalized block hash: '+c.fixedBlock.hash,
  'Manifest SHA256: '+c.manifestSha256,'Application context commit: '+c.applicationCommit,
  'Issued at: '+new Date(c.issuedAt).toISOString(),'Expires at: '+new Date(c.expiresAt).toISOString(),
 ].join('\n');
}
function verifyOwnerControl(input,signatures,expectedDigest,now=Date.now()){
 const c=challenge(input),digest=challengeDigest(c);if(expectedDigest!==digest||!Number.isSafeInteger(now)||now<c.issuedAt||now>=c.expiresAt||!Array.isArray(signatures)||signatures.length<c.threshold||signatures.length>c.owners.length)fail();
 const verified=[];for(const entry of signatures){keys(entry,['owner','signature']);const owner=address(entry.owner);if(!c.owners.includes(owner)||verified.includes(owner)||typeof entry.signature!=='string'||!/^0x[0-9a-fA-F]{128}(?:[0-9a-fA-F]{2})?$/.test(entry.signature))fail();let recovered;try{recovered=ethers.verifyMessage(ownerMessage(c,owner),entry.signature).toLowerCase();}catch{fail();}if(recovered!==owner)fail();verified.push(owner);}
 if(!verified.includes(c.requiredIndependentOwner))fail();
 return{schemaVersion:1,result:'OWNER_CONTROL_SIGNATURES_VERIFIED_INDEPENDENT_CUSTODY_ATTESTATION_PENDING',challengeDigest:digest,chainId:c.chainId,safe:c.safe,ownersVerified:verified.sort(),threshold:c.threshold,requiredIndependentOwnerIncluded:true,verifiedAt:now,independentHumanCustodyVerified:false,freshAuthorityReadbackRequiredBeforeAcceptance:true,safeTransactionAuthorized:false,acceptanceEligible:false};
}
module.exports={challenge,challengeDigest,ownerMessage,verifyOwnerControl};
if(require.main===module){
 try{const args=process.argv.slice(2);if(args.length!==3||args.some(v=>typeof v!=='string'||!v))fail();const read=(file,max)=>{const stat=fs.statSync(file);if(!stat.isFile()||stat.size>max)fail();return JSON.parse(fs.readFileSync(file,'utf8'));};console.log(JSON.stringify(verifyOwnerControl(read(args[0],16384),read(args[1],4096),args[2])));}
 catch{console.error('SAFE_CONTROL_PROOF_INVALID');process.exitCode=1;}
}
