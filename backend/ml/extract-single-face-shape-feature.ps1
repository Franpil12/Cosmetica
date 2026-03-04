param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,
  [int]$ImageSize = 32
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Convert-ImageToFeatureVector {
  param(
    [string]$ImagePath,
    [int]$Size
  )

  $original = [System.Drawing.Image]::FromFile($ImagePath)
  try {
    $side = [Math]::Min($original.Width, $original.Height)
    $cropX = [int][Math]::Floor(($original.Width - $side) / 2)
    $cropY = [int][Math]::Floor(($original.Height - $side) / 2)

    $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.DrawImage(
          $original,
          (New-Object System.Drawing.Rectangle 0, 0, $Size, $Size),
          (New-Object System.Drawing.Rectangle $cropX, $cropY, $side, $side),
          [System.Drawing.GraphicsUnit]::Pixel
        )
      } finally {
        $graphics.Dispose()
      }

      $grayscale = New-Object 'double[]' ($Size * $Size)
      $rowMeans = New-Object 'double[]' $Size
      $columnMeans = New-Object 'double[]' $Size
      $index = 0

      for ($y = 0; $y -lt $Size; $y++) {
        $rowSum = 0.0
        for ($x = 0; $x -lt $Size; $x++) {
          $pixel = $bitmap.GetPixel($x, $y)
          $gray = (($pixel.R * 0.299) + ($pixel.G * 0.587) + ($pixel.B * 0.114)) / 255.0
          $grayscale[$index] = [Math]::Round($gray, 6)
          $rowSum += $gray
          $columnMeans[$x] += $gray
          $index++
        }
        $rowMeans[$y] = [Math]::Round($rowSum / $Size, 6)
      }

      for ($x = 0; $x -lt $Size; $x++) {
        $columnMeans[$x] = [Math]::Round($columnMeans[$x] / $Size, 6)
      }

      $features = New-Object System.Collections.Generic.List[double]
      foreach ($value in $grayscale) { [void]$features.Add([double]$value) }
      foreach ($value in $rowMeans) { [void]$features.Add([double]$value) }
      foreach ($value in $columnMeans) { [void]$features.Add([double]$value) }

      $count = $features.Count
      $mean = 0.0
      foreach ($value in $features) { $mean += $value }
      $mean /= $count

      $variance = 0.0
      foreach ($value in $features) {
        $delta = $value - $mean
        $variance += ($delta * $delta)
      }
      $stdDev = [Math]::Sqrt($variance / $count)
      if ($stdDev -lt 1e-9) { $stdDev = 1.0 }

      $normalized = New-Object 'double[]' $count
      for ($i = 0; $i -lt $count; $i++) {
        $normalized[$i] = [Math]::Round((($features[$i] - $mean) / $stdDev), 6)
      }

      return $normalized
    } finally {
      $bitmap.Dispose()
    }
  } finally {
    $original.Dispose()
  }
}

$vector = Convert-ImageToFeatureVector -ImagePath $InputPath -Size $ImageSize
[pscustomobject]@{
  image_size = $ImageSize
  feature_length = $vector.Length
  vector = $vector
} | ConvertTo-Json -Depth 5 -Compress
