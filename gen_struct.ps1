param(
    [string]$root,
    [string]$outfile
)

Write-Host ""
Write-Host "[PS] Script started"
Write-Host "[PS] Root: $root"
Write-Host "[PS] Output: $outfile"
Write-Host ""

# Safety check
if (-not (Test-Path $root)) {
    Write-Host "[PS][ERROR] Root path does not exist!"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($outfile)) {
    Write-Host "[PS][ERROR] Output path is empty!"
    exit 1
}

$skipList = @('node_modules', '.git', 'dist', 'build')

function Draw-Tree($path, $prefix = '') {

    Write-Host "[PS] Scanning: $path"

    $items = Get-ChildItem -LiteralPath $path -Force | Where-Object {
        -not $_.Attributes.ToString().Contains('Hidden') -and
        ($skipList -notcontains $_.Name)
    } | Sort-Object @{Expression={$_.PSIsContainer}; Descending=$true}, Name

    foreach ($item in $items) {

        $connector = "+-- "

        if ($item.PSIsContainer) {
            $line = "$prefix$connector[$($item.Name)]"
            $line
            Draw-Tree $item.FullName ($prefix + "|   ")
        }
        else {
            "$prefix$connector$($item.Name)"
        }
    }
}

$out = @(
    "PROJECT: $(Split-Path $root -Leaf)"
    "DATE: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    "---"
    "[root]"
)

$out += Draw-Tree $root

Write-Host ""
Write-Host "[PS] Writing file..."

$out | Set-Content -Path $outfile -Encoding UTF8

Write-Host "[PS] File created successfully"
Write-Host ""