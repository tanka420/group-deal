param([Parameter(Mandatory=$true)][string]$ReleaseCommit,[switch]$InstallApproved)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.Web.Extensions
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$privateDirectory=Join-Path $taskRoot '.cache/mainnet-private'
$serializer=New-Object Web.Script.Serialization.JavaScriptSerializer
$serializer.MaxJsonLength=131072
$utf8=New-Object Text.UTF8Encoding($false)
$values=@{};$plaintext=$null;$process=$null
function Digest([string]$File){$h=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($h.ComputeHash([IO.File]::ReadAllBytes($File))).Replace('-','')}finally{$h.Dispose()}}
try{
 if(-not $InstallApproved -or $ReleaseCommit -notmatch '^[a-f0-9]{40}$'){throw 'EXPLICIT_INSTALL_SCOPE_REQUIRED'}
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent();if($identity.Name -match 'CodexSandbox'){throw 'OWNER_CONTEXT_REQUIRED'}
 $privateInfo=Get-Item -LiteralPath $privateDirectory
 if($privateInfo.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PRIVATE_PATH_INVALID'}
 $acl=$privateInfo.GetAccessControl();if(-not $acl.AreAccessRulesProtected){throw 'PRIVATE_ACL_INVALID'}
 foreach($rule in $acl.Access){if(@($identity.User.Value,'S-1-5-18','S-1-5-32-544') -notcontains $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value){throw 'PRIVATE_ACL_INVALID'}}
 $specs=@(
  @{file='secrets.dpapi.json';kind='GROUPDEAL_MAINNET_LOCAL_SECRET_VAULT';keys=@('CIRCLE_API_KEY','AUTHORIZED_SIGNER_PRIVATE_KEY','JWT_SECRET','CAMPAIGN_IDENTITY_SECRET','MASTER_ENCRYPTION_KEY','MASTER_ENCRYPTION_KEY_ID')},
  @{file='smtp.dpapi.json';kind='GROUPDEAL_MAINNET_SMTP_VAULT';keys=@('SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_FROM','SMTP_APP_PASSWORD')},
  @{file='indexer.dpapi.json';kind='GROUPDEAL_MAINNET_INDEXER_VAULT';keys=@('BLOCKSCOUT_API_KEY')}
 )
 $digests=@{}
 foreach($spec in $specs){
  $file=Join-Path $privateDirectory $spec.file;$info=Get-Item -LiteralPath $file
  if($info.Length -gt 131072 -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'VAULT_INVALID'}
  $digests[$file]=Digest $file;$envelope=$serializer.DeserializeObject([IO.File]::ReadAllText($file))
  if($envelope['schemaVersion'] -ne 1 -or $envelope['kind'] -ne $spec.kind -or $envelope['ownerSid'] -ne $identity.User.Value){throw 'VAULT_OWNER_INVALID'}
  $plaintext=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($envelope['ciphertext']),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $payload=$serializer.DeserializeObject($utf8.GetString($plaintext))
  $chain=if($spec.file -eq 'secrets.dpapi.json'){$payload['context']['chainId']}else{$payload['chainId']}
  if($chain -ne 5042){throw 'VAULT_CHAIN_INVALID'}
  foreach($key in $spec.keys){if(-not ($payload['secrets'][$key] -is [string]) -or -not $payload['secrets'][$key]){throw 'VAULT_FIELD_MISSING'};$values[$key]=$payload['secrets'][$key]}
  [Array]::Clear($plaintext,0,$plaintext.Length);$plaintext=$null;$payload=$null
 }
 $sshExe=(Get-Command ssh.exe).Source
 $start=New-Object Diagnostics.ProcessStartInfo
 $start.FileName=$sshExe
 $start.Arguments='-o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -o ServerAliveInterval=10 -o ServerAliveCountMax=2 tan-picks "sudo -n /usr/bin/python3 /opt/groupdeal-mainnet/releases/'+$ReleaseCommit+'/ops/receive_credentials.py '+$ReleaseCommit+'"'
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $process=New-Object Diagnostics.Process;$process.StartInfo=$start;[void]$process.Start()
 $outputTask=$process.StandardOutput.ReadToEndAsync();$errorTask=$process.StandardError.ReadToEndAsync()
 # Plaintext goes only to the authenticated SSH channel, never argv, a local file or console.
 $process.StandardInput.Write($serializer.Serialize(@{releaseCommit=$ReleaseCommit;secrets=$values}));$process.StandardInput.Close()
 if(-not $process.WaitForExit(90000)){$process.Kill();throw 'SSH_INSTALL_TIMEOUT'}
 $publicOutput=$outputTask.Result;[void]$errorTask.Result
 if($process.ExitCode -ne 0 -or $publicOutput.Length -gt 2048){throw 'REMOTE_INSTALL_REJECTED'}
 $result=$serializer.DeserializeObject($publicOutput)
 if($result['result'] -ne 'MAINNET_CREDENTIALS_INSTALLED' -or $result['releaseCommit'] -ne $ReleaseCommit -or $result['credentialsPrinted'] -ne $false -or $result['serviceActivated'] -ne $false){throw 'REMOTE_RECEIPT_INVALID'}
 foreach($file in $digests.Keys){if((Digest $file) -ne $digests[$file]){throw 'LOCAL_VAULT_CHANGED'}}
 Write-Output (@{result='MAINNET_CREDENTIALS_INSTALLED';releaseCommit=$ReleaseCommit;localVaultsUnchanged=$true;credentialsPrinted=$false;backendActivated=$false}|ConvertTo-Json -Compress)
}catch{
 # Do not emit exception text, remote stderr, provider bodies or the decrypted payload.
 Write-Output '{"result":"MAINNET_CREDENTIAL_EXPORT_REJECTED","credentialsPrinted":false,"backendActivated":false}'
 exit 1
}finally{
 if($null -ne $plaintext){[Array]::Clear($plaintext,0,$plaintext.Length)}
 if($null -ne $process){$process.Dispose()};$values=$null;$payload=$null;$publicOutput=$null
}
