$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$edpRoot = Split-Path -Parent $PSScriptRoot
$edpData = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $edpRoot 'src/data/phrases.json') | ConvertFrom-Json
$edpOutput = Join-Path $edpRoot 'public/narration'
New-Item -ItemType Directory -Force -Path $edpOutput | Out-Null
$edpSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$edpManifest = [ordered]@{}
try {
    $edpSynth.SelectVoice('Microsoft Haruka Desktop')
    $edpSynth.Rate = 2
    $edpFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    foreach ($edpPhrase in $edpData.phrases) {
        $edpFile = Join-Path $edpOutput ($edpPhrase.id + '.wav')
        $edpSynth.SetOutputToWaveFile($edpFile, $edpFormat)
        $edpText = $edpPhrase.words -join ' '
        $edpSynth.Speak($edpText)
        $edpSynth.SetOutputToNull()
        $edpManifest[$edpText] = 'narration/' + $edpPhrase.id + '.wav'
    }
    $edpJson = $edpManifest | ConvertTo-Json
    [System.IO.File]::WriteAllText((Join-Path $edpRoot 'src/data/narration.json'), $edpJson, (New-Object System.Text.UTF8Encoding($false)))
} finally { $edpSynth.Dispose() }
node (Join-Path $PSScriptRoot 'trim-narration.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Narration trimming failed.' }
Write-Output ('Generated ' + $edpManifest.Count + ' local narration files.')
