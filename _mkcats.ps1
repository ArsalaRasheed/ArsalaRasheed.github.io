# ============================================================ DEV ONLY
# _mkcats.ps1 — build the category card images from the client's own Shopify
# artwork (alkhanpaints.com), so the cards show real product photography instead
# of placeholder line icons.
#
#   powershell -ExecutionPolicy Bypass -File _mkcats.ps1
#
# Source originals live in %TEMP%\opencode\alpaints\cats (see _getcats.js).
# Output: assets/img/cat/*.jpg at 560x315 (16:9), JPEG q82.
#
# Three collection images carry a baked-in gold title ("Deco Paints", etc).
# Those are cropped from BELOW the title band first — otherwise the words would
# be repeated a centimetre away from the card's own <h3>, and the crop values
# below are measured against the originals, not guessed.
#
# Not part of the deployable site (see README, "Development files").
# ==============================================================
param([int]$Quality = 82, [int]$OutW = 560, [int]$OutH = 315)

Add-Type -AssemblyName System.Drawing

$CatDir  = Join-Path $env:TEMP "opencode\alpaints\cats"
$OrigDir = Join-Path $PSScriptRoot "_original"
$OutDir  = Join-Path $PSScriptRoot "assets\img\cat"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# name, source file, crop window (top/bottom are measured against the original;
# -1 means "use the full edge"). The 16:9 rectangle is then centred inside it.
# `box` overrides the automatic centring entirely — used for the one source whose
# subject sits off-centre on a white ground.
$Jobs = @(
    @{ out = 'decorative-paints'; src = 'decorative.png';       top = 272; bot = 705; box = $null }
    @{ out = 'deco-paints';       src = 'deco.png';             top = 178; bot = 655; box = $null }
    @{ out = 'enamel-paints';     src = 'enamel.png';           top = 232; bot = -1;  box = $null }
    @{ out = '2k-paints';         src = '2k.png';               top = 0;   bot = -1;  box = $null }
    @{ out = 'hardeners';         src = 'hardeners.png';        top = 0;   bot = -1;  box = $null }
    @{ out = 'clear-coats';       src = 'clearcoats.png';       top = 0;   bot = -1;  box = $null }
    @{ out = 'primers';           src = 'primers.png';          top = 0;   bot = -1;  box = $null }
    # Client's own artwork, supplied directly rather than pulled from Shopify.
    # Three cans occupy 770x560 of a 1024 square, so a plain centre crop would
    # slice the can bottoms off; y=281 is the only window that clears both the
    # cap and the base (subject spans 288..845, crop must fit inside 576 tall).
    @{ out = 'thinners';          src = 'thinner-ki-image.png'; dir = $OrigDir; top = 0; bot = -1; box = @(0, 281, 1024, 576) }
    @{ out = 'spray-guns';        src = 'sprayguns.png';        top = 0;   bot = -1;  box = $null }
    @{ out = 'paint-pens';        src = 'paintpens.png';        top = 0;   bot = -1;  box = $null }
    @{ out = 'related-supplies';  src = 'accessories.png';      top = 0;   bot = -1;  box = $null }
)

$jpeg   = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
            Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep     = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
                  [System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)

$total = 0

foreach ($j in $Jobs) {
    if ($j.dir) { $srcPath = Join-Path $j.dir $j.src } else { $srcPath = Join-Path $CatDir $j.src }
    if (-not (Test-Path $srcPath)) { Write-Host ("  MISSING  " + $j.src); continue }

    $src = New-Object System.Drawing.Bitmap($srcPath)
    try {
        $w = $src.Width; $h = $src.Height
        $top = [Math]::Min([Math]::Max(0, $j.top), $h - 1)
        $bot = if ($j.bot -lt 0 -or $j.bot -gt $h) { $h } else { $j.bot }
        if ($bot -le $top) { $bot = $h }
        $h2  = $bot - $top

        if ($j.box) {
            $cx = [int]$j.box[0]; $cy = [int]$j.box[1]
            $cw = [int]$j.box[2]; $ch = [int]$j.box[3]
        } else {
            # widest centred 16:9 rectangle that still fits under the title band
            $cw = [int][Math]::Floor($h2 * $OutW / $OutH)
            if ($cw -gt $w) { $cw = $w }
            $ch = [int][Math]::Floor($cw * $OutH / $OutW)
            $cx = [int](($w - $cw) / 2)
            $cy = $top + [int](($h2 - $ch) / 2)
        }

        $rect   = New-Object System.Drawing.Rectangle($cx, $cy, $cw, $ch)
        $cropped = $src.Clone($rect, $src.PixelFormat)

        try {
            # composite onto white first: PNGs with an alpha channel go black
            # when written straight to JPEG
            $out = New-Object System.Drawing.Bitmap($OutW, $OutH)
            try {
                $g = [System.Drawing.Graphics]::FromImage($out)
                try {
                    $g.Clear([System.Drawing.Color]::White)
                    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                    $g.DrawImage($cropped, 0, 0, $OutW, $OutH)
                } finally { $g.Dispose() }

                $final = Join-Path $OutDir ($j.out + '.jpg')
                $tmp   = $final + '.tmp'
                # GDI+ refuses to save over an open handle, hence the temp name
                $out.Save($tmp, $jpeg, $ep)
                if (Test-Path $final) { Remove-Item $final -Force }
                Move-Item $tmp $final
            } finally { $out.Dispose() }
        } finally { $cropped.Dispose() }

        $kb = [math]::Round((Get-Item (Join-Path $OutDir ($j.out + '.jpg'))).Length / 1KB)
        $total += $kb
        Write-Host ("  {0,-18} {1,4} KB   crop {2}x{3}+{4}+{5}" -f $j.out, $kb, $cw, $ch, $cx, $cy)
    } finally { $src.Dispose() }
}

Write-Host ("  ----------------------------------------------")
Write-Host ("  {0} images, {1} KB total" -f $Jobs.Count, $total)
