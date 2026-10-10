$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$tools = Join-Path $PSScriptRoot 'tools'
$build = Join-Path $PSScriptRoot 'build'
$dist = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force -Path $build,$dist | Out-Null

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Build command failed: $Executable ($LASTEXITCODE)" }
}

# Windows 单文件程序和简单安装器。
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap 64,64
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::FromArgb(237,194,46))
$font = New-Object System.Drawing.Font 'Arial',18,([System.Drawing.FontStyle]::Bold)
$graphics.DrawString('2048',$font,[System.Drawing.Brushes]::White,0,18)
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$iconPath = Join-Path $build 'game.ico'
$stream = [System.IO.File]::Create($iconPath)
$icon.Save($stream)
$stream.Dispose(); $graphics.Dispose(); $font.Dispose(); $bitmap.Dispose()
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$webview = Join-Path $tools 'webview2\lib\net462'
$core = Join-Path $webview 'Microsoft.Web.WebView2.Core.dll'
$forms = Join-Path $webview 'Microsoft.Web.WebView2.WinForms.dll'
$native = Join-Path $tools 'webview2\runtimes\win-x64\native\WebView2Loader.dll'
$gameExe = Join-Path $dist '2048.exe'
$arguments = @('/nologo','/target:winexe','/platform:x64','/optimize+',"/out:$gameExe","/win32icon:$iconPath",
    '/reference:System.dll','/reference:System.Core.dll','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll',
    "/reference:$core","/reference:$forms","/resource:$core,Microsoft.Web.WebView2.Core.dll", "/resource:$forms,Microsoft.Web.WebView2.WinForms.dll",
    "/resource:$native,WebView2Loader.dll","/resource:$iconPath,game.ico")
foreach ($file in @('index.html','style.css','script.js')) { $arguments += "/resource:$(Join-Path $projectRoot $file),$file" }
$arguments += (Join-Path $PSScriptRoot 'windows\Program.cs')
Invoke-Checked $compiler $arguments
Invoke-Checked $compiler @('/nologo','/target:winexe','/platform:x64','/optimize+',"/out:$(Join-Path $dist '2048-Setup.exe')",
    "/win32icon:$iconPath",'/reference:System.dll','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll',
    "/resource:$gameExe,2048.exe",(Join-Path $PSScriptRoot 'windows\Setup.cs'))

# Android：官方 SDK 工具直接编译，不需要 Gradle 或 Android Studio。
$android = Join-Path $PSScriptRoot 'android'
$androidBuild = Join-Path $build 'android'
$assets = Join-Path $androidBuild 'assets'
$classes = Join-Path $androidBuild 'classes'
$dex = Join-Path $androidBuild 'dex'
New-Item -ItemType Directory -Force -Path $androidBuild,$assets,$classes,$dex | Out-Null
foreach ($file in @('index.html','style.css','script.js')) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $assets -Force }
$jdkBin = Split-Path -Parent (Get-Command javac.exe).Source
$sdkTools = Join-Path $tools 'build-tools\android-15'
$androidJar = Join-Path $tools 'platform\android-35\android.jar'
$resources = Join-Path $androidBuild 'resources.zip'
$unsigned = Join-Path $androidBuild 'unsigned.apk'
$aligned = Join-Path $androidBuild 'aligned.apk'
Invoke-Checked (Join-Path $sdkTools 'aapt2.exe') @('compile','--dir',(Join-Path $android 'res'),'-o',$resources)
Invoke-Checked (Join-Path $sdkTools 'aapt2.exe') @('link','-o',$unsigned,'--manifest',(Join-Path $android 'AndroidManifest.xml'),'-I',$androidJar,'-A',$assets,$resources)
Invoke-Checked (Join-Path $jdkBin 'javac.exe') @('--release','8','-encoding','UTF-8','-classpath',$androidJar,'-d',$classes,(Join-Path $android 'src\com\xuzhihang\game2048\MainActivity.java'))
$classFiles = @(Get-ChildItem -LiteralPath $classes -Recurse -Filter '*.class' | ForEach-Object FullName)
Invoke-Checked (Join-Path $jdkBin 'java.exe') (@('-cp',(Join-Path $sdkTools 'lib\d8.jar'),'com.android.tools.r8.D8','--release','--min-api','26','--lib',$androidJar,'--output',$dex) + $classFiles)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($unsigned,[System.IO.Compression.ZipArchiveMode]::Update)
try {
    if ($archive.GetEntry('classes.dex')) { $archive.GetEntry('classes.dex').Delete() }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $dex 'classes.dex'),'classes.dex') | Out-Null
} finally { $archive.Dispose() }
Invoke-Checked (Join-Path $sdkTools 'zipalign.exe') @('-f','-p','4',$unsigned,$aligned)

# 保留同一把签名密钥，后续 APK 才能覆盖安装。密码不输出到终端。
$signing = Join-Path $PSScriptRoot 'signing'
New-Item -ItemType Directory -Force -Path $signing | Out-Null
$key = Join-Path $signing '2048-release.jks'
$passwordFile = Join-Path $signing 'password.txt'
if (!(Test-Path -LiteralPath $passwordFile)) { [Guid]::NewGuid().ToString('N') | Set-Content -LiteralPath $passwordFile -NoNewline }
$env:TASK_APK_STORE_PASS = (Get-Content -LiteralPath $passwordFile -Raw).Trim()
try {
    if (!(Test-Path -LiteralPath $key)) {
        Invoke-Checked (Join-Path $jdkBin 'keytool.exe') @('-genkeypair','-keystore',$key,'-storepass:env','TASK_APK_STORE_PASS','-keypass:env','TASK_APK_STORE_PASS','-alias','game2048','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=2048 Local Release, O=2048, C=CN')
    }
    $signer = Join-Path $sdkTools 'lib\apksigner.jar'
    $apk = Join-Path $dist '2048.apk'
    Invoke-Checked (Join-Path $jdkBin 'java.exe') @('-jar',$signer,'sign','--ks',$key,'--ks-key-alias','game2048','--ks-pass','env:TASK_APK_STORE_PASS','--out',$apk,$aligned)
    Invoke-Checked (Join-Path $jdkBin 'java.exe') @('-jar',$signer,'verify','--verbose',$apk)
    Invoke-Checked (Join-Path $sdkTools 'aapt2.exe') @('dump','badging',$apk)
} finally { Remove-Item Env:TASK_APK_STORE_PASS }
Get-ChildItem -LiteralPath $dist -File | Select-Object Name,Length
