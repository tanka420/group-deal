$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixtureRoot=Join-Path $taskRoot ('.cache/mainnet-smtp-tests/'+[Guid]::NewGuid().ToString()+'/repo')
foreach($part in @('scripts','shared','.cache/mainnet-private')){[void][IO.Directory]::CreateDirectory((Join-Path $fixtureRoot $part))}
$utf8=New-Object Text.UTF8Encoding($false)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'configure_mainnet_smtp.ps1') -Destination (Join-Path $fixtureRoot 'scripts/configure_mainnet_smtp.ps1')
Copy-Item -LiteralPath (Join-Path $taskRoot 'shared/mainnet-public.json') -Destination (Join-Path $fixtureRoot 'shared/mainnet-public.json')
$provider=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'check_mainnet_providers.cjs')).Replace("require('../backend/node_modules/nodemailer')","require('./fixture_nodemailer.cjs')")
[IO.File]::WriteAllText((Join-Path $fixtureRoot 'scripts/check_mainnet_providers.cjs'),$provider,$utf8)
[IO.File]::WriteAllText((Join-Path $fixtureRoot 'scripts/fixture_nodemailer.cjs'),"module.exports={createTransport:o=>({verify:async()=>{if(!o.tls.rejectUnauthorized||o.debug)throw Error('fixture TLS/logging failed')},close:()=>{},sendMail:()=>{throw Error('email forbidden')}})};",$utf8)
$private=Join-Path $fixtureRoot '.cache/mainnet-private'
$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false)
$user=[Security.Principal.WindowsIdentity]::GetCurrent().User
foreach($sid in @($user,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),(New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))){
 [void]$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)))
}
$dir=New-Object IO.DirectoryInfo($private);if($dir.PSObject.Methods.Name -contains 'SetAccessControl'){$dir.SetAccessControl($acl)}else{[IO.FileSystemAclExtensions]::SetAccessControl($dir,$acl)}
$core=Join-Path $private 'secrets.dpapi.json';[IO.File]::WriteAllText($core,'ISOLATED_CORE_VAULT_MARKER_NOT_A_USER_KEY',$utf8)
$fixturePassword='fixture_'+[Guid]::NewGuid().ToString('n')
function global:Read-Host{
 param([string]$Prompt,[switch]$AsSecureString)
 if($AsSecureString){$s=New-Object Security.SecureString;foreach($c in $fixturePassword.ToCharArray()){$s.AppendChar($c)};return $s}
 if($Prompt.StartsWith('SMTP_HOST')){return 'smtp.fixture.invalid'}
 if($Prompt.StartsWith('SMTP_PORT')){return '587'}
 if($Prompt.StartsWith('SMTP_USER')){return 'fixture@example.invalid'}
 return ''
}
$script=Join-Path $fixtureRoot 'scripts/configure_mainnet_smtp.ps1'
$report=Join-Path $fixtureRoot '.cache/mainnet-smtp-input/first'
& $script -ReportDirectory $report
$status=[IO.File]::ReadAllText((Join-Path $report 'STATUS.json'))|ConvertFrom-Json
if($status.result -ne 'SMTP_LOCAL_STAGED' -or -not $status.smtpConnectionVerified -or -not $status.coreVaultUnchanged -or $status.emailsSent -ne 0){throw 'SMTP fixture staging failed'}
$file=Join-Path $private 'smtp.dpapi.json';$before=[IO.File]::ReadAllText($file);$envelope=$before|ConvertFrom-Json
$bytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($envelope.ciphertext),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$payload=$utf8.GetString($bytes)|ConvertFrom-Json
if($payload.secrets.SMTP_APP_PASSWORD -cne $fixturePassword){throw 'SMTP fixture DPAPI mismatch'}
if($before.Contains($fixturePassword) -or [IO.File]::ReadAllText((Join-Path $report 'STATUS.json')).Contains($fixturePassword)){throw 'SMTP fixture password leaked'}
& $script -VerifyOnly -ReportDirectory (Join-Path $fixtureRoot '.cache/mainnet-smtp-input/recheck')
if([IO.File]::ReadAllText($file) -cne $before -or [IO.File]::ReadAllText($core) -cne 'ISOLATED_CORE_VAULT_MARKER_NOT_A_USER_KEY'){throw 'SMTP fixture verification modified a vault'}
[Array]::Clear($bytes,0,$bytes.Length);Remove-Item Function:\Read-Host
Write-Output 'PASS: isolated SMTP input/encryption, TLS verifier boundary, no email, core vault untouched and verify-only no overwrite.'
exit 0
