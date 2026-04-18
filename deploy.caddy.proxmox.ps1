param(
  [string]$ProxmoxHost = "192.168.1.254",
  [int]$CaddyContainerId,
  [int]$AppContainerId = 103,
  [string]$SshUser = "root",
  [string]$SshKeyPath = "$env:USERPROFILE\.ssh\id_ed25519_proxmox_teststand",
  [switch]$DisableCaddyOnAppContainer
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

if (-not $PSBoundParameters.ContainsKey("CaddyContainerId")) {
  throw "CaddyContainerId is required. Example: .\deploy.caddy.proxmox.ps1 -CaddyContainerId 102"
}

if (-not (Test-Path -LiteralPath $SshKeyPath)) {
  throw "SSH key not found: $SshKeyPath"
}

if (-not (Test-Path -LiteralPath "jukebox.Caddyfile")) {
  throw "Missing local file: jukebox.Caddyfile"
}

if (-not (Test-Path -LiteralPath "deploy.caddy.sh")) {
  throw "Missing local file: deploy.caddy.sh"
}

$remoteCaddyfile = "/tmp/jukebox.Caddyfile"
$remoteDeployScript = "/tmp/deploy.caddy.sh"

Invoke-Step "Upload Caddy artifacts to Proxmox host" {
  scp -i $SshKeyPath "jukebox.Caddyfile" "deploy.caddy.sh" "${SshUser}@${ProxmoxHost}:/tmp/"
}

Invoke-Step "Push Caddyfile into standalone Caddy container (CT $CaddyContainerId)" {
  ssh -i $SshKeyPath "${SshUser}@${ProxmoxHost}" "pct push $CaddyContainerId $remoteCaddyfile /root/jukebox.Caddyfile"
}

Invoke-Step "Push deploy script into standalone Caddy container (CT $CaddyContainerId)" {
  ssh -i $SshKeyPath "${SshUser}@${ProxmoxHost}" "pct push $CaddyContainerId $remoteDeployScript /root/deploy.caddy.sh"
}

Invoke-Step "Install or update Caddy in standalone container" {
  ssh -i $SshKeyPath "${SshUser}@${ProxmoxHost}" "pct exec $CaddyContainerId -- sh -lc 'chmod +x /root/deploy.caddy.sh; /root/deploy.caddy.sh'"
}

if ($DisableCaddyOnAppContainer) {
  Invoke-Step "Disable Caddy on app container (CT $AppContainerId)" {
    ssh -i $SshKeyPath "${SshUser}@${ProxmoxHost}" "pct exec $AppContainerId -- sh -lc 'systemctl disable --now caddy || true'"
  }
}

Invoke-Step "Verify standalone Caddy service state" {
  ssh -i $SshKeyPath "${SshUser}@${ProxmoxHost}" "pct exec $CaddyContainerId -- systemctl is-active caddy"
}

Write-Host ""
Write-Host "Caddy standalone deployment complete."
Write-Host "Proxmox host: $ProxmoxHost"
Write-Host "Caddy container: $CaddyContainerId"
if ($DisableCaddyOnAppContainer) {
  Write-Host "Caddy disabled on app container: $AppContainerId"
}
