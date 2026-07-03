Add-Type -AssemblyName System.Drawing

$buildDir = Join-Path (Get-Location) "build"
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$sizes = @(256, 128, 64, 48, 32, 16)
$pngs = @()

foreach ($size in $sizes) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $rect = [System.Drawing.RectangleF]::new(0, 0, $size, $size)
  $bgRect = [System.Drawing.Rectangle]::new(0, 0, $size, $size)
  $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $bgRect,
    [System.Drawing.Color]::FromArgb(20, 94, 82),
    [System.Drawing.Color]::FromArgb(13, 148, 136),
    45
  )
  $graphics.FillRectangle($background, $bgRect)

  $margin = [int]($size * 0.16)
  $inner = [System.Drawing.Rectangle]::new($margin, $margin, $size - (2 * $margin), $size - (2 * $margin))
  $penWidth = [Math]::Max(2, [int]($size * 0.055))
  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(245, 255, 252), $penWidth)
  $graphics.DrawEllipse($pen, $inner)

  $fontSize = [single]($size * 0.42)
  $font = [System.Drawing.Font]::new("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $stringFormat = [System.Drawing.StringFormat]::new()
  $stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
  $stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString("NH", $font, $textBrush, $rect, $stringFormat)

  $pngPath = Join-Path $buildDir "icon-$size.png"
  $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngs += $pngPath

  $stringFormat.Dispose()
  $textBrush.Dispose()
  $font.Dispose()
  $pen.Dispose()
  $background.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$icoPath = Join-Path $buildDir "icon.ico"
$stream = [System.IO.File]::Create($icoPath)
$writer = [System.IO.BinaryWriter]::new($stream)

$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$pngs.Count)

$images = @()
foreach ($png in $pngs) {
  $images += ,[System.IO.File]::ReadAllBytes($png)
}

$offset = 6 + (16 * $images.Count)
for ($index = 0; $index -lt $images.Count; $index++) {
  $size = $sizes[$index]
  $bytes = $images[$index]
  $dimension = if ($size -eq 256) { 0 } else { $size }

  $writer.Write([Byte]$dimension)
  $writer.Write([Byte]$dimension)
  $writer.Write([Byte]0)
  $writer.Write([Byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$bytes.Length)
  $writer.Write([UInt32]$offset)

  $offset += $bytes.Length
}

foreach ($bytes in $images) {
  $writer.Write($bytes)
}

$writer.Close()
$stream.Close()

$desktopIconPath = Join-Path (Get-Location) "desktop\icon.ico"
Copy-Item -LiteralPath $icoPath -Destination $desktopIconPath -Force
