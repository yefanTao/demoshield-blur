$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$extDir = Join-Path $root 'extension'
$distDir = Join-Path $root 'dist'
$manifestPath = Join-Path $extDir 'manifest.json'

Write-Host "=== 1. Node Unit & Zero-Host-Permission Manifest Audit ===" -ForegroundColor Cyan
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
if (-not $nodeExe) {
    $portable = 'C:\Users\yefan\.gemini\antigravity\scratch\.tools\node-v22.23.5-win-x64\node.exe'
    if (Test-Path $portable) { $nodeExe = $portable }
}
if (-not $nodeExe) { throw "Node.js not found." }

& $nodeExe --test (Join-Path $root 'tests\manifest.test.mjs') (Join-Path $root 'tests\rules.test.mjs')
if ($LASTEXITCODE -ne 0) { throw "Node unit/manifest tests failed!" }
Write-Host "[PASS] Node manifest security audit & rules unit tests passed." -ForegroundColor Green

Write-Host "`n=== 2. Icon PNG Dimensions Verification ===" -ForegroundColor Cyan
foreach ($s in @(16, 32, 48, 128)) {
    $imgPath = Join-Path $extDir "icons\icon$s.png"
    $img = [System.Drawing.Image]::FromFile($imgPath)
    if ($img.Width -ne $s -or $img.Height -ne $s) {
        $img.Dispose()
        throw "Icon icon$s.png has wrong dimensions: $($img.Width)x$($img.Height)"
    }
    $img.Dispose()
}
Write-Host "[PASS] All icons verified at exact 16/32/48/128 px." -ForegroundColor Green

Write-Host "`n=== 3. Real-Chrome Headless Shadow-DOM & Auto-Mask E2E Tests ===" -ForegroundColor Cyan
$chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chromePath)) {
    $chromePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
}
if (-not (Test-Path $chromePath)) { throw "Chrome/Edge binary not found for E2E verification." }

$port = Get-Random -Minimum 41000 -Maximum 48500
$prefix = "http://127.0.0.1:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()

$reportFile = Join-Path $env:TEMP ("demoshield-e2e-" + [Guid]::NewGuid().ToString('N').Substring(0,8) + ".json")
$userDataDir = Join-Path $env:TEMP ("demoshield-profile-" + [Guid]::NewGuid().ToString('N').Substring(0,8))

$serverJob = [PowerShell]::Create()
$serverJob.AddScript({
    param($listener, $root, $reportFile)
    $mimeMap = @{
        '.html' = 'text/html; charset=utf-8'
        '.js'   = 'application/javascript; charset=utf-8'
        '.css'  = 'text/css; charset=utf-8'
        '.png'  = 'image/png'
        '.json' = 'application/json; charset=utf-8'
    }
    while ($listener.IsListening) {
        try {
            $ctx = $listener.GetContext()
            $path = $ctx.Request.Url.AbsolutePath
            if ($path -eq '/__report' -and $ctx.Request.HttpMethod -eq 'POST') {
                $sr = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $sr.ReadToEnd()
                $sr.Close()
                [System.IO.File]::WriteAllText($reportFile, $body, (New-Object System.Text.UTF8Encoding($false)))
                $ok = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                $ctx.Response.ContentType = 'application/json'
                $ctx.Response.ContentLength64 = $ok.Length
                $ctx.Response.OutputStream.Write($ok, 0, $ok.Length)
                $ctx.Response.OutputStream.Close()
                continue
            }
            $rel = [Uri]::UnescapeDataString($path).TrimStart('/').Replace('/', '\')
            $filePath = Join-Path $root $rel
            if (Test-Path $filePath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $ctx.Response.ContentType = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { 'application/octet-stream' }
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $ctx.Response.ContentLength64 = $bytes.Length
                $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $ctx.Response.StatusCode = 404
            }
            $ctx.Response.OutputStream.Close()
        } catch {
            break
        }
    }
}).AddArgument($listener).AddArgument($root).AddArgument($reportFile) | Out-Null
$asyncHandle = $serverJob.BeginInvoke()

$chromeProc = $null
try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $chromePath
    $psi.Arguments = "--headless=new --disable-gpu --no-first-run --disable-extensions --user-data-dir=`"$userDataDir`" `"${prefix}tests/e2e-chrome.html`""
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $chromeProc = [System.Diagnostics.Process]::Start($psi)

    $deadline = (Get-Date).AddSeconds(20)
    while (-not (Test-Path $reportFile) -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 150
    }
    if (-not (Test-Path $reportFile)) {
        throw "Timed out waiting for Chrome E2E report."
    }

    $report = Get-Content -Raw -Encoding UTF8 $reportFile | ConvertFrom-Json
    if ($report.PSObject.Properties['fatal']) {
        throw "Fatal E2E JS error: $($report.fatal)"
    }
    foreach ($r in $report.results) {
        if ($r.status -eq 'PASS') {
            Write-Host "  [PASS] $($r.name) -- $($r.detail)" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] $($r.name) -- $($r.error)" -ForegroundColor Red
        }
    }
    if ($report.summary.failed -gt 0) {
        throw "$($report.summary.failed) Chrome E2E test(s) failed!"
    }
    Write-Host "[PASS] All $($report.summary.passed)/$($report.summary.total) real-Chrome E2E tests passed!" -ForegroundColor Green
} finally {
    if ($chromeProc -and -not $chromeProc.HasExited) { try { $chromeProc.Kill() } catch {} }
    $listener.Stop()
    $listener.Close()
    $serverJob.Dispose()
    if (Test-Path $reportFile) { Remove-Item -Force $reportFile -ErrorAction SilentlyContinue }
    if (Test-Path $userDataDir) { Remove-Item -Recurse -Force $userDataDir -ErrorAction SilentlyContinue }
}

Write-Host "`n=== 4. Packaging Chrome Web Store Upload Archive ===" -ForegroundColor Cyan
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$zipPath = Join-Path $distDir "demoshield-blur-v$($manifest.version).zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

$archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $files = Get-ChildItem -Path $extDir -Recurse -File | Sort-Object FullName
    foreach ($file in $files) {
        $rel = $file.FullName.Substring($extDir.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $file.FullName,
            $rel,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
} finally {
    $archive.Dispose()
}

$verifyZip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$entries = @($verifyZip.Entries | ForEach-Object { $_.FullName })
$verifyZip.Dispose()
if ($entries -notcontains 'manifest.json') { throw "manifest.json not at root of ZIP!" }

Write-Host "[PASS] Packaged $zipPath ($((Get-Item $zipPath).Length) bytes, $($entries.Count) files):" -ForegroundColor Green
$entries | ForEach-Object { Write-Host "       - $_" }
