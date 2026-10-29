#requires -Version 7.4
[CmdletBinding()]
param(
    [ValidateSet('Init', 'CompleteInit', 'Build', 'Status', 'ExportOwnerBackup', 'RestoreOwnerBackup')]
    [string]$Action = 'Status',
    [string]$DeveloperName = 'John Francis Marabe',
    [string]$BackupPath,
    [Security.SecureString]$BackupPassword,
    [switch]$SkipWeb
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'This helper uses Windows current-user DPAPI. Other systems can supply the documented KOKI_UPLOAD_* environment variables.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$signingRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Koki Emulator\Signing'))
$storePath = Join-Path $signingRoot 'koki-upload.p12'
$secretPath = Join-Path $signingRoot 'upload-secret.dpapi'
$configPath = Join-Path $signingRoot 'upload-key.json'
$certificatePath = Join-Path $signingRoot 'upload-certificate.pem'
$signingNames = @('KOKI_UPLOAD_STORE_FILE', 'KOKI_UPLOAD_STORE_PASSWORD', 'KOKI_UPLOAD_KEY_ALIAS', 'KOKI_UPLOAD_KEY_PASSWORD')

function Find-Keytool {
    $javaCandidates = @($env:JAVA_HOME, 'C:\Program Files\Android\Android Studio\jbr') | Where-Object { $_ }
    foreach ($javaCandidate in $javaCandidates) {
        $candidatePath = Join-Path $javaCandidate 'bin\keytool.exe'
        if (Test-Path -LiteralPath $candidatePath -PathType Leaf) { return $candidatePath }
    }
    $keytoolCommand = Get-Command 'keytool.exe' -ErrorAction SilentlyContinue
    if ($keytoolCommand) { return $keytoolCommand.Source }
    throw 'Install Android Studio/JDK 21 or set JAVA_HOME before initializing signing.'
}
function Initialize-PrivateDirectory {
    $parentPath = Split-Path -Parent $signingRoot
    foreach ($directoryPath in @($parentPath, $signingRoot)) {
        if (Test-Path -LiteralPath $directoryPath) {
            $directoryItem = Get-Item -LiteralPath $directoryPath -Force
            if (-not $directoryItem.PSIsContainer -or ($directoryItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Signing storage must be an ordinary local directory.' }
        } else { New-Item -Path $directoryPath -ItemType Directory | Out-Null }
    }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $systemIdentity = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $allowedSids = @($identity.Value, $systemIdentity.Value)
    $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
    function Test-PrivateAccess([Security.AccessControl.DirectorySecurity]$Acl) {
        if ($Acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $identity.Value -or -not $Acl.AreAccessRulesProtected) { return $false }
        $rules = @($Acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
        foreach ($rule in $rules) {
            if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or $rule.IdentityReference.Value -notin $allowedSids -or $rule.IsInherited) { return $false }
        }
        foreach ($allowedSid in $allowedSids) {
            $fullRules = @($rules | Where-Object { $_.IdentityReference.Value -eq $allowedSid -and $_.FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl -and $_.InheritanceFlags -eq $inheritance -and $_.PropagationFlags -eq [Security.AccessControl.PropagationFlags]::None })
            if ($fullRules.Count -eq 0) { return $false }
        }
        return $true
    }
    $existingAcl = Get-Acl -LiteralPath $signingRoot
    if (Test-PrivateAccess $existingAcl) { return }
    if ($existingAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $identity.Value) { throw 'The signing directory must be owned by the current Windows account.' }
    # Load and persist only the DACL. Do not request owner, group or audit/SACL
    # updates, which can need privileges an ordinary desktop account does not have.
    $accessOnlyAcl = [Security.AccessControl.DirectorySecurity]::new($signingRoot, [Security.AccessControl.AccessControlSections]::Access)
    $accessOnlyAcl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($accessOnlyAcl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier]))) { $accessOnlyAcl.RemoveAccessRuleSpecific($rule) }
    foreach ($allowedIdentity in @($identity, $systemIdentity)) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($allowedIdentity, [Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
        $accessOnlyAcl.AddAccessRule($rule)
    }
    [IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]::new($signingRoot), $accessOnlyAcl)
    if (-not (Test-PrivateAccess (Get-Acl -LiteralPath $signingRoot))) { throw 'Signing-directory access validation failed; no signing operation will proceed.' }
}
function Assert-EmptySigningStorage {
    foreach ($signingFile in @($storePath, $secretPath, $configPath, $certificatePath)) {
        if (Test-Path -LiteralPath $signingFile) { throw 'Signing material already exists. It will not be overwritten. Use -Action Status or recover the existing material.' }
    }
}
function Read-SigningConfig {
    foreach ($signingFile in @($storePath, $secretPath, $configPath, $certificatePath)) {
        if (-not (Test-Path -LiteralPath $signingFile -PathType Leaf)) { throw 'Signing is not initialized. Run -Action Init once, or restore an owner backup.' }
        if ((Get-Item -LiteralPath $signingFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Signing material must be stored in ordinary local files.' }
    }
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ($config.format -ne 'koki-upload-key-v1' -or $config.alias -notmatch '^[a-zA-Z0-9._-]{1,64}$') { throw 'Invalid signing metadata.' }
    return $config
}
function Use-UploadCredentials([scriptblock]$Operation) {
    $config = Read-SigningConfig
    $secureSecret = (Get-Content -LiteralPath $secretPath -Raw).Trim() | ConvertTo-SecureString
    $plainSecret = [Net.NetworkCredential]::new('', $secureSecret).Password
    $previousEnvironment = @{}
    foreach ($signingName in $signingNames) { $previousEnvironment[$signingName] = [Environment]::GetEnvironmentVariable($signingName, 'Process') }
    try {
        [Environment]::SetEnvironmentVariable('KOKI_UPLOAD_STORE_FILE', $storePath, 'Process')
        [Environment]::SetEnvironmentVariable('KOKI_UPLOAD_STORE_PASSWORD', $plainSecret, 'Process')
        [Environment]::SetEnvironmentVariable('KOKI_UPLOAD_KEY_ALIAS', $config.alias, 'Process')
        [Environment]::SetEnvironmentVariable('KOKI_UPLOAD_KEY_PASSWORD', $plainSecret, 'Process')
        & $Operation $config
    } finally {
        foreach ($signingName in $signingNames) { [Environment]::SetEnvironmentVariable($signingName, $previousEnvironment[$signingName], 'Process') }
        $plainSecret = $null
        $secureSecret.Dispose()
    }
}
function Get-OwnerBackupPassword {
    if ($BackupPassword) { return $BackupPassword }
    $selectedPassword = Read-Host 'Choose/enter the owner-backup password (keep it separately from the backup file)' -AsSecureString
    if (-not $selectedPassword -or $selectedPassword.Length -lt 12) { throw 'Use a backup password with at least 12 characters.' }
    return $selectedPassword
}
function Write-PublicCertificate([string]$KeytoolPath, [string]$Alias) {
    & $KeytoolPath -exportcert -rfc -keystore $storePath -storepass:env KOKI_UPLOAD_STORE_PASSWORD -alias $Alias -file $certificatePath
    if ($LASTEXITCODE -ne 0) { throw 'Could not export the public upload certificate.' }
    $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem([IO.File]::ReadAllText($certificatePath))
    try {
        if ($certificate.Subject -match 'CN\s*=\s*Android Debug(?:,|$)') { throw 'Debug signing is not allowed for the Play upload key.' }
        return $certificate.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256).ToLowerInvariant()
    } finally { $certificate.Dispose() }
}

switch ($Action) {
    'Init' {
        Initialize-PrivateDirectory
        Assert-EmptySigningStorage
        if ([string]::IsNullOrWhiteSpace($DeveloperName) -or $DeveloperName.Length -gt 80 -or $DeveloperName -match '[\r\n]') { throw 'Provide a valid public developer name.' }
        $keytoolPath = Find-Keytool
        $alias = 'koki-upload'
        $randomSecret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
        $oldStorePassword = [Environment]::GetEnvironmentVariable('KOKI_UPLOAD_STORE_PASSWORD', 'Process')
        $oldKeyPassword = [Environment]::GetEnvironmentVariable('KOKI_UPLOAD_KEY_PASSWORD', 'Process')
        try {
            [Environment]::SetEnvironmentVariable('KOKI_UPLOAD_STORE_PASSWORD', $randomSecret, 'Process')
            [Environment]::SetEnvironmentVariable('KOKI_UPLOAD_KEY_PASSWORD', $randomSecret, 'Process')
            $escapedName = $DeveloperName.Replace('\', '\\').Replace(',', '\,').Replace('+', '\+').Replace('"', '\"').Replace(';', '\;').Replace('<', '\<').Replace('>', '\>')
            & $keytoolPath -genkeypair -keystore $storePath -storetype PKCS12 -alias $alias -keyalg RSA -keysize 4096 -sigalg SHA256withRSA -validity 10000 -dname ('CN=' + $escapedName) -storepass:env KOKI_UPLOAD_STORE_PASSWORD -keypass:env KOKI_UPLOAD_KEY_PASSWORD -noprompt
            if ($LASTEXITCODE -ne 0) { throw 'Upload key generation failed.' }
            $secureSecret = ConvertTo-SecureString $randomSecret -AsPlainText -Force
            try { $secureSecret | ConvertFrom-SecureString | Set-Content -LiteralPath $secretPath -Encoding utf8 } finally { $secureSecret.Dispose() }
            $fingerprint = Write-PublicCertificate $keytoolPath $alias
            [ordered]@{ format='koki-upload-key-v1'; alias=$alias; developerName=$DeveloperName; createdAt=(Get-Date).ToUniversalTime().ToString('o'); certificateSha256=$fingerprint; passwordProtection='Windows current-user DPAPI'; keyRole='Google Play upload key' } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8
            Write-Output ('Production upload key initialized in ' + $signingRoot)
            Write-Output ('Public certificate SHA-256: ' + $fingerprint)
            Write-Output 'Make an encrypted owner backup before relying on this key. No secret has been printed or added to the project.'
        } finally {
            [Environment]::SetEnvironmentVariable('KOKI_UPLOAD_STORE_PASSWORD', $oldStorePassword, 'Process')
            [Environment]::SetEnvironmentVariable('KOKI_UPLOAD_KEY_PASSWORD', $oldKeyPassword, 'Process')
            $randomSecret = $null
        }
    }
    'CompleteInit' {
        Initialize-PrivateDirectory
        if (Test-Path -LiteralPath $configPath) { throw 'Public signing metadata already exists and will not be overwritten.' }
        foreach ($signingFile in @($storePath, $secretPath)) {
            if (-not (Test-Path -LiteralPath $signingFile -PathType Leaf)) { throw 'CompleteInit requires the existing keystore and DPAPI secret from the interrupted initialization.' }
            if ((Get-Item -LiteralPath $signingFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Existing signing material must be stored in ordinary local files.' }
        }
        if ($DeveloperName -ne 'John Francis Marabe') { throw 'CompleteInit expects the confirmed developer identity John Francis Marabe.' }
        $expectedSubject = 'CN=John Francis Marabe'
        if (Test-Path -LiteralPath $certificatePath -PathType Leaf) {
            $existingCertificate = [Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem([IO.File]::ReadAllText($certificatePath))
            try { if ($existingCertificate.Subject -ne $expectedSubject) { throw 'Existing public certificate does not match the confirmed developer identity.' } } finally { $existingCertificate.Dispose() }
        }
        $secureSecret = (Get-Content -LiteralPath $secretPath -Raw).Trim() | ConvertTo-SecureString
        $plainSecret = [Net.NetworkCredential]::new('', $secureSecret).Password
        $previousPassword = [Environment]::GetEnvironmentVariable('KOKI_UPLOAD_STORE_PASSWORD', 'Process')
        try {
            [Environment]::SetEnvironmentVariable('KOKI_UPLOAD_STORE_PASSWORD', $plainSecret, 'Process')
            $alias = 'koki-upload'
            $fingerprint = Write-PublicCertificate (Find-Keytool) $alias
            $actualCertificate = [Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem([IO.File]::ReadAllText($certificatePath))
            try { if ($actualCertificate.Subject -ne $expectedSubject) { throw 'Keystore certificate does not match the confirmed developer identity.' } } finally { $actualCertificate.Dispose() }
            if (Test-Path -LiteralPath $configPath) { throw 'Public metadata appeared during recovery; it will not be overwritten.' }
            [ordered]@{ format='koki-upload-key-v1'; alias=$alias; developerName=$DeveloperName; createdAt=(Get-Item -LiteralPath $storePath).CreationTimeUtc.ToString('o'); recoveredAt=(Get-Date).ToUniversalTime().ToString('o'); certificateSha256=$fingerprint; passwordProtection='Windows current-user DPAPI'; keyRole='Google Play upload key' } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8
            Write-Output 'Initialization completed using the existing upload key and DPAPI secret. Neither private file was replaced.'
            Write-Output ('Public certificate SHA-256: ' + $fingerprint)
        } finally {
            [Environment]::SetEnvironmentVariable('KOKI_UPLOAD_STORE_PASSWORD', $previousPassword, 'Process')
            $plainSecret = $null
            $secureSecret.Dispose()
        }
    }
    'Build' {
        Use-UploadCredentials {
            $originalLocation = Get-Location
            try {
                Set-Location -LiteralPath $projectRoot
                $npmCommand = (Get-Command 'npm.cmd' -ErrorAction Stop).Source
                $buildArguments = @('run', 'android:build', '--', '--play')
                if ($SkipWeb) { $buildArguments += '--skip-web' }
                & $npmCommand @buildArguments
                if ($LASTEXITCODE -ne 0) { throw 'Signed Play Store build failed. Existing preview downloads were not replaced.' }
            } finally { Set-Location -LiteralPath $originalLocation.Path }
        }
    }
    'Status' {
        $presentFiles = @($storePath, $secretPath, $configPath, $certificatePath) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
        if ($presentFiles.Count -eq 0) { Write-Output ('Not initialized. Signing location: ' + $signingRoot); break }
        $config = Read-SigningConfig
        [pscustomobject]@{ SigningDirectory=$signingRoot; Alias=$config.alias; Developer=$config.developerName; CertificateSha256=$config.certificateSha256; PasswordProtection=$config.passwordProtection; Role=$config.keyRole } | Format-List
    }
    'ExportOwnerBackup' {
        if (-not $BackupPath) { throw 'Provide -BackupPath for a new .kokikey encrypted owner backup.' }
        $backupFile = [IO.Path]::GetFullPath($BackupPath)
        if (Test-Path -LiteralPath $backupFile) { throw 'The backup destination exists and will not be overwritten.' }
        if (-not (Test-Path -LiteralPath (Split-Path -Parent $backupFile) -PathType Container)) { throw 'The backup destination folder must already exist.' }
        $relativeBackup = [IO.Path]::GetRelativePath($projectRoot, $backupFile)
        if (-not $relativeBackup.StartsWith('..' + [IO.Path]::DirectorySeparatorChar) -and $relativeBackup -ne '..' -and -not [IO.Path]::IsPathRooted($relativeBackup)) { throw 'Store the encrypted owner backup outside the project.' }
        $selectedPassword = Get-OwnerBackupPassword
        if ($selectedPassword.Length -lt 12) { throw 'Use a backup password with at least 12 characters.' }
        $backupPasswordText = [Net.NetworkCredential]::new('', $selectedPassword).Password
        $salt = [Security.Cryptography.RandomNumberGenerator]::GetBytes(16)
        $nonce = [Security.Cryptography.RandomNumberGenerator]::GetBytes(12)
        $keyBytes = [Security.Cryptography.Rfc2898DeriveBytes]::Pbkdf2([Text.Encoding]::UTF8.GetBytes($backupPasswordText), $salt, 600000, [Security.Cryptography.HashAlgorithmName]::SHA256, 32)
        try {
            Use-UploadCredentials {
                param($config)
                $payload = [ordered]@{ format='koki-upload-key-payload-v1'; keystore=[Convert]::ToBase64String([IO.File]::ReadAllBytes($storePath)); password=$env:KOKI_UPLOAD_STORE_PASSWORD; config=$config } | ConvertTo-Json -Depth 5 -Compress
                $payloadBytes = [Text.Encoding]::UTF8.GetBytes($payload)
                $ciphertext = [byte[]]::new($payloadBytes.Length)
                $tag = [byte[]]::new(16)
                $cipher = [Security.Cryptography.AesGcm]::new($keyBytes, 16)
                try {
                    $cipher.Encrypt($nonce, $payloadBytes, $ciphertext, $tag)
                    [ordered]@{ format='koki-encrypted-owner-backup-v1'; encryption='AES-256-GCM'; kdf='PBKDF2-SHA256'; iterations=600000; salt=[Convert]::ToBase64String($salt); nonce=[Convert]::ToBase64String($nonce); tag=[Convert]::ToBase64String($tag); ciphertext=[Convert]::ToBase64String($ciphertext) } | ConvertTo-Json | Set-Content -LiteralPath $backupFile -Encoding utf8
                } finally {
                    $cipher.Dispose()
                    [Array]::Clear($payloadBytes, 0, $payloadBytes.Length)
                    $payload = $null
                }
            }
            Write-Output ('Encrypted owner backup saved: ' + $backupFile)
            Write-Output 'Keep its password separately. This backup contains the production upload key and can be restored on a different Windows account.'
        } finally {
            [Array]::Clear($keyBytes, 0, $keyBytes.Length)
            $backupPasswordText = $null
        }
    }
    'RestoreOwnerBackup' {
        if (-not $BackupPath -or -not (Test-Path -LiteralPath $BackupPath -PathType Leaf)) { throw 'Provide an existing encrypted owner backup with -BackupPath.' }
        Initialize-PrivateDirectory
        Assert-EmptySigningStorage
        $envelope = Get-Content -LiteralPath $BackupPath -Raw | ConvertFrom-Json
        if ($envelope.format -ne 'koki-encrypted-owner-backup-v1' -or $envelope.encryption -ne 'AES-256-GCM' -or $envelope.kdf -ne 'PBKDF2-SHA256' -or $envelope.iterations -ne 600000) { throw 'Unsupported owner-backup format.' }
        $selectedPassword = Get-OwnerBackupPassword
        $backupPasswordText = [Net.NetworkCredential]::new('', $selectedPassword).Password
        $salt = [Convert]::FromBase64String($envelope.salt)
        $nonce = [Convert]::FromBase64String($envelope.nonce)
        $tag = [Convert]::FromBase64String($envelope.tag)
        $ciphertext = [Convert]::FromBase64String($envelope.ciphertext)
        if ($salt.Length -ne 16 -or $nonce.Length -ne 12 -or $tag.Length -ne 16 -or $ciphertext.Length -gt 1048576) { throw 'Invalid owner-backup envelope.' }
        $keyBytes = [Security.Cryptography.Rfc2898DeriveBytes]::Pbkdf2([Text.Encoding]::UTF8.GetBytes($backupPasswordText), $salt, 600000, [Security.Cryptography.HashAlgorithmName]::SHA256, 32)
        $payloadBytes = [byte[]]::new($ciphertext.Length)
        $cipher = [Security.Cryptography.AesGcm]::new($keyBytes, 16)
        try {
            $cipher.Decrypt($nonce, $ciphertext, $tag, $payloadBytes)
            $payload = [Text.Encoding]::UTF8.GetString($payloadBytes) | ConvertFrom-Json
            if ($payload.format -ne 'koki-upload-key-payload-v1' -or $payload.config.format -ne 'koki-upload-key-v1' -or $payload.config.alias -notmatch '^[a-zA-Z0-9._-]{1,64}$' -or [string]::IsNullOrWhiteSpace($payload.password)) { throw 'Invalid decrypted signing payload.' }
            $keystoreBytes = [Convert]::FromBase64String($payload.keystore)
            [IO.File]::WriteAllBytes($storePath, $keystoreBytes)
            $secureSecret = ConvertTo-SecureString $payload.password -AsPlainText -Force
            try { $secureSecret | ConvertFrom-SecureString | Set-Content -LiteralPath $secretPath -Encoding utf8 } finally { $secureSecret.Dispose() }
            $previousPassword = [Environment]::GetEnvironmentVariable('KOKI_UPLOAD_STORE_PASSWORD', 'Process')
            try {
                [Environment]::SetEnvironmentVariable('KOKI_UPLOAD_STORE_PASSWORD', $payload.password, 'Process')
                $fingerprint = Write-PublicCertificate (Find-Keytool) $payload.config.alias
                if ($fingerprint -ne $payload.config.certificateSha256) { throw 'Restored certificate fingerprint does not match the backup.' }
                $payload.config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configPath -Encoding utf8
            } finally { [Environment]::SetEnvironmentVariable('KOKI_UPLOAD_STORE_PASSWORD', $previousPassword, 'Process') }
            Write-Output 'Production upload key restored with new Windows current-user DPAPI protection.'
        } finally {
            $cipher.Dispose()
            [Array]::Clear($keyBytes, 0, $keyBytes.Length)
            [Array]::Clear($payloadBytes, 0, $payloadBytes.Length)
            if ($keystoreBytes) { [Array]::Clear($keystoreBytes, 0, $keystoreBytes.Length) }
            $payload = $null
            $backupPasswordText = $null
        }
    }
}
