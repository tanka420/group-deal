'use strict';
const crypto=require('node:crypto');
const ownerPattern=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const legacyArchivePattern=/^backup_(\d{13})_[a-f0-9-]{36}\.enc$/;
function layoutFor(metadata){
 const {ownerId,timestamp,sha256,archive}=metadata??{},match=typeof archive==='string'&&legacyArchivePattern.exec(archive);
 if(!ownerPattern.test(ownerId??'')||!Number.isSafeInteger(timestamp)||timestamp<0||!match||Number(match[1])!==timestamp||!/^[a-f0-9]{64}$/.test(sha256??''))throw Error('OFFHOST_LAYOUT_METADATA_INVALID');
 const iso=new Date(timestamp).toISOString();if(!/^\d{4}-/.test(iso))throw Error('OFFHOST_LAYOUT_TIMESTAMP_INVALID');
 const stamp=iso.replaceAll('-','').replaceAll(':','').replace('.',''),baseDirectory='gd_onedrive:GroupDeal/ArcTestnet/'+ownerId+'/',directory=baseDirectory+iso.slice(0,10).replaceAll('-','/')+'/',stem='groupdeal-arc-testnet-backup-'+stamp+'-'+sha256.slice(0,16);
 return{version:2,baseDirectory,directory,archive:stem+'.enc',manifest:stem+'.manifest.json',timestampUtc:iso};
}
function remoteManifest(metadata,sourceBytes){
 const layout=layoutFor(metadata),decoded=JSON.parse(sourceBytes.toString('utf8'));
 if(JSON.stringify(decoded)!==JSON.stringify(metadata))throw Error('OFFHOST_SOURCE_CHANGED');
 return Buffer.from(JSON.stringify({schema:'GroupDealOffhostManifestV2',layoutVersion:2,ownerId:metadata.ownerId,backupTimestamp:metadata.timestamp,backupTimestampUtc:layout.timestampUtc,sourceCommit:metadata.sourceCommit,archive:layout.archive,sha256:metadata.sha256,byteLength:metadata.byteLength,sourceArchive:metadata.archive,sourceManifestSha256:crypto.createHash('sha256').update(sourceBytes).digest('hex'),sourceManifest:metadata},null,2)+'\n');
}
module.exports={layoutFor,remoteManifest,ownerPattern,legacyArchivePattern};
