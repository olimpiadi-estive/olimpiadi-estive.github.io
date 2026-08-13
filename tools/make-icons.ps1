# Genera le icone PNG della PWA a partire dallo stesso disegno dell'SVG.
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-icons.ps1
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\icons'
$outDir = [System.IO.Path]::GetFullPath($outDir)
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

function New-Icon {
    param([int]$Size, [string]$Path, [double]$Inset = 1.0, [bool]$Rounded = $true)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # sfondo con gradiente diagonale
    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.ColorTranslator]::FromHtml('#0b3d91'),
        [System.Drawing.ColorTranslator]::FromHtml('#38a0f0'),
        [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal)

    if ($Rounded) {
        # nota: non usare $path come nome (collide con il parametro -Path)
        $rr = New-Object System.Drawing.Drawing2D.GraphicsPath
        $d = [int]($Size * 0.1875) * 2
        $rr.AddArc(0, 0, $d, $d, 180, 90)
        $rr.AddArc($Size - $d, 0, $d, $d, 270, 90)
        $rr.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
        $rr.AddArc(0, $Size - $d, $d, $d, 90, 90)
        $rr.CloseFigure()
        $g.FillPath($brush, $rr)
        $rr.Dispose()
    } else {
        $g.FillRectangle($brush, $rect)
    }

    $s = { param($v) [single]($v / 512.0 * $Size * $Inset) }
    $off = ($Size * (1.0 - $Inset)) / 2.0
    $px  = { param($v) [single](& $s $v) + [single]$off }

    # cerchio grande dorato
    $penW = [single](& $s 20)
    $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#f5a623'), $penW)
    $g.DrawEllipse($pen, (& $px 186), (& $px 80), (& $s 140), (& $s 140))
    $pen.Dispose()

    # cinque cerchi
    $rings = @(
        @{ x = 92;  y = 242; c = '#ffffff' },
        @{ x = 198; y = 242; c = '#f5a623' },
        @{ x = 304; y = 242; c = '#e0322c' },
        @{ x = 145; y = 294; c = '#1a9e5b' },
        @{ x = 251; y = 294; c = '#a9c9ff' }
    )
    $penW2 = [single](& $s 18)
    foreach ($r in $rings) {
        $p = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($r.c), $penW2)
        $g.DrawEllipse($p, (& $px $r.x), (& $px $r.y), (& $s 116), (& $s 116))
        $p.Dispose()
    }

    # sigla
    $fontSize = [single](& $s 58)
    if ($fontSize -ge 4) {
        $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold,
            [System.Drawing.GraphicsUnit]::Pixel)
        $fmt = New-Object System.Drawing.StringFormat
        $fmt.Alignment = [System.Drawing.StringAlignment]::Center
        $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.DrawString('OEE', $font, $white, [single]($Size / 2), (& $px 408), $fmt)
        $font.Dispose(); $white.Dispose(); $fmt.Dispose()
    }

    $g.Dispose(); $brush.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "creato $Path"
}

New-Icon -Size 192 -Path (Join-Path $outDir 'icon-192.png')
New-Icon -Size 512 -Path (Join-Path $outDir 'icon-512.png')
# maskable: contenuto ridotto all'80% dentro la safe zone, sfondo a tutto campo
New-Icon -Size 512 -Path (Join-Path $outDir 'icon-maskable-512.png') -Inset 0.78 -Rounded $false
