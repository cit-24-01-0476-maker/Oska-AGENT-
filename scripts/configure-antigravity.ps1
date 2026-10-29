# Review before running. This changes only safety-related keys in the official CLI settings.
# It disables CLI tools globally while OSKA uses the CLI for text inference.
# A timestamped backup lets you restore your usual interactive CLI settings later.
$ErrorActionPreference = 'Stop'
$settingsDirectory = Join-Path $env:USERPROFILE '.gemini\antigravity-cli'
$settingsPath = Join-Path $settingsDirectory 'settings.json'
New-Item -ItemType Directory -Path $settingsDirectory -Force | Out-Null
$config = @{}
if (Test-Path -LiteralPath $settingsPath) {
  $existing = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
  foreach ($property in $existing.PSObject.Properties) { $config[$property.Name] = $property.Value }
  Copy-Item -LiteralPath $settingsPath -Destination ($settingsPath + '.oska-backup-' + (Get-Date -Format 'yyyyMMddHHmmss'))
}
if ($config.ContainsKey('modelProvider')) { throw 'An alternate inference provider is configured. Review official account authentication documentation and remove modelProvider yourself before using OSKA.' }
$config['useG1Credits'] = $false
$config['toolPermission'] = 'strict'
$config['allowNonWorkspaceAccess'] = $false
$permissions = @{}
if ($config['permissions']) { foreach ($property in $config['permissions'].PSObject.Properties) { $permissions[$property.Name] = $property.Value } }
$permissions['deny'] = @(@($permissions['deny']) + @('command(*)','mcp(*)','read_url(*)','execute_url(*)','read_file(*)','write_file(*)') | Where-Object { $_ } | Select-Object -Unique)
$config['permissions'] = $permissions
$json = $config | ConvertTo-Json -Depth 32
[System.IO.File]::WriteAllText($settingsPath, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host 'CLI credit fallback disabled and CLI tools denied. Other settings preserved. Set Google AI Credit Overages to Never in your account settings too.'
