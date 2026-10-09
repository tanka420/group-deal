import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { TransactionalStore } from "../src/db/store";
import { BackupService } from "../src/services/backupService";
import { IndexerProjection } from "../src/services/indexerService";
import { ReconciliationService } from "../src/services/reconciliationService";
import { ArcReadProvider } from "../src/services/arcReadProvider";
import { validateManifestAndEnvironment } from "../src/services/manifestValidator";
import { config } from "../src/config";

/** Produces a new private candidate and public aggregate proof. There is no promotion/reset option. */
export async function restoreShadowBackup(backupPath:string,rebuild=false,toBlock?:number,inputScope:"BACKUP_CANDIDATE"|"LOCAL_FIXTURE"="BACKUP_CANDIDATE"):Promise<{status:string;evidence:string;targetDirectory:string}> {
  const decoded=BackupService.readEncryptedBackup(path.resolve(backupPath));
  const root=path.resolve(__dirname,"../.."),shadowRoot=path.join(root,".cache/recovery-databases");
  fs.mkdirSync(shadowRoot,{recursive:true,mode:0o700});
  const targetDir=fs.mkdtempSync(path.join(shadowRoot,"restore-"));
  const target=new TransactionalStore(targetDir);
  const report:Record<string,any>={schemaVersion:1,recordedAt:new Date().toISOString(),mode:rebuild?"RESTORE_AND_REPLAY":"RESTORE",inputScope,promoted:false,acceptanceEligible:false,
    backupCiphertextSha256:crypto.createHash("sha256").update(fs.readFileSync(backupPath)).digest("hex"),backupTimestamp:decoded.timestamp,
    backupChecksum:decoded.checksum,backupEnvelopeVersion:decoded.envelopeVersion,backupMetadataAuthenticated:decoded.metadataAuthenticated,authCutoverAllowed:false,targetDirectory:path.relative(root,targetDir).replaceAll("\\","/"),status:"UNVERIFIED"};
  let restored:ReturnType<typeof target.snapshot>|undefined;
  try {
    const result=BackupService.restoreEncryptedBackup(path.resolve(backupPath),target);
    if(result.checksum!==decoded.checksum)throw new Error("Backup changed during recovery");
    restored=target.snapshot();
    for(const [key,value] of Object.entries(decoded.data)) {
      if(key==="auditLogs") {
        if(restored.auditLogs.length!==decoded.data.auditLogs.length+1 || !isDeepStrictEqual(restored.auditLogs.slice(1),value))throw new Error("Restore changed original audit history");
      } else if(!isDeepStrictEqual((restored as any)[key],value))throw new Error("Restore changed private application records");
    }
    report.restore={preservedOriginalFields:true,auditIntegrity:target.verifyAuditLogIntegrity().valid,
      counts:Object.fromEntries(Object.entries(restored).filter(([,value])=>value&&typeof value==="object").map(([key,value])=>[key,Object.keys(value).length]))};
    if(!report.restore.auditIntegrity)throw new Error("Restored audit history has an invalid chain");
    report.status="RESTORE_VERIFIED";
    if(rebuild) {
      const provider=new ArcReadProvider();
      try {
        await validateManifestAndEnvironment();
        const head=await provider.getBlockNumber(),block=toBlock??head;
        if(!Number.isSafeInteger(block)||block<config.deploymentBlock||block>head)throw new Error("Invalid replay endpoint");
        const indexer=new IndexerProjection(target,false,true);indexer.setProvider(provider);
        await indexer.rebuildFromClean(config.deploymentBlock,block);
        report.reconciliation=await ReconciliationService.runReconciliation({fixedBlockNumber:block,customProvider:provider,projectionStore:target});
        if(report.reconciliation.status!=="HEALTHY")throw new Error("Replay did not pass per-order reconciliation");
        report.status="RESTORE_REPLAY_VERIFIED";
      } finally {provider.destroy();}
    }
  } catch {
    // Keep the verified restore if a replay fails; never lose private records through a partial drill.
    if(restored)target.replace(restored);
    report.status=rebuild&&restored&&report.restore?.preservedOriginalFields&&report.restore.auditIntegrity?"REPLAY_OR_POLICY_REJECTED":"RESTORE_REJECTED";
    report.failure="Candidate requires operator inspection; the active database and original backup were not modified.";
  } finally {
    target.close();
    const database=new DatabaseSync(path.join(targetDir,"groupdeal.sqlite"),{readOnly:true});
    try {report.sqliteIntegrity=(database.prepare("PRAGMA integrity_check").get() as any).integrity_check;} finally {database.close();}
    if(report.sqliteIntegrity!=="ok")report.status="RESTORE_REJECTED";
  }
  const publicPath=path.join(root,"reports/evidence",`RESTORE_${path.basename(targetDir)}.json`);
  fs.mkdirSync(path.dirname(publicPath),{recursive:true});
  fs.writeFileSync(path.join(targetDir,"RESTORE.json"),JSON.stringify(report,null,2),{flag:"wx",mode:0o600});
  fs.writeFileSync(publicPath,JSON.stringify(report,null,2),{flag:"wx"});
  return {status:report.status,evidence:publicPath,targetDirectory:targetDir};
}

async function main() {
  const args=process.argv.slice(2),backupArg=args.find(arg=>arg.startsWith("--backup=")),blockArg=args.find(arg=>arg.startsWith("--to-block="));
  if(!backupArg||args.some(arg=>arg!=="--rebuild"&&!arg.startsWith("--backup=")&&!/^--to-block=\d+$/.test(arg))
    || args.filter(arg=>arg.startsWith("--backup=")).length!==1||args.filter(arg=>arg.startsWith("--to-block=")).length>1||blockArg&&!args.includes("--rebuild"))
    throw new Error("Use restore:shadow -- --backup=<encrypted-backup> [--rebuild] [--to-block=<B>]");
  const result=await restoreShadowBackup(backupArg.slice("--backup=".length),args.includes("--rebuild"),blockArg?Number(blockArg.split("=")[1]):undefined);
  console.log(JSON.stringify({status:result.status,promoted:false,evidence:path.relative(path.resolve(__dirname,"../.."),result.evidence).replaceAll("\\","/")}));
  if(!["RESTORE_VERIFIED","RESTORE_REPLAY_VERIFIED"].includes(result.status))process.exitCode=1;
}
if(require.main===module)main().catch(()=>{console.error("Shadow restore could not start; check the encrypted backup and configured key ring privately. Active data was not modified.");process.exitCode=1;});
