param([switch]$VerifyOnly,[string]$ReportDirectory='')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.Web.Extensions
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$privateDirectory=Join-Path $taskRoot '.cache/mainnet-private'
$indexerVaultPath=Join-Path $privateDirectory 'indexer.dpapi.json'
$reportRoot=Join-Path $taskRoot '.cache/mainnet-indexer-input'
$taskReportDirectory=if($ReportDirectory){[IO.Path]::GetFullPath($ReportDirectory)}else{Join-Path $reportRoot ([Guid]::NewGuid().ToString())}
if(-not $taskReportDirectory.StartsWith($reportRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'INDEXER_STATUS_PATH_INVALID'}
$statusPath=Join-Path $taskReportDirectory 'STATUS.json'
$utf8=New-Object Text.UTF8Encoding($false)
$serializer=New-Object Web.Script.Serialization.JavaScriptSerializer
$serializer.MaxJsonLength=131072
$plainBytes=$null;$keySecure=$null;$apiKey=$null;$succeeded=$false
function Digest([string]$File){$h=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($h.ComputeHash([IO.File]::ReadAllBytes($File))).Replace('-','')}finally{$h.Dispose()}}
function Status([hashtable]$Fields){
 $r=@{schemaVersion=1;chainId=5042;recordedAt=[DateTime]::UtcNow.ToString('o');emailsSent=0;transactionsSubmitted=0;signaturesCreated=0;backendActivated=$false;broadcastAuthorized=$false;acceptanceEligible=$false}
 foreach($e in $Fields.GetEnumerator()){$r[$e.Key]=$e.Value};[IO.File]::WriteAllText($statusPath,($r|ConvertTo-Json -Depth 6),$utf8)
}
try{
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent();if($identity.Name -match 'CodexSandbox'){throw 'RUN_AS_YOUR_WINDOWS_ACCOUNT'}
 [void][IO.Directory]::CreateDirectory($taskReportDirectory)
 foreach($p in @((Join-Path $taskRoot '.cache'),$privateDirectory,$reportRoot,$taskReportDirectory)){
  if(-not (Test-Path -LiteralPath $p) -or ((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'INDEXER_PRIVATE_PATH_INVALID'}
 }
 $otherVaults=@{}
 foreach($name in @('secrets.dpapi.json','smtp.dpapi.json')){
  $p=Join-Path $privateDirectory $name
  if(-not (Test-Path -LiteralPath $p -PathType Leaf) -or ((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'MAINNET_PROVIDER_VAULT_REQUIRED'}
  $otherVaults[$p]=Digest $p
 }
 $info=New-Object IO.DirectoryInfo($privateDirectory)
 $acl=if($info.PSObject.Methods.Name -contains 'GetAccessControl'){$info.GetAccessControl()}else{[IO.FileSystemAclExtensions]::GetAccessControl($info)}
 if(-not $acl.AreAccessRulesProtected){throw 'INDEXER_PRIVATE_ACL_INVALID'}
 $allowed=@($identity.User.Value,'S-1-5-18','S-1-5-32-544')
 foreach($rule in $acl.Access){if($allowed -notcontains $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value){throw 'INDEXER_PRIVATE_ACL_INVALID'}}
 $g=Get-Command git.exe -ErrorAction SilentlyContinue;$n=Get-Command node.exe -ErrorAction SilentlyContinue
 $gitExe=if($null -ne $g){$g.Source}else{Join-Path $env:ProgramFiles 'Git/cmd/git.exe'}
 $nodeExe=if($null -ne $n){$n.Source}else{Join-Path $env:ProgramFiles 'nodejs/node.exe'}
 $commit=(& $gitExe -C $taskRoot rev-parse HEAD).Trim();if($LASTEXITCODE -ne 0 -or $commit -notmatch '^[a-f0-9]{40}$'){throw 'INDEXER_SOURCE_INVALID'}
 $existing=Test-Path -LiteralPath $indexerVaultPath
 Write-Host 'GroupDeal Mainnet - Blockscout API key' -ForegroundColor Cyan
 Write-Host 'Revoke any key pasted in chat. Enter a NEW key here, never in chat.'
 if($VerifyOnly){Write-Host 'Local format verification only; no network connection.'}else{Write-Host 'One read-only Arc token-list GET to api.blockscout.com; no payment or wallet signing.'}
 if($existing){
  if((Get-Item -LiteralPath $indexerVaultPath).Length -gt 131072 -or ((Get-Item -LiteralPath $indexerVaultPath).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'INDEXER_VAULT_INVALID'}
  $vault=$serializer.DeserializeObject([IO.File]::ReadAllText($indexerVaultPath))
  if($vault['schemaVersion'] -ne 1 -or $vault['kind'] -ne 'GROUPDEAL_MAINNET_INDEXER_VAULT' -or $vault['ownerSid'] -ne $identity.User.Value){throw 'INDEXER_VAULT_INVALID'}
  $plainBytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($vault['ciphertext']),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $payload=$serializer.DeserializeObject($utf8.GetString($plainBytes));if($payload['chainId'] -ne 5042){throw 'INDEXER_VAULT_INVALID'}
  $apiKey=$payload['secrets']['BLOCKSCOUT_API_KEY']
 }else{
  if($VerifyOnly){throw 'INDEXER_VAULT_NOT_CREATED'}
  Status @{result='WAITING_FOR_INDEXER_INPUT';sourceCommit=$commit}
  $keySecure=Read-Host 'NEW BLOCKSCOUT_API_KEY (hidden)' -AsSecureString
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($keySecure)
  try{$apiKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
 }
 Status @{result='CHECKING_INDEXER';sourceCommit=$commit}
 $start=New-Object Diagnostics.ProcessStartInfo;$start.FileName=$nodeExe;$start.Arguments='"'+(Join-Path $PSScriptRoot 'check_mainnet_providers.cjs')+'"';$start.WorkingDirectory=$taskRoot
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $child=New-Object Diagnostics.Process;$child.StartInfo=$start
 try{
  [void]$child.Start();$child.StandardInput.Write($serializer.Serialize(@{provider='blockscout';apiKey=$apiKey;verifyConnection=(-not $VerifyOnly)}));$child.StandardInput.Close()
  $publicText=$child.StandardOutput.ReadToEnd();[void]$child.StandardError.ReadToEnd();$child.WaitForExit()
  if($publicText.Length -gt 2048){throw 'INDEXER_VALIDATOR_FAILED'};$checked=$serializer.DeserializeObject($publicText)
  if($child.ExitCode -ne 0 -or $checked['result'] -ne 'PASS'){
   $code=if(@('INDEXER_KEY_FORMAT_INVALID','INDEXER_TLS_VALIDATION_DISABLED','INDEXER_AUTHENTICATION_FAILED','INDEXER_READ_UNAVAILABLE','INDEXER_RESPONSE_INVALID','INDEXER_READONLY_REQUEST_FAILED') -contains $checked['code']){$checked['code']}else{'INDEXER_VALIDATOR_FAILED'};throw $code
  }
 }finally{$child.Dispose()}
 if(-not $existing){
  $payload=@{chainId=5042;sourceCommit=$commit;secrets=@{BLOCKSCOUT_API_KEY=$apiKey}}
  $plainBytes=$utf8.GetBytes($serializer.Serialize($payload));$encrypted=[Security.Cryptography.ProtectedData]::Protect($plainBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $envelope=@{schemaVersion=1;kind='GROUPDEAL_MAINNET_INDEXER_VAULT';ownerSid=$identity.User.Value;createdAt=[DateTime]::UtcNow.ToString('o');ciphertext=[Convert]::ToBase64String($encrypted)}
  $bytes=$utf8.GetBytes($serializer.Serialize($envelope));$stream=New-Object IO.FileStream($indexerVaultPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 }
 foreach($p in $otherVaults.Keys){if((Digest $p) -ne $otherVaults[$p]){throw 'MAINNET_PROVIDER_VAULT_CHANGED'}}
 Status @{result='INDEXER_LOCAL_STAGED';sourceCommit=$commit;indexerConfigurationPresent=$true;indexerReadVerified=$checked['indexerReadVerified'];otherVaultsUnchanged=$true;protection='Windows-DPAPI-CurrentUser'}
 Write-Host 'PASS: indexer key stored/verified. Production services remain inactive.' -ForegroundColor Green
 $succeeded=$true
}catch{
 $known=@('RUN_AS_YOUR_WINDOWS_ACCOUNT','INDEXER_PRIVATE_PATH_INVALID','MAINNET_PROVIDER_VAULT_REQUIRED','INDEXER_PRIVATE_ACL_INVALID','INDEXER_SOURCE_INVALID','INDEXER_VAULT_INVALID','INDEXER_VAULT_NOT_CREATED','INDEXER_KEY_FORMAT_INVALID','INDEXER_TLS_VALIDATION_DISABLED','INDEXER_AUTHENTICATION_FAILED','INDEXER_READ_UNAVAILABLE','INDEXER_RESPONSE_INVALID','INDEXER_READONLY_REQUEST_FAILED','INDEXER_VALIDATOR_FAILED','MAINNET_PROVIDER_VAULT_CHANGED')
 $code=if($known -contains $_.Exception.Message){$_.Exception.Message}else{'INDEXER_LOCAL_SETUP_FAILED'}
 if(Test-Path -LiteralPath $taskReportDirectory){Status @{result='FAIL';code=$code;errorType=$_.Exception.GetType().FullName;errorLine=$_.InvocationInfo.ScriptLineNumber}}
 Write-Host ('Stopped: '+$code) -ForegroundColor Red
}finally{
 if($null -ne $plainBytes){[Array]::Clear($plainBytes,0,$plainBytes.Length)}
 if($null -ne $keySecure){$keySecure.Dispose()};$apiKey=$null;$payload=$null
}
if(-not $VerifyOnly -and $succeeded){[void](Read-Host 'Press Enter to close')}
if(-not $succeeded){exit 1}
