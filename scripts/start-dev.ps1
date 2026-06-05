$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$node = "C:\Program Files\nodejs\node.exe"
$vite = Join-Path $root "node_modules\vite\bin\vite.js"

if (-not (Test-Path $node)) {
  $node = "node.exe"
}

if (-not (Test-Path $vite)) {
  throw "Vite is not installed. Run npm install first."
}

Set-Location $root
Write-Host "OrbixJS dev server at http://127.0.0.1:5173/"
& $node $vite --host 127.0.0.1 --port 5173
