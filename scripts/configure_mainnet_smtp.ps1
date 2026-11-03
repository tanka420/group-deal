param([switch]$VerifyOnly,[string]$ReportDirectory='')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.Web.Extensions
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$privateDirectory=Join-Path $taskRoot '.cache/mainnet-private'
$mainVaultPath=Join-Path $privateDirectory 'secrets.dpapi.json'
$smtpVaultPath=Join-Path $privateDirectory 'smtp.dpapi.json'
$reportRoot=Join-Path $taskRoot '.cache/mainnet-smtp-input'
$taskReportDirectory=if($ReportDirectory){[IO.Path]::GetFullPath($ReportDirectory)}else{Join-Path $reportRoot ([Guid]::NewGuid().ToString())}
if(-not $taskReportDirectory.StartsWith($reportRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'SMTP_STATUS_PATH_INVALID'}
$statusPath=Join-Path $taskReportDirectory 'STATUS.json'
$utf8=New-Object Text.UTF8Encoding($false)
$serializer=New-Object Web.Script.Serialization.JavaScriptSerializer
$serializer.MaxJsonLength=131072
$smtpSettings=$null;$plainBytes=$null;$passwordSecure=$null;$succeeded=$false
function Digest([string]$File){$h=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($h.ComputeHash([IO.File]::ReadAllBytes($File))).Replace('-','')}finally{$h.Dispose()}}
function Status([hashtable]$Fields){
 $r=@{schemaVersion=1;chainId=5042;recordedAt=[DateTime]::UtcNow.ToString('o');emailsSent=0;backendActivated=$false;broadcastAuthorized=$false;acceptanceEligible=$false}
 foreach($e in $Fields.GetEnumerator()){$r[$e.Key]=$e.Value};[IO.File]::WriteAllText($statusPath,($r|ConvertTo-Json -Depth 6),$utf8)
}
try{
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent();if($identity.Name -match 'CodexSandbox'){throw 'RUN_AS_YOUR_WINDOWS_ACCOUNT'}
 [void][IO.Directory]::CreateDirectory($taskReportDirectory)
 foreach($p in @((Join-Path $taskRoot '.cache'),$privateDirectory,$reportRoot,$taskReportDirectory)){
  if(-not (Test-Path -LiteralPath $p) -or ((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'SMTP_PRIVATE_PATH_INVALID'}
 }
 if(-not (Test-Path -LiteralPath $mainVaultPath -PathType Leaf)){throw 'MAINNET_CORE_VAULT_REQUIRED'}
 $mainVaultDigest=Digest $mainVaultPath
 $info=New-Object IO.DirectoryInfo($privateDirectory)
 $acl=if($info.PSObject.Methods.Name -contains 'GetAccessControl'){$info.GetAccessControl()}else{[IO.FileSystemAclExtensions]::GetAccessControl($info)}
 if(-not $acl.AreAccessRulesProtected){throw 'SMTP_PRIVATE_ACL_INVALID'}
 $allowed=@($identity.User.Value,'S-1-5-18','S-1-5-32-544')
 foreach($rule in $acl.Access){if($allowed -notcontains $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value){throw 'SMTP_PRIVATE_ACL_INVALID'}}
 $g=Get-Command git.exe -ErrorAction SilentlyContinue;$n=Get-Command node.exe -ErrorAction SilentlyContinue
 $gitExe=if($null -ne $g){$g.Source}else{Join-Path $env:ProgramFiles 'Git/cmd/git.exe'}
 $nodeExe=if($null -ne $n){$n.Source}else{Join-Path $env:ProgramFiles 'nodejs/node.exe'}
 $commit=(& $gitExe -C $taskRoot rev-parse HEAD).Trim();if($LASTEXITCODE -ne 0 -or $commit -notmatch '^[a-f0-9]{40}$'){throw 'SMTP_SOURCE_INVALID'}
 $existing=Test-Path -LiteralPath $smtpVaultPath
 Write-Host 'GroupDeal Mainnet - SMTP configuration' -ForegroundColor Cyan
 Write-Host 'Use the same SMTP account configured in Circle. Do not enter wallet keys.'
 if($VerifyOnly){Write-Host 'Local format verification only; no network connection.'}else{Write-Host 'Only TLS/login verification to the SMTP_HOST you enter; no email is sent.'}
 if($existing){
  if((Get-Item -LiteralPath $smtpVaultPath).Length -gt 131072 -or ((Get-Item -LiteralPath $smtpVaultPath).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'SMTP_VAULT_INVALID'}
  $vault=$serializer.DeserializeObject([IO.File]::ReadAllText($smtpVaultPath))
  if($vault['schemaVersion'] -ne 1 -or $vault['kind'] -ne 'GROUPDEAL_MAINNET_SMTP_VAULT' -or $vault['ownerSid'] -ne $identity.User.Value){throw 'SMTP_VAULT_INVALID'}
  $plainBytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($vault['ciphertext']),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $payload=$serializer.DeserializeObject($utf8.GetString($plainBytes));if($payload['chainId'] -ne 5042){throw 'SMTP_VAULT_INVALID'}
  $smtpSettings=$payload['secrets']
 }else{
  if($VerifyOnly){throw 'SMTP_VAULT_NOT_CREATED'}
  Status @{result='WAITING_FOR_SMTP_INPUT';sourceCommit=$commit}
  $smtpServer=(Read-Host 'SMTP_HOST (hostname only)').Trim()
  $smtpPort=(Read-Host 'SMTP_PORT (465 or 587; Enter = 587)').Trim();if(-not $smtpPort){$smtpPort='587'}
  $smtpLogin=(Read-Host 'SMTP_USER (account/login)').Trim()
  $smtpSender=(Read-Host 'SMTP_FROM (email; Enter = SMTP_USER)').Trim();if(-not $smtpSender){$smtpSender=$smtpLogin}
  $passwordSecure=Read-Host 'SMTP_APP_PASSWORD (hidden)' -AsSecureString
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordSecure)
  try{$smtpPassword=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
  $smtpSettings=@{SMTP_HOST=$smtpServer;SMTP_PORT=$smtpPort;SMTP_SECURE=if($smtpPort -eq '465'){'true'}else{'false'};SMTP_USER=$smtpLogin;SMTP_FROM=$smtpSender;SMTP_APP_PASSWORD=$smtpPassword}
  $smtpPassword=$null
 }
 Status @{result='CHECKING_SMTP';sourceCommit=$commit}
 $start=New-Object Diagnostics.ProcessStartInfo;$start.FileName=$nodeExe;$start.Arguments='"'+(Join-Path $PSScriptRoot 'check_mainnet_providers.cjs')+'"';$start.WorkingDirectory=$taskRoot
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $child=New-Object Diagnostics.Process;$child.StartInfo=$start
 try{
  [void]$child.Start();$child.StandardInput.Write($serializer.Serialize(@{provider='smtp';settings=$smtpSettings;verifyConnection=(-not $VerifyOnly)}));$child.StandardInput.Close()
  $publicText=$child.StandardOutput.ReadToEnd();[void]$child.StandardError.ReadToEnd();$child.WaitForExit()
  if($publicText.Length -gt 2048){throw 'SMTP_VALIDATOR_FAILED'};$checked=$serializer.DeserializeObject($publicText)
  if($child.ExitCode -ne 0 -or $checked['result'] -ne 'PASS'){
   $code=if(@('SMTP_CONFIGURATION_INVALID','SMTP_AUTHENTICATION_FAILED','SMTP_TLS_OR_CONNECTION_FAILED') -contains $checked['code']){$checked['code']}else{'SMTP_VALIDATOR_FAILED'};throw $code
  }
 }finally{$child.Dispose()}
 if(-not $existing){
  $payload=@{chainId=5042;sourceCommit=$commit;secrets=$smtpSettings}
  $plainBytes=$utf8.GetBytes($serializer.Serialize($payload));$encrypted=[Security.Cryptography.ProtectedData]::Protect($plainBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $envelope=@{schemaVersion=1;kind='GROUPDEAL_MAINNET_SMTP_VAULT';ownerSid=$identity.User.Value;createdAt=[DateTime]::UtcNow.ToString('o');ciphertext=[Convert]::ToBase64String($encrypted)}
  $bytes=$utf8.GetBytes($serializer.Serialize($envelope));$stream=New-Object IO.FileStream($smtpVaultPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 }
 if((Digest $mainVaultPath) -ne $mainVaultDigest){throw 'MAINNET_CORE_VAULT_CHANGED'}
 Status @{result='SMTP_LOCAL_STAGED';sourceCommit=$commit;smtpConfigurationPresent=$true;smtpConnectionVerified=$checked['smtpConnectionVerified'];emailDeliveryVerified=$false;coreVaultUnchanged=$true;protection='Windows-DPAPI-CurrentUser'}
 Write-Host 'PASS: SMTP configuration stored/verified. No email was sent.' -ForegroundColor Green
 $succeeded=$true
}catch{
 $known=@('RUN_AS_YOUR_WINDOWS_ACCOUNT','SMTP_PRIVATE_PATH_INVALID','MAINNET_CORE_VAULT_REQUIRED','SMTP_PRIVATE_ACL_INVALID','SMTP_SOURCE_INVALID','SMTP_VAULT_INVALID','SMTP_VAULT_NOT_CREATED','SMTP_CONFIGURATION_INVALID','SMTP_AUTHENTICATION_FAILED','SMTP_TLS_OR_CONNECTION_FAILED','SMTP_VALIDATOR_FAILED','MAINNET_CORE_VAULT_CHANGED')
 $code=if($known -contains $_.Exception.Message){$_.Exception.Message}else{'SMTP_LOCAL_SETUP_FAILED'}
 if(Test-Path -LiteralPath $taskReportDirectory){Status @{result='FAIL';code=$code;errorType=$_.Exception.GetType().FullName;errorLine=$_.InvocationInfo.ScriptLineNumber}}
 Write-Host ('Stopped: '+$code) -ForegroundColor Red
}finally{
 if($null -ne $plainBytes){[Array]::Clear($plainBytes,0,$plainBytes.Length)}
 if($null -ne $passwordSecure){$passwordSecure.Dispose()};$smtpSettings=$null;$smtpPassword=$null;$payload=$null
}
if(-not $VerifyOnly -and $succeeded){[void](Read-Host 'Press Enter to close')}
if(-not $succeeded){exit 1}
