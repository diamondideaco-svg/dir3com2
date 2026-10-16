param([Parameter(Mandatory=$true)][string]$ArtifactDirectory)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$taskArtifacts=[IO.Path]::GetFullPath($ArtifactDirectory)
if(!$taskArtifacts.StartsWith('D:\DIR3COM-task199-local-validation\',[StringComparison]::OrdinalIgnoreCase)){throw 'Use the explicitly approved D-only test-artifact directory.'}
[void](New-Item -ItemType Directory -Path $taskArtifacts -Force)
$taskSources=@('Successor.Core.cs','Successor.Json.cs','Successor.Ledger.cs','Successor.TransportErrors.cs','Successor.Http.cs','IdentityEvidence.cs')|ForEach-Object {Join-Path $PSScriptRoot $_}
$taskRun=[guid]::NewGuid().ToString('N')
$taskLibrary=Join-Path $taskArtifacts ('Contract.'+$taskRun+'.dll')
Add-Type -Path $taskSources -OutputAssembly $taskLibrary -OutputType Library -ReferencedAssemblies System.Net.Http,System.Web.Extensions
$taskAssembly=[Reflection.Assembly]::ReflectionOnlyLoadFrom($taskLibrary)
if($null -ne $taskAssembly.EntryPoint -or $null -ne $taskAssembly.GetType('Dir3com.ApprovedSuccessor.HumanWindow')){throw 'Unexpected executable/window in helper.'}
$taskConstructors=$taskAssembly.GetType('Dir3com.ApprovedSuccessor.ApprovedStore').GetConstructors([Reflection.BindingFlags]'Instance,NonPublic')
if($taskConstructors.Count -ne 1 -or $taskConstructors[0].GetParameters().Count -ne 0){throw 'Synthetic store constructor in library.'}
$taskBinary=Join-Path $taskArtifacts ('ContractTests.'+$taskRun+'.exe')
$taskCompiler=New-Object Microsoft.CSharp.CSharpCodeProvider
$taskOptions=New-Object CodeDom.Compiler.CompilerParameters
$taskOptions.GenerateExecutable=$true;$taskOptions.OutputAssembly=$taskBinary
$taskOptions.CompilerOptions='/define:SYNTHETIC_TESTS /main:Dir3com.ApprovedSuccessor.ContractTests'
@('System.dll','System.Core.dll','System.Net.Http.dll','System.Web.Extensions.dll')|ForEach-Object {[void]$taskOptions.ReferencedAssemblies.Add($_)}
try {$taskCompilation=$taskCompiler.CompileAssemblyFromFile($taskOptions,[string[]]($taskSources+@(Join-Path $PSScriptRoot 'Contract.Tests.cs')))
 if($taskCompilation.Errors.HasErrors){$taskCompilation.Errors|ForEach-Object {$_.ToString()};throw 'Synthetic helper compilation failed.'}
} finally {$taskCompiler.Dispose()}
Push-Location $taskRoot
$taskPreviousRoot=$env:TASK199_HELPER_FIXTURE_ROOT
$env:TASK199_HELPER_FIXTURE_ROOT=Join-Path $taskArtifacts 'synthetic-ledgers'
try {$taskOutput=@(& $taskBinary);$taskExit=$LASTEXITCODE} finally {Pop-Location;$env:TASK199_HELPER_FIXTURE_ROOT=$taskPreviousRoot}
$taskOutput|Write-Output
$taskOutput|Set-Content -LiteralPath (Join-Path $taskArtifacts ($taskRun+'.log')) -Encoding UTF8
if($taskExit -ne 0){throw 'Synthetic helper assertions failed.'}
[ordered]@{librarySha256=(Get-FileHash -LiteralPath $taskLibrary -Algorithm SHA256).Hash.ToLowerInvariant();entryPoint=$false;syntheticConstructor=$false;summary=($taskOutput[-1]|ConvertFrom-Json)}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $taskArtifacts ($taskRun+'.json')) -Encoding UTF8
