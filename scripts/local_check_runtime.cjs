const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
/** Child-only fixture credentials. Never load, print or persist a live wallet/session key. */
function localCheckEnvironment(root=path.resolve(__dirname,'..'),options={}) {
  const {ethers}=require(path.join(root,'backend/node_modules/ethers'));
  const key=crypto.randomBytes(32).toString('hex');
  const temporaryDirectory=path.join(root,'.cache','local-check-temp');
  fs.mkdirSync(temporaryDirectory,{recursive:true});
  const inherited={...process.env};
  delete inherited.GROUPDEAL_RECOVERY_MODE;
  for(const name of Object.keys(inherited))if(/TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_KEY|CREDENTIAL/i.test(name))inherited[name]='';
  return {...inherited,TMP:temporaryDirectory,TEMP:temporaryDirectory,NODE_ENV:'test',NODE_OPTIONS:'--require "'+path.join(root,'scripts/local_network_guard.cjs').replaceAll(path.sep,'/')+'"',
    JWT_SECRET:crypto.randomBytes(32).toString('hex'),CAMPAIGN_IDENTITY_SECRET:crypto.randomBytes(32).toString('hex'),
    MASTER_ENCRYPTION_KEY:key,MASTER_ENCRYPTION_LEGACY_KEY:key,MASTER_ENCRYPTION_KEY_ID:'local-check',MASTER_ENCRYPTION_PREVIOUS_KEYS:'{}',
    AUTHORIZED_SIGNER_PRIVATE_KEY:ethers.Wallet.createRandom().privateKey,OPERATOR_ADDRESS:ethers.Wallet.createRandom().address,
    DEPLOYER_PRIVATE_KEY:'',CIRCLE_API_KEY:'',CIRCLE_APP_ID:'',SMTP_HOST:'',SMTP_USER:'',SMTP_APP_PASSWORD:'',
    ARC_RPC_URL:'http://127.0.0.1:9',ARC_TESTNET_RPC:'http://127.0.0.1:9',ARC_RPC_FALLBACKS:'',ARC_WS_URL:'ws://127.0.0.1:9',
    VITE_CIRCLE_APP_ID:'e2e-only-circle-app-id',VITE_REOWN_PROJECT_ID:options.configuredReown===true?'f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1':'',HARDHAT_TELEMETRY_CONSENT:'false'};
}
module.exports={localCheckEnvironment};
