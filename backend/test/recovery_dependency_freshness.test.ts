import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';

// Parse source and evaluate only the input functions. Never import the store singleton or open SQLite.
const root=path.resolve(__dirname,'../..');
const definitions=[
 {file:'backend/src/services/recoveryDrillService.ts',name:'recoveryDrillInputs'},
 {file:'backend/src/services/shadowPreparation.ts',name:'shadowPreparationInputs'},
 {file:'backend/src/services/runtimeBackup.ts',name:'runtimeBackupInputs'},
 {file:'backend/src/services/restoredWorkPreparation.ts',name:'restoredWorkPreparationInputs'},
 {file:'backend/src/services/legacyReviewPreparation.ts',name:'legacyReviewInputs'},
 {file:'scripts/drill_recovery_api.cjs',name:'inspectionApiInputs'},
];
const before=process.env.GROUPDEAL_TEST_RECOVERY_DEPENDENCY_BEFORE;
if(before&&!/^\.cache\/recovery-dependency-before-[0-9TZ-]+$/.test(before))throw Error('Invalid before-source fixture');
const readSource=(file:string)=>fs.readFileSync(path.join(root,before&&definitions.some(d=>d.file===file)?before+'/'+file:file),'utf8');
export function declaredPaths(file:string){
 const source=ts.createSourceFile(file,readSource(file),ts.ScriptTarget.Latest,true);
 let result:string[]|undefined;
 for(const statement of source.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations){
  if(['toolPaths','paths','inputs'].includes(declaration.name.getText(source))&&declaration.initializer&&ts.isArrayLiteralExpression(declaration.initializer)&&declaration.initializer.elements.every(ts.isStringLiteral))result=declaration.initializer.elements.map(e=>(e as ts.StringLiteral).text);
 }
 assert.ok(result,'Missing literal tool input list: '+file);return result;
}
function runtimeClosure(file:string,seen=new Set<string>()):Set<string>{
 if(seen.has(file))return seen;seen.add(file);
 if(file.endsWith('.json'))return seen;
 const raw=fs.readFileSync(path.join(root,file),'utf8'),code=file.endsWith('.ts')?ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText:raw;
 const source=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const visit=(node:ts.Node):void=>{
  let specifier:string|undefined;
  if(ts.isCallExpression(node)&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0])&&(node.expression.getText(source)==='require'||node.expression.kind===ts.SyntaxKind.ImportKeyword))specifier=node.arguments[0].text;
  if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))specifier=node.moduleSpecifier.text;
  if(specifier?.startsWith('.')){
   const base=path.resolve(root,path.dirname(file),specifier),target=[base,base+'.ts',base+'.js',base+'.cjs',base+'.mjs',base+'.json',path.join(base,'index.ts')].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
   assert.ok(target,'Unresolved runtime dependency: '+file+' '+specifier);
   runtimeClosure(path.relative(root,target).replaceAll(path.sep,'/'),seen);
  }
  ts.forEachChild(node,visit);
 };visit(source);return seen;
}
function inputFunction(definition:typeof definitions[number],overlays=new Map<string,Buffer>(),sourceOverride?:string){
 const actual=path.join(root,definition.file),fakeFs={...fs,readFileSync:(file:fs.PathOrFileDescriptor,...args:any[])=>overlays.has(path.resolve(String(file)))?overlays.get(path.resolve(String(file))):Reflect.apply(fs.readFileSync,fs,[file,...args])};
 if(definition.name==='inspectionApiInputs')return()=>declaredPaths(definition.file).map(file=>({path:file,sha256:crypto.createHash('sha256').update(fakeFs.readFileSync(path.join(root,file)) as Buffer).digest('hex')}));
 const module={exports:{} as Record<string,any>},code=ts.transpileModule(sourceOverride??readSource(definition.file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,__dirname:path.dirname(actual),Buffer,process:{env:{NODE_ENV:'test'},platform:process.platform},require:(name:string)=>{
  if(name==='node:fs'||name==='fs')return fakeFs;
  if(/^(?:node:)?(?:path|crypto|util|http|child_process|perf_hooks|sqlite)$/.test(name))return require(name);
  if(name==='ethers')return {};
  if(name.startsWith('.'))return {};
  throw Error('Unexpected runtime import: '+name);
 }},{timeout:2000});return module.exports[definition.name] as ()=>{path:string;sha256:string}[];
}
const selectedCheck=process.argv.find(arg=>arg.startsWith("--check="))?.slice(8);
let passed=0,failed=0;
function check(name:string,fn:()=>void){if(selectedCheck&&!name.startsWith(selectedCheck+" "))return;try{fn();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+(error instanceof Error?error.message:'unknown'));}}
for(const definition of definitions){
 check(definition.name+' covers runtime imports and rejects omitted persistence dependencies',()=>{
  const files=declaredPaths(definition.file),required=new Set<string>();
  for(const file of files)runtimeClosure(file,required);
  assert.equal(new Set(files).size,files.length,'Duplicate tool input');
  for(const file of required)assert.ok(files.includes(file),'RECOVERY_DEPENDENCY_OMITTED '+file);
  assert.ok(files.includes('backend/src/domain/sellerInventory.ts'),'RECOVERY_DEPENDENCY_OMITTED sellerInventory');
  assert.ok(files.includes('backend/src/domain/product.ts'),'RECOVERY_DEPENDENCY_OMITTED product');
 });
 check(definition.name+' changes for declared metadata and queue dependencies without editing source files',()=>{
  const inputs=inputFunction(definition)(),first=JSON.stringify(inputs);
  assert.equal(JSON.stringify(inputFunction(definition)()),first,'Unstable input order');
  const overlays=['backend/src/db/operatorAccountRead.ts','backend/src/domain/walletFlow.ts','backend/src/domain/walletQuote.ts','shared/arcWallet.mjs','backend/src/db/operatorDealRead.ts','backend/src/domain/sellerInventory.ts','backend/src/domain/product.ts','backend/src/domain/support.ts','backend/src/domain/sellerFollow.ts','backend/src/domain/operations.ts','backend/src/domain/sellerBadge.ts','backend/src/domain/authRecovery.ts','shared/operatorBadge.mjs',"backend/src/domain/operationPreparation.ts","backend/src/domain/operationReadiness.ts","backend/src/domain/operationReplacement.ts","backend/src/domain/operationTracking.ts","backend/src/domain/operationVerification.ts","backend/src/domain/orderReview.ts","backend/src/domain/receiptConsumption.ts"];
  if(definition.name==='inspectionApiInputs')overlays.push('backend/dist/db/operatorDealRead.js',...['bridgeClosure','bridgeReceipt','bridgeRequest','bridgeTransfer','signerReservation'].map(p=>'backend/src/domain/'+p+'.ts'));
  if(definition.name==='inspectionApiInputs')overlays.push(...['bridgeClosure','bridgeReceipt','bridgeRequest','bridgeTransfer','signerReservation','support','sellerFollow'].map(p=>'backend/dist/domain/'+p+'.js'));
  if(definition.name==='inspectionApiInputs')overlays.push(...['contracts/hubAbi','domain/operationPreparation','domain/operationReadiness','domain/operationReplacement','domain/operationTracking','domain/operationVerification','domain/orderReview','domain/receiptConsumption','services/eventEvidence'].map(p=>'backend/dist/'+p+'.js'));
  if(['shadowPreparationInputs','runtimeBackupInputs','restoredWorkPreparationInputs','legacyReviewInputs'].includes(definition.name)){for(const file of ['backend/src/services/publicMetadata.ts','backend/src/services/authService.ts','backend/src/domain/walletAuthentication.ts','backend/src/services/notificationInboxService.ts']){assert.ok(inputs.some(r=>r.path===file));overlays.push(file);}}
  for(const file of overlays){
   const full=path.join(root,file),bytes=fs.readFileSync(full),overlays=new Map([[full,Buffer.concat([bytes,Buffer.from('\n// isolated dependency change\n')])]]);
   assert.notEqual(JSON.stringify(inputFunction(definition,overlays)()),first,'RECOVERY_DEPENDENCY_CHANGE_UNDETECTED '+file);
   assert.deepEqual(fs.readFileSync(full),bytes,'Source file changed');
  }
 });
}
check('inspection rejects historical drill input sets missing persistence dependencies',()=>{
 const file='backend/src/services/recoveryInspection.ts',module={exports:{} as any},code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,inputs=inputFunction(definitions[0])();
 vm.runInNewContext(code,{module,exports:module.exports,__dirname:path.join(root,'backend/src/services'),Buffer,require:(name:string)=>name==='./recoveryDrillService'?{recoveryDrillInputs:()=>inputs}:name.startsWith('.')?{}:require(name)},{timeout:2000});
 const proof={inputScope:'EXISTING_DATA',status:'RESTORE_DATA_VERIFIED_NO_PRIVATE_RESOURCE',acceptanceEligible:false,promoted:false,originalFilesPreserved:true,restore:{allOriginalFieldsPreserved:true,auditChainValid:true},sqliteIntegrity:'ok',backup:{envelopeVersion:3,metadataAuthenticated:true},authCutover:{allowed:false},originalAccess:'FILES_READ_ONLY_NO_SQLITE_CONNECTION',toolInputs:inputs},pointer={inputScope:proof.inputScope,status:proof.status};
 assert.doesNotThrow(()=>module.exports.validateRecoveryReferenceMetadata(pointer,proof));
 assert.throws(()=>module.exports.validateRecoveryReferenceMetadata(pointer,{...proof,toolInputs:inputs.filter(f=>f.path!=='backend/src/domain/sellerInventory.ts')}),/RECOVERY_TOOL_INPUT_SET_INVALID/);
 assert.throws(()=>module.exports.validateRecoveryReferenceMetadata(pointer,{...proof,toolInputs:inputs.filter(f=>f.path!=='backend/src/domain/product.ts')}),/RECOVERY_TOOL_INPUT_SET_INVALID/);
 assert.throws(()=>module.exports.validateRecoveryReferenceMetadata(pointer,{...proof,toolInputs:inputs.filter(f=>f.path!=='backend/src/domain/support.ts')}),/RECOVERY_TOOL_INPUT_SET_INVALID/);
 assert.throws(()=>module.exports.validateRecoveryReferenceMetadata(pointer,{...proof,toolInputs:inputs.filter(f=>f.path!=='backend/src/domain/sellerFollow.ts')}),/RECOVERY_TOOL_INPUT_SET_INVALID/);
 assert.throws(()=>module.exports.validateRecoveryReferenceMetadata(pointer,{...proof,toolInputs:inputs.filter(f=>f.path!=='backend/src/domain/operationPreparation.ts')}),/RECOVERY_TOOL_INPUT_SET_INVALID/);
 assert.throws(()=>module.exports.validateRecoveryReferenceMetadata(pointer,{...proof,toolInputs:inputs.filter(f=>f.path!=='backend/src/db/operatorDealRead.ts')}),/RECOVERY_TOOL_INPUT_SET_INVALID/);
});
const application={file:'backend/src/services/recoveryApplication.ts',name:'recoveryApplicationInputs'},applicationBefore=before?fs.readFileSync(path.join(root,'.cache/recovery-application-inputs-before.ts'),'utf8'):undefined;
check('application admission fingerprint covers all source and emitted runtime imports',()=>{
 const files=inputFunction(application,new Map(),applicationBefore)().map(f=>f.path);
 for(const entry of ['backend/src/index.ts','backend/dist/index.js','backend/src/recoveryInspection.ts','backend/dist/recoveryInspection.js'])for(const file of runtimeClosure(entry))assert.ok(files.includes(file),'RECOVERY_APPLICATION_DEPENDENCY_OMITTED '+file);
});
check('application admission fingerprint changes for every imported shared runtime module',()=>{
 const inputs=inputFunction(application,new Map(),applicationBefore)();
 for(const file of [...runtimeClosure('backend/src/index.ts')].filter(f=>f.startsWith('shared/'))){
  const full=path.join(root,file),b=fs.readFileSync(full),overlays=new Map([[full,Buffer.concat([b,Buffer.from('\n// isolated shared dependency change\n')])]]);
  assert.notEqual(JSON.stringify(inputFunction(application,overlays,applicationBefore)()),JSON.stringify(inputs),'RECOVERY_APPLICATION_DEPENDENCY_CHANGE_UNDETECTED '+file);
  assert.deepEqual(fs.readFileSync(full),b);
 }
});
console.log(`RESULT recovery dependency freshness: ${passed} passed, ${failed} failed; no source/SQLite/network mutation`);
if(failed)process.exitCode=1;
