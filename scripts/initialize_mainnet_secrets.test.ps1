$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixtureRoot=Join-Path $taskRoot ('.cache/mainnet-secret-tests/'+[Guid]::NewGuid().ToString()+'/repo')
foreach($part in @('scripts','shared/manifests')){[void][IO.Directory]::CreateDirectory((Join-Path $fixtureRoot $part))}
$utf8=New-Object Text.UTF8Encoding($false)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'initialize_mainnet_secrets.ps1') -Destination (Join-Path $fixtureRoot 'scripts/initialize_mainnet_secrets.ps1')
$validator=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'validate_mainnet_secret_input.cjs'))
# Only dependency resolution changes in this isolated copy; validator logic and PS source stay identical.
$dependencyLiteral=([IO.Path]::Combine($taskRoot,'backend/node_modules/ethers').Replace('\','/'))|ConvertTo-Json -Compress
$validator=$validator.Replace("require('../backend/node_modules/ethers')",('require('+$dependencyLiteral+')'))
[IO.File]::WriteAllText((Join-Path $fixtureRoot 'scripts/validate_mainnet_secret_input.cjs'),$validator,$utf8)
$fixtureMaterial=(& node -e "const{ethers}=require('./backend/node_modules/ethers');const k=ethers.Wallet.createRandom();process.stdout.write(JSON.stringify({key:k.privateKey,address:k.address}));" | ConvertFrom-Json)
if($LASTEXITCODE -ne 0){throw 'Fixture key generation failed'}
$fixtureApi='LIVE_API_KEY:ISOLATED_FIXTURE:'+([Guid]::NewGuid().ToString('n'))
$fixtureManifest=@{environment='arc-mainnet';chainId=5042;roles=@{authorizedSigner=@{address=$fixtureMaterial.address};owner=@{address='0x1111111111111111111111111111111111111111'};operator=@{address='0x2222222222222222222222222222222222222222'}}}
$fixtureManifestPath=Join-Path $fixtureRoot 'shared/manifests/arc-mainnet.json'
[IO.File]::WriteAllText($fixtureManifestPath,($fixtureManifest|ConvertTo-Json -Depth 5),$utf8)
function global:Read-Host{
 param([string]$Prompt,[switch]$AsSecureString)
 if(-not $AsSecureString){return ''}
 $value=if($Prompt.StartsWith('1/2')){$fixtureApi}else{$fixtureMaterial.key}
 $secure=New-Object Security.SecureString;foreach($letter in $value.ToCharArray()){$secure.AppendChar($letter)}
 return $secure
}
$scriptPath=Join-Path $fixtureRoot 'scripts/initialize_mainnet_secrets.ps1'
$report1=Join-Path $fixtureRoot '.cache/mainnet-secret-input/first'
& $scriptPath -ReportDirectory $report1
$status=[IO.File]::ReadAllText((Join-Path $report1 'STATUS.json'))|ConvertFrom-Json
if($status.result -ne 'LOCAL_SECRETS_STAGED' -or -not $status.signerMatchesManifest -or $status.circleCredentialVerified -or $status.backendActivated){throw 'Fixture initial staging failed'}
$vaultPath=Join-Path $fixtureRoot '.cache/mainnet-private/secrets.dpapi.json'
$vaultBefore=Get-FileHash -LiteralPath $vaultPath -Algorithm SHA256
$vault=[IO.File]::ReadAllText($vaultPath)|ConvertFrom-Json
$plaintext=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($vault.ciphertext),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$payload=$utf8.GetString($plaintext)|ConvertFrom-Json
if($payload.secrets.CIRCLE_API_KEY -cne $fixtureApi -or $payload.secrets.AUTHORIZED_SIGNER_PRIVATE_KEY -cne $fixtureMaterial.key){throw 'Fixture DPAPI roundtrip mismatch'}
$appNames=@('JWT_SECRET','CAMPAIGN_IDENTITY_SECRET','MASTER_ENCRYPTION_KEY')
$appValues=@();foreach($name in $appNames){$value=$payload.secrets.$name;if($value -notmatch '^[a-f0-9]{64}$'){throw 'Fixture app secret format failed'};$appValues+=$value}
if(@($appValues|Select-Object -Unique).Count -ne 3){throw 'Fixture app secrets are not distinct'}
$acl=Get-Acl -LiteralPath (Split-Path $vaultPath -Parent)
if(-not $acl.AreAccessRulesProtected){throw 'Fixture private directory inherits ACL'}
$allowed=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')
foreach($rule in $acl.Access){if($allowed -notcontains $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value){throw 'Unexpected fixture private ACL principal'}}
$publicText=[IO.File]::ReadAllText((Join-Path $report1 'STATUS.json'))
$vaultText=[IO.File]::ReadAllText($vaultPath)
foreach($secret in @($fixtureApi,$fixtureMaterial.key)+$appValues){if($publicText.Contains($secret) -or $vaultText.Contains($secret)){throw 'Fixture plaintext appeared on disk outside encryption'}}
& $scriptPath -VerifyOnly -ReportDirectory (Join-Path $fixtureRoot '.cache/mainnet-secret-input/recheck')
if((Get-FileHash -LiteralPath $vaultPath -Algorithm SHA256).Hash -ne $vaultBefore.Hash){throw 'Verification modified fixture vault'}
$fixtureManifest.roles.authorizedSigner.address='0x3333333333333333333333333333333333333333'
[IO.File]::WriteAllText($fixtureManifestPath,($fixtureManifest|ConvertTo-Json -Depth 5),$utf8)
& $scriptPath -VerifyOnly -ReportDirectory (Join-Path $fixtureRoot '.cache/mainnet-secret-input/changed-context')
$rejected=[IO.File]::ReadAllText((Join-Path $fixtureRoot '.cache/mainnet-secret-input/changed-context/STATUS.json'))|ConvertFrom-Json
if($rejected.result -ne 'FAIL' -or $rejected.code -ne 'LOCAL_VAULT_CONTEXT_MISMATCH'){throw 'Changed fixture signer context was accepted'}
if((Get-FileHash -LiteralPath $vaultPath -Algorithm SHA256).Hash -ne $vaultBefore.Hash){throw 'Rejected verification modified fixture vault'}
[Array]::Clear($plaintext,0,$plaintext.Length)
Remove-Item Function:\Read-Host
Write-Output 'PASS: isolated hidden-input path, DPAPI roundtrip, restricted ACL, random app secrets, redacted status, non-overwrite and changed-context rejection.'
exit 0
