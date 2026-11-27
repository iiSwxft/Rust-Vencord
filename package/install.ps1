# Vencord portable installer -- detects Discord branches, swaps resources\app.asar
# for the bundled shim.asar, and points it at this package's dist\patcher.js
# via resources\vencord-path.txt. Original asar is preserved as _app.asar.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root "dist"
$shimAsar = Join-Path $root "shim.asar"

foreach ($f in @("patcher.js", "preload.js", "renderer.js", "renderer.css")) {
    if (!(Test-Path (Join-Path $dist $f))) { Write-Host "missing dist\$f"; exit 1 }
}
if (!(Test-Path $shimAsar)) { Write-Host "missing shim.asar"; exit 1 }

$branches = @("Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment")
$installs = @()

foreach ($b in $branches) {
    $base = Join-Path $env:LOCALAPPDATA $b
    if (!(Test-Path $base)) { continue }
    $apps = Get-ChildItem $base -Directory -Filter "app-*" | Where-Object {
        (Test-Path (Join-Path $_.FullName "resources\app.asar")) -or
        (Test-Path (Join-Path $_.FullName "resources\_app.asar"))
    } | Sort-Object { ($_.Name -replace "app-", "") -as [version] } -Descending
    if (!$apps) { continue }
    $latest = @($apps)[0]
    $res = Join-Path $latest.FullName "resources"
    $installs += [pscustomobject]@{
        Branch = $b
        Version = ($latest.Name -replace "app-", "")
        Resources = $res
        Patched = (Test-Path (Join-Path $res "_app.asar"))
    }
}

if (!$installs.Count) { Write-Host "no Discord installs found under %LOCALAPPDATA%"; exit 1 }

Write-Host "`ndetected installs:"
for ($i = 0; $i -lt $installs.Count; $i++) {
    $mark = if ($installs[$i].Patched) { "  [already patched]" } else { "" }
    Write-Host ("  [{0}] {1} {2}{3}" -f ($i + 1), $installs[$i].Branch, $installs[$i].Version, $mark)
}

$t = Read-Host "install into #? (q quits)"
if ($t -eq "q") { exit 0 }
$ti = [int]$t
if ($ti -lt 1 -or $ti -gt $installs.Count) { Write-Host "bad pick"; exit 1 }
$target = $installs[$ti - 1]

$actionPrompt = "do what? [1] install"
if ($target.Patched) { $actionPrompt = "do what? [1] reinstall (remove old, install new)  [2] uninstall" }
$a = Read-Host $actionPrompt

# our shim asar is ~1KB, discord's real one is ~3MB+ — size tells them apart
$SHIM_MAX = 131072

function Uninstall-Patch($res) {
    $asar = Join-Path $res "app.asar"
    $orig = Join-Path $res "_app.asar"
    if ((Test-Path $asar) -and (Get-Item $asar).Length -lt $SHIM_MAX) {
        Remove-Item $asar -Force          # it's our shim, safe to delete
    }
    if (Test-Path $orig) {
        if (Test-Path $asar) {
            Remove-Item $orig -Force      # real asar already back in place, drop the stale copy
        } else {
            Rename-Item $orig "app.asar"  # restore the original
        }
    }
    Remove-Item (Join-Path $res "vencord-path.txt") -Force -EA SilentlyContinue
    Remove-Item (Join-Path $res "app") -Recurse -Force -EA SilentlyContinue
}

function Install-Patch($res) {
    $asar = Join-Path $res "app.asar"
    $orig = Join-Path $res "_app.asar"
    Remove-Item (Join-Path $res "app") -Recurse -Force -EA SilentlyContinue  # dead legacy shim
    if (!(Test-Path $orig)) {
        if ((Test-Path $asar) -and (Get-Item $asar).Length -lt $SHIM_MAX) {
            throw "app.asar is a shim but _app.asar is missing -- reinstall Discord or restore the original asar"
        }
        Rename-Item $asar "_app.asar"
    }
    Copy-Item $shimAsar $asar -Force
    $patcherPath = ($dist -replace "\\", "/") + "/patcher.js"
    Set-Content (Join-Path $res "vencord-path.txt") $patcherPath -NoNewline -Encoding ascii
    return $patcherPath
}

try {
    $res = $target.Resources

    if ($a -eq "2" -and $target.Patched) {
        Uninstall-Patch $res
        Write-Host "unpatched $($target.Branch) -- original app.asar restored. restart Discord."
        exit 0
    }
    if ($a -ne "1" -and $a -ne "") { exit 0 }

    if ($target.Patched) {
        Uninstall-Patch $res
        Write-Host "removed old install"
    }
    $patcherPath = Install-Patch $res

    Write-Host "`npatched $($target.Branch) $($target.Version)"
    Write-Host "  $($res)\app.asar -> Vencord shim"
    Write-Host "  $($res)\_app.asar -> original Discord"
    Write-Host "  $($res)\vencord-path.txt -> $patcherPath"
    Write-Host "restart Discord (full quit + relaunch) to load Vencord."
    Write-Host "note: if you move/rename this package folder, rerun this installer."
    Write-Host "note: when Discord self-updates, rerun this installer on the new version."
} catch {
    Write-Host "failed: $($_.Exception.Message)"
    Write-Host "Discord is probably running -- fully quit it first (tray icon -> quit)."
    exit 1
}
