param(
  [string]$ProxmoxHost = "192.168.1.254",
  [int]$ContainerId = 103,
  [string]$SshUser = "root",
  [string]$SshKeyPath = "$env:USERPROFILE\.ssh\id_ed25519_proxmox_teststand",
  [string]$RemoteAppPath = "/opt/HSNBA",
  [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Title,
    [scriptblock]$Action
  )

  Write-Host "==> $Title"
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed: $Title"
  }
}

if (-not (Test-Path -LiteralPath $SshKeyPath)) {
  throw "SSH key not found: $SshKeyPath"
}

Invoke-Step "Verify git workspace" {
  git rev-parse --is-inside-work-tree
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archiveName = "hsnba-app-$timestamp.tar.gz"
$localArchive = Join-Path $env:TEMP $archiveName
$remoteArchive = "/tmp/$archiveName"

try {
  Invoke-Step "Create release archive from HEAD" {
    git archive --format=tar.gz -o $localArchive HEAD
  }

  Invoke-Step "Upload archive to Proxmox host" {
    scp -i $SshKeyPath $localArchive "${SshUser}@${ProxmoxHost}:$remoteArchive"
  }

  Invoke-Step "Push archive into container" {
    ssh -i $SshKeyPath "${SshUser}@${ProxmoxHost}" "pct push $ContainerId $remoteArchive /tmp/$archiveName"
  }

  Invoke-Step "Extract release in container" {
    ssh -i $SshKeyPath "${SshUser}@${ProxmoxHost}" "pct exec $ContainerId -- sh -lc 'set -e; mkdir -p $RemoteAppPath; tar -xzf /tmp/$archiveName -C $RemoteAppPath'"
  }

  if (-not $SkipNpmInstall) {
    Invoke-Step "Install production dependencies" {
      ssh -i $SshKeyPath "${SshUser}@${ProxmoxHost}" "pct exec $ContainerId -- sh -lc 'set -e; cd $RemoteAppPath; npm install --omit=dev --no-audit --no-fund'"
    }
  }

  Invoke-Step "Restart jukebox service" {
    ssh -i $SshKeyPath "${SshUser}@${ProxmoxHost}" "pct exec $ContainerId -- systemctl restart hsnba-jukebox"
  }

  Invoke-Step "Check jukebox service status" {
    ssh -i $SshKeyPath "${SshUser}@${ProxmoxHost}" "pct exec $ContainerId -- systemctl is-active hsnba-jukebox"
  }

  Write-Host ""
  Write-Host "Deployment complete."
  Write-Host "Host: $ProxmoxHost  Container: $ContainerId  Path: $RemoteAppPath"
}
finally {
  if (Test-Path -LiteralPath $localArchive) {
    Remove-Item -LiteralPath $localArchive -Force -ErrorAction SilentlyContinue
  }
}
