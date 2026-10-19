# Codex 병렬 작업용 worktree 생성·정리 스크립트
#
# git worktree는 추적 파일만 체크아웃하므로 node_modules(694MB), .env.local, .local/ 이 없다.
# 이 셋을 연결하지 않으면 검증이 실패하거나 — 더 나쁘게 — 조용히 스킵된다.
#   .local/ 부재 시 tests/operating-quote-parity.test.ts 가 describe.skipIf 로 스킵되어
#   견적 회귀 기준선 3개 케이스가 검증되지 않은 채 초록불이 뜬다.
#
# 사용법:
#   .\scripts\worktree-setup.ps1 -Name T-001                 # 생성
#   .\scripts\worktree-setup.ps1 -Name T-001 -Remove         # 정리
#   .\scripts\worktree-setup.ps1 -List                       # 목록
#
# 규약: docs/orchestration/ORCHESTRATION.md

[CmdletBinding(DefaultParameterSetName = 'Create')]
param(
  [Parameter(ParameterSetName = 'Create', Mandatory = $true)]
  [Parameter(ParameterSetName = 'Remove', Mandatory = $true)]
  [ValidatePattern('^[A-Za-z0-9._-]+$')]
  [string]$Name,

  [Parameter(ParameterSetName = 'Remove', Mandatory = $true)]
  [switch]$Remove,

  [Parameter(ParameterSetName = 'List', Mandatory = $true)]
  [switch]$List,

  [Parameter(ParameterSetName = 'Create')]
  [string]$BaseBranch = 'main'
)

$ErrorActionPreference = 'Stop'
# 한글 출력이 깨지지 않게 콘솔 인코딩을 UTF-8로 맞춘다.
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

# 저장소 루트를 git에게 직접 묻는다 (스크립트가 어디서 호출돼도 동일하게 동작)
$repo = (git rev-parse --show-toplevel 2>$null)
if (-not $repo) { throw "git 저장소가 아닙니다. 저장소 안에서 실행하세요." }
$repo = $repo -replace '/', '\'

# worktree 위치: OneDrive 밖, 저장소 밖.
#   - 저장소 안에 두면 git 이 자신을 추적하려 하고 Next.js 가 스캔한다.
#   - OneDrive 안에 두면 동기화가 node_modules junction 과 빌드 산출물을 긁어
#     충돌 파일을 만들고 느려진다. 이 프로젝트는 OneDrive 안에 있으므로 반드시 밖으로 뺀다.
$wtRoot = Join-Path $env:USERPROFILE 'pbc-ems-worktrees'

# 원본에서 가져와야 하는 비추적 자산
#   node_modules : junction (694MB 복사 회피)
#   .local       : junction (회귀 기준선 데이터. 없으면 테스트가 조용히 스킵됨)
#   .env.local   : 복사 (worktree별로 수정될 수 있어 링크하지 않는다)
$junctions = @('node_modules', '.local')
$copies    = @('.env.local')

function Get-WorktreePath([string]$n) { Join-Path $wtRoot $n }

# junction 만 삭제한다. 실디렉터리면 건드리지 않아 원본 데이터 삭제 사고를 막는다.
function Remove-LinkOnly([string]$path) {
  if (-not (Test-Path $path)) { return }
  $item = Get-Item $path -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    $item.Delete()
  } else {
    Write-Warning "  $path 는 junction 이 아닙니다. 수동 확인이 필요합니다 (삭제하지 않음)."
  }
}

# ---------------------------------------------------------------- List
if ($List) {
  Write-Output "=== git worktree ==="
  git worktree list
  if (Test-Path $wtRoot) {
    Write-Output ""
    Write-Output "=== $wtRoot ==="
    Get-ChildItem $wtRoot -Directory -ErrorAction SilentlyContinue |
      Select-Object Name, LastWriteTime | Format-Table -AutoSize
  }
  return
}

$wt = Get-WorktreePath $Name

# -------------------------------------------------------------- Remove
if ($Remove) {
  Write-Output "worktree 정리: $Name"

  if (Test-Path $wt) {
    # 커밋되지 않은 변경을 먼저 경고한다. --force 는 그것을 조용히 버린다.
    Push-Location $wt
    $dirty = (git status --porcelain 2>$null)
    Pop-Location
    if ($dirty) {
      Write-Warning "커밋되지 않은 변경이 있습니다:"
      $dirty -split "`n" | Select-Object -First 10 | ForEach-Object { Write-Warning "  $_" }
      $answer = Read-Host "그래도 제거하시겠습니까? 변경이 사라집니다 (yes 입력)"
      if ($answer -ne 'yes') { Write-Output "취소했습니다."; return }
    }

    # 링크를 먼저 끊는다. 순서를 지키지 않으면 git 이 junction 을 따라가
    # 원본 node_modules / .local 을 지울 수 있다.
    foreach ($j in $junctions) { Remove-LinkOnly (Join-Path $wt $j) }
    foreach ($c in $copies) {
      $p = Join-Path $wt $c
      if (Test-Path $p) { Remove-Item $p -Force }
    }
  }

  git worktree remove --force $wt 2>&1 | Out-Null
  git worktree prune

  # 브랜치는 남긴다. 작업 결과가 아직 머지되지 않았을 수 있다.
  Write-Output "완료. 브랜치 'wt/$Name' 은 보존했습니다."
  Write-Output "  병합 후 삭제: git branch -d wt/$Name"
  return
}

# -------------------------------------------------------------- Create
if (Test-Path $wt) { throw "이미 존재합니다: $wt`n  정리: .\scripts\worktree-setup.ps1 -Name $Name -Remove" }

# 원본에 자산이 있는지 먼저 확인한다. 없는 상태로 만들면 검증이 조용히 실패한다.
foreach ($a in ($junctions + $copies)) {
  if (-not (Test-Path (Join-Path $repo $a))) {
    throw "원본에 $a 가 없습니다. node_modules 는 'npm install', .env.local 은 .env.example 참고."
  }
}

$branch = "wt/$Name"
Write-Output "worktree 생성: $Name  (브랜치 $branch, 기준 $BaseBranch)"
New-Item -ItemType Directory -Path $wtRoot -Force | Out-Null
git worktree add -b $branch $wt $BaseBranch
if ($LASTEXITCODE -ne 0) { throw "git worktree add 실패" }

foreach ($j in $junctions) {
  New-Item -ItemType Junction -Path (Join-Path $wt $j) -Target (Join-Path $repo $j) | Out-Null
  Write-Output "  junction  $j"
}
foreach ($c in $copies) {
  Copy-Item (Join-Path $repo $c) (Join-Path $wt $c)
  Write-Output "  copy      $c"
}

# 검증이 실제로 돌아가는지 즉시 확인한다. 특히 회귀 기준선 스킵 여부.
Write-Output ""
Write-Output "검증 중 (typecheck + 단위 테스트)..."
Push-Location $wt
try {
  npm run typecheck 2>&1 | Select-Object -Last 3
  if ($LASTEXITCODE -ne 0) { Write-Warning "typecheck 실패 — worktree 설정을 확인하세요." }

  $testOut = npx vitest run --no-file-parallelism --exclude "tests/integration/**" 2>&1
  $summary = $testOut | Select-String -Pattern 'Test Files'
  Write-Output "  $summary"
  # 원본 기준: 12 passed. skip 이 보이면 .local junction 이 동작하지 않은 것이다.
  if ($summary -match 'skipped') {
    Write-Warning "테스트가 스킵되었습니다. .local junction 을 확인하세요."
    Write-Warning "  견적 회귀 기준선(operating-quote-parity)이 검증되지 않습니다."
  }
} finally { Pop-Location }

Write-Output ""
Write-Output "준비 완료: $wt"
Write-Output ""
Write-Output "Codex 실행 예 (implementer):"
Write-Output "  codex exec -C `"$wt`" -s workspace-write ``"
Write-Output "    -c model=`"gpt-6.1-sol`" -c model_reasoning_effort=`"high`" ``"
Write-Output "    -o `"$repo\docs\orchestration\results\$Name.md`" ``"
Write-Output "    `"`$(cat '$repo\docs\orchestration\tasks\$Name-<slug>.md')`""
Write-Output ""
Write-Output "주의: 통합 테스트(npm run test:integration)는 로컬 DB를 리셋합니다."
Write-Output "      worktree 가 달라도 DB 는 공유되므로 동시 실행하지 마세요."
