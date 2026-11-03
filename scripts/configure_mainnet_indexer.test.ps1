$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixtureRoot=Join-Path $taskRoot ('.cache/mainnet-indexer-tests/'+[Guid]::NewGuid().ToString()+'/repo')
foreach($part in @('scripts','shared/manifests','.cache/mainnet-private')){[void][IO.Directory]::CreateDirectory((Join-Path $fixtureRoot $part))}
$utf8=New-Object Text.UTF8Encoding($false)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'configure_mainnet_indexer.ps1') -Destination (Join-Path $fixtureRoot 'scripts/configure_mainnet_indexer.ps1')
Copy-Item -LiteralPath (Join-Path $taskRoot 'shared/mainnet-public.json') -Destination (Join-Path $fixtureRoot 'shared/mainnet-public.json')
Copy-Item -LiteralPath (Join-Path $taskRoot 'shared/manifests/arc-mainnet.json') -Destination (Join-Path $fixtureRoot 'shared/manifests/arc-mainnet.json')
$provider=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'check_mainnet_providers.cjs')).Replace("require('../backend/node_modules/nodemailer')","({})")
$mock="global.fetch=async(url,o)=>{if(!url.startsWith('https://api.blockscout.com/5042/')||o.redirect!=='error'||!o.headers.authorization.startsWith('Bearer proapi_fixture_'))throw Error('Fixture boundary invalid');return new Response(JSON.stringify({items:[],next_page_params:null}));};"
$provider=$provider.Replace('if(require.main===module){',$mock+[Environment]::NewLine+'if(require.main===module){')
[IO.File]::WriteAllText((Join-Path $fixtureRoot 'scripts/check_mainnet_providers.cjs'),$provider,$utf8)
$private=Join-Path $fixtureRoot '.cache/mainnet-private'
$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false)
$user=[Security.Principal.WindowsIdentity]::GetCurrent().User
foreach($sid in @($user,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),(New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))){
 [void]$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)))
}
$dir=New-Object IO.DirectoryInfo($private);if($dir.PSObject.Methods.Name -contains 'SetAccessControl'){$dir.SetAccessControl($acl)}else{[IO.FileSystemAclExtensions]::SetAccessControl($dir,$acl)}
foreach($name in @('secrets.dpapi.json','smtp.dpapi.json')){[IO.File]::WriteAllText((Join-Path $private $name),'ISOLATED_VAULT_MARKER_NOT_A_USER_KEY',$utf8)}
$fixtureKey='proapi_fixture_'+[Guid]::NewGuid().ToString('n')
function global:Read-Host{
 param([string]$Prompt,[switch]$AsSecureString)
 if($AsSecureString){$s=New-Object Security.SecureString;foreach($c in $fixtureKey.ToCharArray()){$s.AppendChar($c)};return $s};return ''
}
$script=Join-Path $fixtureRoot 'scripts/configure_mainnet_indexer.ps1'
$report=Join-Path $fixtureRoot '.cache/mainnet-indexer-input/first'
& $script -ReportDirectory $report
$status=[IO.File]::ReadAllText((Join-Path $report 'STATUS.json'))|ConvertFrom-Json
if($status.result -ne 'INDEXER_LOCAL_STAGED' -or -not $status.indexerReadVerified -or -not $status.otherVaultsUnchanged -or $status.transactionsSubmitted -ne 0){throw 'Indexer fixture staging failed'}
$file=Join-Path $private 'indexer.dpapi.json';$before=[IO.File]::ReadAllText($file);$envelope=$before|ConvertFrom-Json
$bytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($envelope.ciphertext),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$payload=$utf8.GetString($bytes)|ConvertFrom-Json
if($payload.secrets.BLOCKSCOUT_API_KEY -cne $fixtureKey){throw 'Indexer fixture DPAPI mismatch'}
if($before.Contains($fixtureKey) -or [IO.File]::ReadAllText((Join-Path $report 'STATUS.json')).Contains($fixtureKey)){throw 'Indexer fixture key leaked'}
& $script -VerifyOnly -ReportDirectory (Join-Path $fixtureRoot '.cache/mainnet-indexer-input/recheck')
if([IO.File]::ReadAllText($file) -cne $before){throw 'Verification modified indexer vault'}
foreach($name in @('secrets.dpapi.json','smtp.dpapi.json')){if([IO.File]::ReadAllText((Join-Path $private $name)) -cne 'ISOLATED_VAULT_MARKER_NOT_A_USER_KEY'){throw 'Verification modified another vault'}}
[Array]::Clear($bytes,0,$bytes.Length);Remove-Item Function:\Read-Host
Write-Output 'PASS: isolated indexer input/DPAPI, fixed mock GET, no plaintext, other vaults untouched and verify-only no overwrite.'
exit 0
