param([switch]$VerifyOnly,[switch]$CheckCircle,[string]$ReportDirectory='')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.Web.Extensions
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$cacheRoot=Join-Path $taskRoot '.cache'
$privateDirectory=Join-Path $cacheRoot 'mainnet-private'
$vaultPath=Join-Path $privateDirectory 'secrets.dpapi.json'
$statusRoot=Join-Path $cacheRoot 'mainnet-secret-input'
$taskReportDirectory=if($ReportDirectory){[IO.Path]::GetFullPath($ReportDirectory)}else{Join-Path $statusRoot ([Guid]::NewGuid().ToString())}
if(-not $taskReportDirectory.StartsWith($statusRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'MAINNET_STATUS_PATH_INVALID'}
$statusPath=Join-Path $taskReportDirectory 'STATUS.json'
$serializer=New-Object System.Web.Script.Serialization.JavaScriptSerializer
$serializer.MaxJsonLength=131072
$utf8=New-Object System.Text.UTF8Encoding($false)
$secretPayload=$null;$vaultBytes=$null;$apiSecure=$null;$signerSecure=$null
$setupSucceeded=$false
$setupPhase='PREREQUISITES'
function Write-Status([hashtable]$Fields){
 $record=@{schemaVersion=1;chainId=5042;recordedAt=[DateTime]::UtcNow.ToString('o');vaultPath=$vaultPath;backendActivated=$false;broadcastAuthorized=$false;circleCredentialVerified=$false;acceptanceEligible=$false}
 foreach($entry in $Fields.GetEnumerator()){$record[$entry.Key]=$entry.Value}
 [IO.File]::WriteAllText($statusPath,($record|ConvertTo-Json -Depth 8),$utf8)
}
function Secure-ToText([Security.SecureString]$Value){
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
 try{return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
}
function New-AppSecret{
 $bytes=New-Object byte[] 32;$generator=[Security.Cryptography.RandomNumberGenerator]::Create()
 try{$generator.GetBytes($bytes);return [BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant()}finally{[Array]::Clear($bytes,0,$bytes.Length);$generator.Dispose()}
}
function Check-Secrets{
 $start=New-Object Diagnostics.ProcessStartInfo
 $start.FileName=$script:nodeExe
 $start.Arguments='"'+(Join-Path $PSScriptRoot 'validate_mainnet_secret_input.cjs')+'"'
 $start.WorkingDirectory=$taskRoot;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
 $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $child=New-Object Diagnostics.Process;$child.StartInfo=$start
 try{
  [void]$child.Start()
  # The plaintext JSON goes only to the local validator's stdin, never argv, env, disk or console.
  $child.StandardInput.Write($serializer.Serialize(@{circleApiKey=$script:secretPayload['secrets']['CIRCLE_API_KEY'];signerPrivateKey=$script:secretPayload['secrets']['AUTHORIZED_SIGNER_PRIVATE_KEY']}));$child.StandardInput.Close()
  $publicOutput=$child.StandardOutput.ReadToEnd();[void]$child.StandardError.ReadToEnd();$child.WaitForExit()
  if($publicOutput.Length -gt 2048){throw 'SECRET_VALIDATOR_OUTPUT_INVALID'}
  $checked=$serializer.DeserializeObject($publicOutput)
  if($checked['result'] -ne 'PASS'){
   $safeCodes=@('CIRCLE_KEY_FORMAT_INVALID_OR_TEST_KEY','SIGNER_KEY_FORMAT_INVALID','SIGNER_ADDRESS_MISMATCH','SIGNER_ROLE_COLLISION','SECRET_INPUT_INVALID','EXPECTED_MAINNET_SIGNER_MISSING','SECRET_INPUT_UNREADABLE')
   $code=if($safeCodes -contains $checked['code']){$checked['code']}else{'SECRET_VALIDATION_FAILED'}
   throw $code
  }
  if($child.ExitCode -ne 0){throw 'SECRET_VALIDATION_FAILED'}
  if($checked['signerAddress'] -ne $expectedSigner -or $checked['signerMatchesManifest'] -ne $true){throw 'SECRET_VALIDATOR_OUTPUT_INVALID'}
  return @{result='PASS';signerAddress=$expectedSigner}
 }finally{$child.Dispose()}
}
function Check-CircleCredential{
 $start=New-Object Diagnostics.ProcessStartInfo;$start.FileName=$script:nodeExe;$start.Arguments='"'+(Join-Path $PSScriptRoot 'check_mainnet_providers.cjs')+'"'
 $start.WorkingDirectory=$taskRoot;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $child=New-Object Diagnostics.Process;$child.StartInfo=$start
 try{
  [void]$child.Start();$child.StandardInput.Write($serializer.Serialize(@{provider='circle';circleApiKey=$script:secretPayload['secrets']['CIRCLE_API_KEY']}));$child.StandardInput.Close()
  $publicOutput=$child.StandardOutput.ReadToEnd();[void]$child.StandardError.ReadToEnd();$child.WaitForExit()
  if($publicOutput.Length -gt 4096){throw 'CIRCLE_PROBE_FAILED'};$checked=$serializer.DeserializeObject($publicOutput)
  if($child.ExitCode -ne 0 -or $checked['result'] -ne 'PASS'){
   $safeCodes=@('CIRCLE_MAINNET_KEY_FORMAT_INVALID','CIRCLE_AUTHENTICATION_FAILED','CIRCLE_CONFIG_READ_UNAVAILABLE','CIRCLE_CONFIG_RESPONSE_INVALID','CIRCLE_APP_ID_MISMATCH','CIRCLE_READONLY_REQUEST_FAILED','CIRCLE_TLS_VALIDATION_DISABLED')
   $code=if($safeCodes -contains $checked['code']){$checked['code']}else{'CIRCLE_PROBE_FAILED'};throw $code
  }
  if($checked['httpStatus'] -ne 200 -or $checked['circleCredentialVerified'] -ne $true -or $checked['circleAppIdMatches'] -ne $true){throw 'CIRCLE_PROBE_FAILED'}
  return $true
 }finally{$child.Dispose()}
}
try{
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
 if($identity.Name -match 'CodexSandbox'){throw 'RUN_AS_YOUR_WINDOWS_ACCOUNT'}
 $ownerSid=$identity.User
 foreach($directory in @($cacheRoot,$privateDirectory,$statusRoot,$taskReportDirectory)){
  if(Test-Path -LiteralPath $directory){if((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'MAINNET_PRIVATE_PATH_REPARSE_POINT'}}else{[void][IO.Directory]::CreateDirectory($directory)}
 }
 $setupPhase='LOCAL_TOOLS'
 $gitCommand=Get-Command git.exe -ErrorAction SilentlyContinue
 $nodeCommand=Get-Command node.exe -ErrorAction SilentlyContinue
 $gitExe=if($null -ne $gitCommand){$gitCommand.Source}else{Join-Path $env:ProgramFiles 'Git/cmd/git.exe'}
 $nodeExe=if($null -ne $nodeCommand){$nodeCommand.Source}else{Join-Path $env:ProgramFiles 'nodejs/node.exe'}
 if(-not (Test-Path -LiteralPath $gitExe -PathType Leaf) -or -not (Test-Path -LiteralPath $nodeExe -PathType Leaf)){throw 'MAINNET_LOCAL_TOOL_MISSING'}
 $setupPhase='SOURCE_CONTEXT'
 $sourceCommit=(& $gitExe -C $taskRoot rev-parse HEAD).Trim()
 if($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[a-f0-9]{40}$'){throw 'MAINNET_SOURCE_COMMIT_INVALID'}
 $manifestPath=Join-Path $taskRoot 'shared/manifests/arc-mainnet.json'
 $manifest=$serializer.DeserializeObject([IO.File]::ReadAllText($manifestPath))
 if($manifest['environment'] -ne 'arc-mainnet' -or $manifest['chainId'] -ne 5042){throw 'MAINNET_MANIFEST_INVALID'}
 $expectedSigner=$manifest['roles']['authorizedSigner']['address']
 $manifestHasher=[Security.Cryptography.SHA256]::Create()
 try{$manifestDigest=[BitConverter]::ToString($manifestHasher.ComputeHash([IO.File]::ReadAllBytes($manifestPath))).Replace('-','').ToLowerInvariant()}finally{$manifestHasher.Dispose()}
 $context=@{chainId=5042;sourceCommit=$sourceCommit;manifestSha256=$manifestDigest;expectedSigner=$expectedSigner}
 $setupPhase='OWNER_INPUT'
 Write-Status @{result='WAITING_FOR_OWNER_INPUT';expectedSigner=$expectedSigner;sourceCommit=$sourceCommit}
 Write-Host 'GroupDeal Arc Mainnet - LOCAL SECRET SETUP' -ForegroundColor Cyan
 Write-Host ('Expected signer: '+$expectedSigner)
 if($CheckCircle){Write-Host 'Only GET https://api.circle.com/v1/w3s/config/entity. No wallet/OTP creation or transactions.'}else{Write-Host 'No network calls, signatures, deployment, billing or VPS changes.'}
 Write-Host 'Input is hidden. Paste keys only in this window, never in chat.'
 if(Test-Path -LiteralPath $vaultPath){
  if((Get-Item -LiteralPath $vaultPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'MAINNET_PRIVATE_PATH_REPARSE_POINT'}
  if((Get-Item -LiteralPath $vaultPath).Length -gt 131072){throw 'LOCAL_VAULT_INVALID'}
  Write-Host 'Existing vault found: verifying it without replacing any keys.'
  $vault=$serializer.DeserializeObject([IO.File]::ReadAllText($vaultPath))
  if($vault['schemaVersion'] -ne 1 -or $vault['kind'] -ne 'GROUPDEAL_MAINNET_LOCAL_SECRET_VAULT' -or $vault['ownerSid'] -ne $ownerSid.Value){throw 'LOCAL_VAULT_CONTEXT_MISMATCH'}
  $vaultBytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($vault['ciphertext']),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $secretPayload=$serializer.DeserializeObject($utf8.GetString($vaultBytes))
  if($secretPayload['context']['chainId'] -ne 5042 -or $secretPayload['context']['expectedSigner'] -ne $expectedSigner){throw 'LOCAL_VAULT_CONTEXT_MISMATCH'}
  $validation=Check-Secrets
 }else{
  if($VerifyOnly){throw 'LOCAL_VAULT_NOT_CREATED'}
  # Restrict the new secret directory to this Windows account, SYSTEM and Administrators.
  $acl=New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true,$false)
  foreach($sid in @($ownerSid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),(New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))){
   $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
   [void]$acl.AddAccessRule($rule)
  }
  $privateInfo=New-Object IO.DirectoryInfo($privateDirectory)
  if($privateInfo.PSObject.Methods.Name -contains 'SetAccessControl'){$privateInfo.SetAccessControl($acl)}else{[IO.FileSystemAclExtensions]::SetAccessControl($privateInfo,$acl)}
  $apiSecure=Read-Host '1/2 CIRCLE_API_KEY (hidden)' -AsSecureString
  $signerSecure=Read-Host '2/2 AUTHORIZED_SIGNER_PRIVATE_KEY (hidden)' -AsSecureString
  $apiText=(Secure-ToText $apiSecure).Trim();$signerText=(Secure-ToText $signerSecure).Trim()
  if($signerText -match '^[a-fA-F0-9]{64}$'){$signerText='0x'+$signerText}
  $secretPayload=@{context=$context;secrets=@{CIRCLE_API_KEY=$apiText;AUTHORIZED_SIGNER_PRIVATE_KEY=$signerText}}
  $apiText=$null;$signerText=$null
  $validation=Check-Secrets
  $secretPayload['secrets']['JWT_SECRET']=New-AppSecret
  $secretPayload['secrets']['CAMPAIGN_IDENTITY_SECRET']=New-AppSecret
  $secretPayload['secrets']['MASTER_ENCRYPTION_KEY']=New-AppSecret
  $secretPayload['secrets']['MASTER_ENCRYPTION_KEY_ID']='mainnet-v1'
  $apiText=$null;$signerText=$null
  $vaultBytes=$utf8.GetBytes($serializer.Serialize($secretPayload))
  $cipher=[Security.Cryptography.ProtectedData]::Protect($vaultBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $envelope=@{schemaVersion=1;kind='GROUPDEAL_MAINNET_LOCAL_SECRET_VAULT';protection='Windows-DPAPI-CurrentUser';ownerSid=$ownerSid.Value;createdAt=[DateTime]::UtcNow.ToString('o');ciphertext=[Convert]::ToBase64String($cipher)}
  $vaultText=$utf8.GetBytes($serializer.Serialize($envelope));$stream=New-Object IO.FileStream($vaultPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($vaultText,0,$vaultText.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 }
 foreach($name in @('JWT_SECRET','CAMPAIGN_IDENTITY_SECRET','MASTER_ENCRYPTION_KEY')){
  if($secretPayload['secrets'][$name] -notmatch '^[a-f0-9]{64}$'){throw 'LOCAL_APP_SECRET_INVALID'}
 }
 if($secretPayload['secrets']['MASTER_ENCRYPTION_KEY_ID'] -ne 'mainnet-v1'){throw 'LOCAL_APP_SECRET_INVALID'}
 $circleVerified=$false
 if($CheckCircle){$setupPhase='CIRCLE_READONLY_AUTH_CHECK';$circleVerified=Check-CircleCredential}
 Write-Status @{result='LOCAL_SECRETS_STAGED';sourceCommit=$sourceCommit;signerAddress=$validation['signerAddress'];signerMatchesManifest=$true;circleKeyPresent=$true;appSecretsPresent=$true;protection='Windows-DPAPI-CurrentUser';productionRuntimeConfigured=$false;circleCredentialVerified=$circleVerified;circleAppIdMatches=$circleVerified;otpVerified=$false}
 Write-Host 'PASS: signer matches; encrypted local vault saved/verified.' -ForegroundColor Green
 if($circleVerified){Write-Host 'PASS: Circle accepted the LIVE key for configuration read; App ID matches. OTP/Arc transactions remain unverified.'}else{Write-Host 'Circle key authentication and production runtime remain unverified.'}
 Write-Host ('Public status: '+$statusPath)
 $setupSucceeded=$true
}catch{
 # Do not print exceptions, inputs, stack traces, or child stderr (they may contain secrets).
 $knownCodes=@('CIRCLE_KEY_FORMAT_INVALID_OR_TEST_KEY','SIGNER_KEY_FORMAT_INVALID','SIGNER_ADDRESS_MISMATCH','SIGNER_ROLE_COLLISION','SECRET_INPUT_INVALID','EXPECTED_MAINNET_SIGNER_MISSING','SECRET_INPUT_UNREADABLE','SECRET_VALIDATION_FAILED','SECRET_VALIDATOR_OUTPUT_INVALID','RUN_AS_YOUR_WINDOWS_ACCOUNT','MAINNET_PRIVATE_PATH_REPARSE_POINT','MAINNET_SOURCE_COMMIT_INVALID','MAINNET_MANIFEST_INVALID','MAINNET_LOCAL_TOOL_MISSING','LOCAL_VAULT_INVALID','LOCAL_VAULT_CONTEXT_MISMATCH','LOCAL_VAULT_NOT_CREATED','LOCAL_APP_SECRET_INVALID','CIRCLE_MAINNET_KEY_FORMAT_INVALID','CIRCLE_AUTHENTICATION_FAILED','CIRCLE_CONFIG_READ_UNAVAILABLE','CIRCLE_CONFIG_RESPONSE_INVALID','CIRCLE_APP_ID_MISMATCH','CIRCLE_READONLY_REQUEST_FAILED','CIRCLE_TLS_VALIDATION_DISABLED','CIRCLE_PROBE_FAILED')
 $safeCode=if($knownCodes -contains $_.Exception.Message){$_.Exception.Message}else{'LOCAL_SECRET_SETUP_FAILED'}
 if(Test-Path -LiteralPath $taskReportDirectory){Write-Status @{result='FAIL';code=$safeCode;phase=$setupPhase;errorType=$_.Exception.GetType().FullName;errorLine=$_.InvocationInfo.ScriptLineNumber}}
 Write-Host ('Setup stopped: '+$safeCode) -ForegroundColor Red
}finally{
 if($null -ne $vaultBytes){[Array]::Clear($vaultBytes,0,$vaultBytes.Length)}
 if($null -ne $apiSecure){$apiSecure.Dispose()};if($null -ne $signerSecure){$signerSecure.Dispose()}
 $secretPayload=$null;$apiText=$null;$signerText=$null
}
if(-not $VerifyOnly -and $setupSucceeded){[void](Read-Host 'Press Enter to close')}
if(-not $setupSucceeded){exit 1}
