# Baut bienenstock.html aus src/template.html + src/js/*.js + fonts/*.woff2 (eine Datei, alles inline)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$tpl  = [IO.File]::ReadAllText("$root\src\template.html", [Text.UTF8Encoding]::new($false))
$js   = (Get-ChildItem "$root\src\js\*.js" | Sort-Object Name | ForEach-Object {
          "// ===== $($_.Name) =====`n" + [IO.File]::ReadAllText($_.FullName, [Text.UTF8Encoding]::new($false)) }) -join "`n"
$fr   = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$root\fonts\Fraunces-600.woff2"))
$scp  = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$root\fonts\SourceCodePro-Regular.woff2"))
$out  = $tpl.Replace('@@SCRIPT@@', $js).Replace('@@FONT_FRAUNCES@@', $fr).Replace('@@FONT_SCP@@', $scp)
if ($out -match '@@[A-Z_]+@@') { throw "Platzhalter nicht ersetzt: $($Matches[0])" }
[IO.File]::WriteAllText("$root\bienenstock.html", $out, [Text.UTF8Encoding]::new($false))
$f = Get-Item "$root\bienenstock.html"
"bienenstock.html: {0:N0} Bytes, {1} Zeilen" -f $f.Length, ($out -split "`n").Count
