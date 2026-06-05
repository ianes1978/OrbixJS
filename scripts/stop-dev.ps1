$connections = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue

if (-not $connections) {
  Write-Host "No OrbixJS dev server found on port 5173."
  exit 0
}

$processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $processIds) {
  Stop-Process -Id $processId -Force
  Write-Host "Stopped process $processId on port 5173."
}
