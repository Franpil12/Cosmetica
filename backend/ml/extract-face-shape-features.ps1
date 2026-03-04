param(
  [string]$DatasetPath = "D:\Visual\Cosmetica\backend\ml\face-shape-dataset.json",
  [string]$OutputPath = "D:\Visual\Cosmetica\backend\ml\face-shape-features.json",
  [int]$ImageSize = 32
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function New-CenteredSquareBitmap {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [int]$Size
  )

  $cropSize = [Math]::Min($Bitmap.Width, $Bitmap.Height)
  $offsetX = [int](($Bitmap.Width - $cropSize) / 2)
  $offsetY = [int](($Bitmap.Height - $cropSize) / 2)
  $rect = New-Object System.Drawing.Rectangle($offsetX, $offsetY, $cropSize, $cropSize)
  $cropped = $Bitmap.Clone($rect, $Bitmap.PixelFormat)

  try {
    $resized = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($resized)
    try {
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.DrawImage($cropped, 0, 0, $Size, $Size)
    }
    finally {
      $graphics.Dispose()
      $cropped.Dispose()
    }

    return $resized
  }
  catch {
    $cropped.Dispose()
    throw
  }
}

function Normalize-Vector {
  param([double[]]$Values)

  $mean = ($Values | Measure-Object -Average).Average
  $variance = 0.0
  foreach ($value in $Values) {
    $variance += [Math]::Pow($value - $mean, 2)
  }
  $variance = $variance / [Math]::Max($Values.Length, 1)
  $stdDev = [Math]::Sqrt($variance)
  if ($stdDev -lt 0.0001) { $stdDev = 1.0 }

  $normalized = New-Object System.Collections.Generic.List[double]
  foreach ($value in $Values) {
    $normalized.Add([Math]::Round((($value - $mean) / $stdDev), 6))
  }
  return ,$normalized.ToArray()
}

function Get-FeatureVector {
  param(
    [string]$ImagePath,
    [int]$Size
  )

  $bitmap = [System.Drawing.Bitmap]::FromFile($ImagePath)
  try {
    $resized = New-CenteredSquareBitmap -Bitmap $bitmap -Size $Size
    try {
      $grayValues = New-Object System.Collections.Generic.List[double]
      $rowMeans = New-Object System.Collections.Generic.List[double]
      $columnMeans = New-Object System.Collections.Generic.List[double]

      for ($x = 0; $x -lt $Size; $x++) {
        $columnMeans.Add(0.0)
      }

      for ($y = 0; $y -lt $Size; $y++) {
        $rowSum = 0.0
        for ($x = 0; $x -lt $Size; $x++) {
          $pixel = $resized.GetPixel($x, $y)
          $gray = ($pixel.R * 0.299) + ($pixel.G * 0.587) + ($pixel.B * 0.114)
          $grayValues.Add($gray)
          $rowSum += $gray
          $columnMeans[$x] = $columnMeans[$x] + $gray
        }
        $rowMeans.Add($rowSum / $Size)
      }

      for ($x = 0; $x -lt $Size; $x++) {
        $columnMeans[$x] = $columnMeans[$x] / $Size
      }

      $fullVector = @($grayValues.ToArray() + $rowMeans.ToArray() + $columnMeans.ToArray())
      return ,(Normalize-Vector -Values $fullVector)
    }
    finally {
      $resized.Dispose()
    }
  }
  finally {
    $bitmap.Dispose()
  }
}

$dataset = Get-Content $DatasetPath -Raw | ConvertFrom-Json
$samples = @()
$skipped = @()

foreach ($item in $dataset) {
  $absolutePath = Join-Path "D:\Visual\Cosmetica" $item.path

  try {
    $vector = Get-FeatureVector -ImagePath $absolutePath -Size $ImageSize
    $samples += [PSCustomObject]@{
      id = $item.id
      label = $item.label
      path = $item.path
      fold = $item.fold
      training_group = $item.training_group
      vector = $vector
    }
  }
  catch {
    $skipped += [PSCustomObject]@{
      id = $item.id
      path = $item.path
      reason = $_.Exception.Message
    }
  }
}

$featureLength = if ($samples.Count -gt 0) { $samples[0].vector.Count } else { 0 }

$output = [PSCustomObject]@{
  generated_at = [DateTime]::UtcNow.ToString("o")
  image_size = $ImageSize
  feature_length = $featureLength
  total_input_samples = $dataset.Count
  total_output_samples = $samples.Count
  skipped = $skipped
  samples = $samples
}

$output | ConvertTo-Json -Depth 6 | Set-Content $OutputPath
Write-Output "Features generated at backend/ml/face-shape-features.json"
Write-Output "Usable samples: $($samples.Count)"
