const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const publicFixturePrefixes=/^(?:fixture[-_:]|test[-_:]|groupdeal-super-secret|groupdeal-campaign-identity|groupdeal-master-aes)/;
/** Baseline literal scan. Results contain rule/file/line only, never a matched value or source excerpt. */
function scanText(text,file,developmentKey,exceptions=[]){
  const findings=[];
  const rules=[
    ['PRIVATE_KEY_PEM',/-----BEGIN ((?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY)-----\s+[A-Za-z0-9+/\r\n=]{32,}-----END \1-----/g],
    ['PROVIDER_TOKEN',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|AKIA[A-Z0-9]{16})\b/g],
    ['SECRET_LITERAL',/\b(?:privateKey|[A-Z_]*PRIVATE_KEY|jwtSecret|JWT_SECRET|masterEncryptionKey|MASTER_ENCRYPTION_KEY|campaignIdentitySecret|CAMPAIGN_IDENTITY_SECRET|circleApiKey|CIRCLE_API_KEY|SMTP_APP_PASSWORD|webhookSecret|WEBHOOK_SECRET|[A-Z_]*CLIENT_SECRET|clientSecret)\s*[:=]\s*["'`]([^"'`\r\n]{20,})["'`]/g],
  ];
  for(const [rule,pattern] of rules)for(const match of text.matchAll(pattern)){
    const value=match[1];
    if(exceptions.some(e=>e.file===file&&e.rule===rule&&e.literalSha256===crypto.createHash('sha256').update(value||match[0]).digest('hex')))continue;
    if(rule==='SECRET_LITERAL'&&(publicFixturePrefixes.test(value)||/^(?:YOUR_|REPLACE_|CHANGE_ME|<)/.test(value)||developmentKey?.(value)))continue;
    findings.push({file,line:text.slice(0,match.index).split('\n').length,rule});
  }
  return findings;
}
function main(){
  const {ethers}=require(path.join(root,'backend/node_modules/ethers'));
  const known=new Set(['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266','0x70997970c51812dc3a010c7d01b50e0d17dc79c8','0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc','0x90f79bf6eb2c4f870365e785982e1f101e93b906','0x15d34aaf54267db7d7c367839aaf71a00a2c6a65','0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc','0x976ea74026e726554db657fa54763abd0c3a0aa9','0x14dc79964da2c08b23698b3d3cc7ca32193d9955','0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f','0xa0ee7a142d267c1f36714e4a8f75612f20a79720']);
  const developmentKey=value=>{try{return /^0x[0-9a-f]{64}$/i.test(value)&&known.has(new ethers.Wallet(value).address.toLowerCase());}catch{return false;}};
  const exceptions=JSON.parse(fs.readFileSync(path.join(__dirname,'secret_scan_fixtures.json'),'utf8')).exceptions;
  const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root}).toString().split('\0').filter(Boolean),findings=[];let scanned=0;
  const generated=path.join(root,'frontend/dist');
  function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const target=path.join(dir,entry.name);if(entry.isDirectory())walk(target);else if(/\.(?:js|html|css|json|map)$/i.test(entry.name))files.push(path.relative(root,target).replaceAll(path.sep,'/'));}}
  if(fs.existsSync(generated))walk(generated);
  for(const file of [...new Set(files)].sort()){
    if(/(?:^|\/)\.env(?:\.|$)/.test(file)&&!file.endsWith('.env.example')||/\.(?:sqlite3?|db)$/i.test(file)||/^(?:backend\/data\/|data\/)/.test(file)){findings.push({file,line:0,rule:'RUNTIME_DATA_IN_CANDIDATE'});continue;}
    const absolute=path.resolve(root,file);if(!absolute.startsWith(root+path.sep)||!fs.existsSync(absolute)||!fs.statSync(absolute).isFile())continue;
    const bytes=fs.readFileSync(absolute);if(bytes.includes(0)||bytes.length>10*1024*1024)continue;
    scanned++;findings.push(...scanText(bytes.toString('utf8'),file,developmentKey,exceptions));
  }
  const record={schemaVersion:1,recordedAt:new Date().toISOString(),layer:'LOCAL_LITERAL_SECRET_SCAN',result:findings.length?'FAIL':'PASS',filesScanned:scanned,findings,redacted:true,acceptanceEligible:false,limitations:['Baseline literal/provider/PEM and candidate data-path rules; not all split/obfuscated/custom secret formats','Public development fixture/default values are not live credentials; runtime guards separately reject them on Arc','Git history, ignored runtime files and actual deployment configuration require a separate private audit']};
  fs.mkdirSync(path.join(root,'.cache'),{recursive:true});const report='.cache/secret-scan-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';fs.writeFileSync(path.join(root,report),JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify({result:record.result,filesScanned:scanned,findings,report,redacted:true}));process.exitCode=findings.length?1:0;
}
if(require.main===module){try{main();}catch{console.error('Candidate secret scan could not complete; no content printed');process.exitCode=1;}}
module.exports={scanText};
