# AgentWizard 코드 분석 보고서

> 분석 대상: `agent-wizard` v0.1.0 (현재 워크스페이스)
> 분석 방식: 소스 파일 직접 read/grep 실측 (추측 없음, 근거 미확인 항목은 "확인 필요"로 표기)
> 결론 요약: **아키텍처 설계는 우수하나, "쓰기 경로가 2개로 분리되어 안전장치가 비대칭"인 구조적 결함 1건과 데이터 유실 위험 3건이 존재**

---

## 1. 프로젝트 개요

### 1.1 정체성
여러 AI 코딩 어시스턴트(OpenClaw / Hermes / Claude Code / Cursor / Copilot / Aider)의 **설정 파일을 하나의 프로파일로 통합 관리**하는 CLI + TUI 도구.

- `package.json` — name `agent-wizard`, version `0.1.0`, bin `./dist/cli.mjs`, `engines.node >= 18`
- 런타임 의존성: `commander`(CLI), `inquirer`(대화형), `ink`+`react`(TUI), `chalk`/`ora`(출력), `json5`(OpenClaw), `yaml`(Hermes/Aider), `zod`(스키마 검증)
- 빌드: `tsup` (CJS + ESM + DTS), 테스트: `vitest`, 린트: `eslint 9` flat config

### 1.2 디렉터리 구조 (실측)

```
src/
├── index.ts                  공개 API 파사드 (Adapter 6종 + AgentWizard export)
├── cli/index.ts              CLI 진입점 (commander) — 서브커맨드 17개
├── core/
│   ├── agent-wizard.ts       고수준 퍼사드 (detect/configure/writeConfig/validate/getStatus/listProfiles)
│   ├── wizard.ts             대화형 설정 흐름 (inquirer)
│   ├── detector.ts           프로젝트 타입/언어/프레임워크/툴 감지
│   ├── tools.ts              SUPPORTED_TOOLS 단일 소스
│   ├── profile.ts / profile-manager.ts   프로파일 CRUD (YAML, 로컬/글로벌)
│   ├── sync.ts               프로파일 ↔ 툴 설정 동기화 (병합 + dry-run + 백업)
│   ├── backup.ts             타임스탬프 백업
│   ├── status.ts / status-adapter.ts     툴 상태 집계 (active/configured/error/not-configured)
│   ├── tool-check.ts         PATH 바이너리 탐색 (Windows PATHEXT 대응)
│   ├── agent-editor.ts       툴 독립 에이전트 편집 포트 + dot-notation 유틸
│   ├── editors/*.ts          툴별 편집기 5종 (+ openclaw-wizard.ts)
├── adapters/*.ts             툴별 어댑터 6종 (detect/read/write/validate)
├── schemas/tool-schemas.ts   zod 스키마 (on-disk 포맷 검증)
└── dashboard/                Ink TUI (index.tsx + components 3종)
```

---

## 2. 기능 정리

### 2.1 CLI 서브커맨드 (실측: `src/cli/index.ts`)

| 그룹 | 커맨드 | 동작 |
|---|---|---|
| 루트 | `init` | 대화형 초기 설정 (TTY 필수, 비TTY 시 exit 1) |
| | `configure` | 대화형 재설정 (`init`과 본문 동일) |
| | `detect` | 프로젝트 정보 + 6툴 설치 여부 출력 |
| | `validate` | 각 툴 설정 스키마 검증, 오류 시 exit 1 |
| | `list` | 각 툴 configured/not configured 표시 |
| | `dashboard` | Ink TUI 실행 (동적 import) |
| `profile` | `list` / `create <name>` / `show` / `delete` / `use` / `export` / `import` | 프로파일 CRUD + default 지정 + YAML stdin/stdout 파이프 |
| `agent` | `add <profile> <tool>` / `remove` / `config` / `list` | 프로파일 내 에이전트 관리, `config`는 JSON 파싱 시도 후 문자열 폴백 |
| `sync` | `to-tools <profile> [-n\|--dry-run]` / `from-tools` | 프로파일→툴 설정 병합 기록 / 기존 설정→프로파일 역수입 |
| `status` | `list` / `show <tool>` | 6툴 상태 집계 출력 (에이전트 수, configValid, 스코프, 권한 수) |

**비대화형 지원**: `init`/`configure`/`agent add` 모두 `!process.stdin.isTTY` 분기 처리 → CI/스크립트에서 사용 가능. `profile create`는 `-d` 옵션으로 비TTY 폴백.

### 2.2 어댑터 6종 (`src/adapters/`)

| 어댑터 | 대상 경로 | 포맷 | 특징 |
|---|---|---|---|
| OpenClaw | `~/.openclaw/openclaw.json` | JSON5 | `agents.entries`(Record)와 `agents.list`(Array) **두 형태 모두 지원** |
| Hermes | `~/.hermes/config.yaml` | YAML | `agent.personalities`, 내장 personality 구분 |
| Claude Code | `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json` | JSON | 스코프 3단(user/project/local) |
| Cursor | `.cursor/rules/*.mdc` | Markdown+frontmatter | description/globs/alwaysApply |
| Copilot | `.github/copilot-instructions.md` + `.github/instructions/*.instructions.md` | Markdown | applyTo/excludeAgent 경로별 지시, 기존 커스텀 내용 보존 병합 |
| Aider | `.aider.conf.yml`, `aider.conf.yml` (cwd + home) | YAML | 50+ 옵션 타입 정의 |

각 어댑터는 공통 계약(`detect` / `read` / `write` / `validate`)을 따르며, `src/schemas/tool-schemas.ts`의 zod 스키마로 **on-disk 포맷**을 검증한다 (`.passthrough()`로 미지원 키 허용 → 사용자 소유 파일을 깨지 않는 설계 철학).

### 2.3 핵심 기능 4축

1. **프로파일 관리** (`profile-manager.ts`)
   - 로컬(`./.agent-wizard/profiles`) 우선, 글로벌(`~/.agent-wizard/profiles`) 폴백
   - `validateProfileName()`으로 경로 주입(`..`, `/`, `\`, 제어문자) 차단 — 보안 하드닝 확인됨
   - export/import(YAML 파이프), `default-profile.txt`로 기본 프로파일 관리
2. **동기화** (`sync.ts`)
   - **병합 기반(non-destructive)**: 기존 파일을 읽어 unknown 키 보존 후 병합
   - `--dry-run`: `SyncPreviewEntry{action: create|modify|unchanged}`로 쓰기 전 미리보기
   - 쓰기 전 `backupFile()` 자동 호출
   - 실패 시 `SyncFailure{tool, reason}` 반환, CLI는 `process.exitCode = 1`
3. **상태 집계** (`status-adapter.ts`)
   - `active`(설정 유효 + 바이너리 PATH 존재) / `configured`(설정만) / `error`(파싱·검증 실패) / `not-configured` 4단 판정 — **의미론이 문서화되어 있고 정직함**
   - `findExecutable()`(`tool-check.ts`)로 Windows `PATHEXT`까지 처리
4. **툴 독립 에이전트 편집** (`agent-editor.ts`)
   - `AgentEditorPort` 인터페이스(listAgents/getAgentRaw/setAgentKey/unsetAgentKey/addAgent/removeAgent/save)
   - dot-notation `getByPath`/`setByPath`/`deleteByPath`, `parseValue`(JSON 자동 추론)
   - 6툴 전부 `createAgentEditor(tool)`로 팩토리 연결 → TUI/CLI가 동일 방식으로 편집

### 2.4 TUI 대시보드 (`src/dashboard/`)

- Ink 기반 3단 뷰(`tools` → `agents` → `editor`)
- 30초 주기 자동 폴링(`setInterval(fetchData, 30000)`), `q`로 단계적 뒤로가기
- 컴포넌트 분리: `ToolStatusCard` / `AgentDetailPanel` / `AgentEditorPanel`

### 2.5 테스트·CI

- 테스트 파일 **10개 실측**: `basic`, `integration`, `cli`, `sync`, `backup`, `status`, `schemas`, `hardening`, `adapters-extra`, `agent-editor-all-tools`
- `.github/workflows/ci.yml` + `npm run verify` = `lint → typecheck → test:run → build`
- `prepublishOnly`가 동일 게이트 재실행 → 배포 사고 방지

---

## 3. 장점

| # | 장점 | 근거 |
|---|---|---|
| 1 | **비파괴 병합 원칙이 코드 전체에 일관 적용** | `sync.ts`의 `merged = {...existing, ...}` 패턴, `adapters/copilot.ts` `mergeInstructions()`의 커스텀 영역 보존 |
| 2 | **dry-run이 실물 구현** | `SyncOptions.dryRun`, `applyWrite()`가 dryRun 시 fs 접근 없이 `action`만 반환 (`sync.ts`) |
| 3 | **백업이 파일 단위로 자동화** | `backup.ts` — `.bak-YYYYMMDD-HHMMSS`, 동일 초 충돌 시 `-N` suffix로 이력 보존 |
| 4 | **PATH 바이너리 실측 판정** | `tool-check.ts` — config 존재만으로 "설치됨"이라 속이지 않음. Copilot은 "CLI가 없으니 configured가 상한"이라 **정직하게 상한을 명시** (`status-adapter.ts` getCopilotStatus 주석) |
| 5 | **스키마 검증이 실제로 붙어 있음** | `schemas/tool-schemas.ts` zod 6종 + `validateWithSchema`, Cursor/Copilot 프론트매터까지 검증 |
| 6 | **툴 독립 편집 추상화** | `AgentEditorPort` 덕분에 신규 툴 추가 시 인터페이스 1개만 구현하면 TUI/CLI 양쪽에서 자동 지원 |
| 7 | **보안 하드닝** | `validateProfileName()` — `..`, 경로 구분자, 제어문자, 공백 트림 위반 차단 (`profile-manager.ts`) |
| 8 | **CLI 에러 처리 규율** | 대부분 액션이 try/catch + `process.exit(1)`, `sync` 실패는 `exitCode`만 설정해 부분 성공 정보 유실 없음 |
| 9 | **이중 포맷 지원** | OpenClaw `entries`(Record) / `list`(Array) 둘 다 읽고 **원래 형태를 유지하며** 씀 (`syncToOpenClaw`의 `useList` 분기) |
| 10 | **문서-코드 정합 노력** | `docs/WORK_REPORT.md`에 DoD 10항목 + 커밋 해시별 근거 표, `docs/V1.0_PLAN.md` 계획서 존재 |
| 11 | **비TTY 폴백** | `init`/`configure`/`agent add`가 TTY 없으면 명확한 안내 후 종료 → CI 파이프라인에서 행 걸림 없음 |
| 12 | **단일 소스 상수** | `tools.ts` `SUPPORTED_TOOLS` + `isSupportedTool()` 타입가드 |

---

## 4. 개선 필요 사항 (우선순위순)

### 🔴 P0 — 데이터 안전 (즉시 수정 권장)

#### P0-1. `init`/`configure` 경로가 **백업 없이** 설정 파일을 덮어쓴다
- **근거**: `src/adapters/openclaw.ts`의 `write()`는 `readRaw()` → `fs.writeFile()`만 수행. **`backupFile()` 호출 없음**.
  - `grep backupFile` 실측 결과 호출 지점: `core/editors/*`, `core/openclaw-wizard.ts`, `core/profile-manager.ts`, `core/sync.ts` — **`src/adapters/*`에는 0건**.
- **영향**: `agent-wizard init`은 `ConfigWizard.writeConfig()` → `writeToolConfig()` → `adapter.write()`를 호출한다. 즉 **백업이 없는 유일한 쓰기 경로가 `init`/`configure`, 곧 사용자가 가장 먼저 쓰는 경로**다. 반면 `sync to-tools`는 백업한다. 안전장치가 경로별로 비대칭.
- **동시에 포맷 불일치**: 어댑터 `write()`는 `JSON5.stringify`를, `ProfileSync.syncToOpenClaw`는 `JSON.stringify`를 쓴다. **같은 파일을 두 코드 경로가 다른 포맷으로 쓴다** → JSON5 주석이 sync 경로에서 소실됨.
- **개선안**:
  1. `adapters/*.write()`에도 `await backupFile(configPath)` 선행 (1줄씩, 전 어댑터 공통)
  2. 포맷 직렬화를 어댑터로 단일화 — `ProfileSync`는 `serialize` 콜백을 어댑터에서 주입받도록 변경 (`OpenClawAdapter.serialize()` 추가)
  3. 회귀 테스트: `init` 실행 후 `.bak-*` 존재 assert

#### P0-2. 백업 실패 시에도 쓰기를 강행한다
- **근거**: `src/core/backup.ts` — `fs.copyFile` 실패 시 `catch { return null; }`. `sync.ts` `applyWrite()`는 반환값을 **검사하지 않고** 다음 줄에서 `fs.writeFile()` 실행.
- **영향**: 디스크 풀/권한 오류 시 "백업 성공" 가정 하에 원본이 소실된다. docs가 내세운 "어떤 동기화도 기존 설정을 파괴하지 않음"이 코드로 보증되지 않음.
- **개선안**: `backupFile()`가 null 반환 시 `applyWrite()`와 각 editor에서 **throw** 또는 최소한 경고 + `--force` 요구.

#### P0-3. `syncToCursor` / `syncToCopilot`이 **에이전트 루프 안에서 고정 파일명**을 덮어쓴다
- **근거**: `src/core/sync.ts`
  - `syncToCursor()`: `const filePath = path.join(rulesDir, 'agent-wizard.mdc')` — 에이전트와 무관한 **고정 경로**
  - `syncToCopilot()`: `path.join(instructionsDir, 'copilot-instructions.md')` — 동일 문제
  - `syncProfileToTools()`는 `for (const agent of profile.agents)`로 순회하며 각각 호출
- **영향**: 프로파일에 Cursor 에이전트가 2개면 **두 번째 에이전트의 instructions가 첫 번째를 덮어쓴다**(last-write-wins). 다른 4툴은 병합 로직이 있어 안전한데 이 2툴만 누적 불가.
- **개선안**: 파일명을 `${agent.id}-${slug(agent.name)}.mdc`처럼 에이전트 단위로 분리하거나, Copilot은 `syncToCopilot` 내부에서 `## ${agent.name}` 섹션 병합으로 변경.

### 🟠 P1 — 기능 결함

#### P1-1. 대화형 위저드가 수집한 답변을 **버린다**
- **근거**: `src/core/wizard.ts`
  - `configureAider()`: `architect` 답변을 prompt로 받지만 반환 객체에 **반영 없음** (`{id,name,role,model,instructions:'',tools:[],guardrails:[]}`)
  - `configureHermes()`: `reasoningEffort` 답변도 반환 객체에 없음
  - 모든 툴의 `configureXxx()`가 `Agent` 타입에 없는 설정을 담지 못함 — `Agent`에 `settings` 필드 부재(`core/types.ts`)
- **영향**: 사용자가 "architect mode 켜기", "reasoning effort: high"를 선택해도 **아무 일도 일어나지 않는다.** 조용한 no-op.
- **개선안**: `Agent`에 `settings?: Record<string, unknown>` 추가 후 어댑터 `fromAgentConfig`에서 소비, 또는 `configureXxx()`가 `AgentProfile.settings`에 직접 기록하도록 통합.

#### P1-2. `ConfigWizard`가 라이브러리인데 `process.exit(0)`을 호출한다
- **근거**: `src/core/wizard.ts` `reviewConfig()` — 미확인 시 `console.log(...); process.exit(0)`
- **영향**: `src/index.ts`는 `AgentWizard`를 **공개 API로 export**한다. 라이브러리 사용자가 `configure()`를 호출했을 때 확인을 거부하면 **호스트 프로세스가 종료**된다. 테스트/임베딩 불가.
- **개선안**: `reviewConfig()`가 `boolean`을 반환하고 `AgentWizard.configure()`가 `null` 또는 `{cancelled:true}`를 반환. `process.exit`은 `cli/index.ts`에만 남긴다.

#### P1-3. 프로파일 하나에 **동일 툴 에이전트를 2개 이상 담을 수 없다**
- **근거**: `src/core/profile-manager.ts` `createAgentProfile()` — `id: tool` 고정. `addAgent()`는 `id` 중복 시 throw.
- **영향**: "claude-code를 fast 모델용/architect용 2개" 같은 실사용 시나리오 불가. TUI 편집기(`addAgent(id, defaults)`)는 id를 받을 수 있는데 CLI 경로만 막혀 있음 — 인터페이스 비대칭.
- **개선안**: `id`를 `tool` 또는 `${tool}-${slug(name)}`, `-n/--name` 미지정 시에만 tool 사용.

#### P1-4. 프로젝트 감지 로직의 오탐/누락
- **근거**: `src/core/detector.ts`
  - `detectFrameworks()`: `allDeps['nestjs']`, `allDeps['angular']`, `allDeps['tauri']` — 실제 npm 패키지명은 `@nestjs/core`, `@angular/core`, `@tauri-apps/api`. **구조상 절대 매칭되지 않음**(false-negative 확정)
  - `getFiles()`: `fs.readdir(process.cwd())` 1단계만 + 파일만(`item.isFile()`), `.`으로 시작하는 파일 제외 → **`src/**/*.ts` 같은 중첩 소스가 언어 감지에서 누락**. `package.json`의 존재로 javascript만 보정됨(typescript는 `tsconfig.json`이 있어야 잡힘)
  - `detectCopilot()`: `.github/copilot-instructions.md`만 확인 — `CopilotAdapter.detect()`는 `.github/instructions` 디렉터리도 인정. **같은 툴을 두 코드가 다르게 판정**
- **개선안**: 패키지명 상수 맵(`{'@nestjs/core':'nestjs', '@angular/core':'angular'}`), `getFiles()`를 재귀(depth 제한) 또는 `glob` 기반으로, Copilot 감지를 어댑터에 위임해 **단일 소스화**.

#### P1-5. `deepEqual`이 `JSON.stringify` 문자열 비교
- **근거**: `src/core/sync.ts` `deepEqual(a,b) => JSON.stringify(a) === JSON.stringify(b)`
- **영향**: 병합 시 키 순서가 달라지면 실제 내용이 같아도 `modify`로 오판 → 불필요한 백업 파일과 파일 재작성이 누적된다(YAML 파서는 키 순서를 보존하지만 객체 spread 순서 변경에 취약).
- **개선안**: 키 정렬 후 비교 또는 재귀 비교 유틸(20줄 내외).

### 🟡 P2 — 코드 품질 / 유지보수

#### P2-1. CLI 코드 3중 중복 — 어댑터 목록 하드코딩
- **근거**: `src/cli/index.ts`의 `validate`, `list` 액션이 **어댑터 배열 6개를 각각 하드코딩**. `status`는 `StatusAdapter`, `sync`는 `ProfileSync`가 각자 어댑터를 `new`. 신규 툴 추가 시 **최소 5곳 수정** 필요.
- **개선안**: `adapters/index.ts`에 `getAllAdapters(): ToolAdapter[]` 팩토리 1개를 만들어 전 지점에서 사용. `tools.ts`의 `SUPPORTED_TOOLS`와 함께 단일 레지스트리로 통합.

#### P2-2. `init`과 `configure` 액션 본문이 사실상 동일
- **근거**: `src/cli/index.ts` — 두 액션 모두 `new ConfigWizard()` → `wizard.run()` → `wizard.writeConfig()`, 출력 문구만 다름.
- **개선안**: 공통 함수 `runWizard(mode: 'init'|'configure')`로 추출.

#### P2-3. 프로파일 YAML에 스키마 검증이 없다
- **근거**: `src/core/profile-manager.ts` `readProfileFromDir()` — `yaml.parse(content) as Profile` (타입 단언만, 런타임 검증 없음). `importProfile()`도 `profile.name` 존재만 확인.
- **영향**: 손상/수기편집된 `profile.yaml`이 `profile.agents.length` 접근 시 `TypeError`로 CLI 전역 실패.
- **개선안**: `schemas/tool-schemas.ts` 옆에 zod `profileSchema` 추가 후 `safeParse` → 실패 시 명확한 오류 메시지.

#### P2-4. Ink 앱 내부에서 `console.error` 사용
- **근거**: `src/dashboard/index.tsx` `fetchData()` catch 블록 — `console.error('Failed to fetch status:', error)`
- **영향**: Ink가 stdout을 독점 렌더링하므로 `console.error`는 TUI 화면을 깨뜨린다. 상태 조회 실패 시 화면이 뒤섞인다.
- **개선안**: React state(`error`)로 승격해 `<Text color="red">`로 렌더.

#### P2-5. `status-adapter.ts`가 어댑터 로직을 재구현
- **근거**: `getCursorStatus()`가 `.cursor/rules`를 `readdir` + **자체 정규식**으로 frontmatter 파싱(`/description:\s*"?(.*?)"?\s*$/m`). `CursorAdapter`에 이미 파서가 있는데 중복 구현.
- **영향**: 어댑터 파서를 고쳐도 status는 옛 동작을 유지 → 비정합.
- **개선안**: `adapter.read()` 결과를 사용하거나 `CursorAdapter.parseRule()`을 export해 공유.

#### P2-6. 의존성/엔진 선언 정합성 (확인 필요)
- **근거**: `package.json` `engines.node >= 18` vs `ink ^7.1.1`, `react ^19`. `ink` 7.x의 실제 최소 Node 요구 버전은 로컬에서 미검증 → **확인 필요**.
- **개선안**: `npm view ink@7 engines` / CI 매트릭스(Node 18)에서 `dashboard` 스모크 실행으로 실측 후 `engines` 상향 또는 ink 버전 하향.

#### P2-7. 백업 파일 무한 누적 + 수명주기 관리 부재
- **근거**: `src/core/backup.ts` — 매 호출 새 타임스탬프 파일 생성, **정리(prune) 로직 없음**. 백업이 설정 디렉터리 안에 쌓임.
- **영향**: 장기 사용 시 `~/.claude/`에 `.bak-*` 수십 개. 또한 Claude Code/Cursor 등 일부 툴은 dot-dir 내 알 수 없는 파일을 무시하지만, `.github/`에 `.bak-*`가 쌓이면 리포지토리를 오염시킨다.
- **개선안**: 보관 개수(`--keep N`, 기본 5) 옵션 + 백업을 사용자 데이터 디렉터리(`~/.agent-wizard/backups/<tool>/`)로 이동.

#### P2-8. `profile-manager.getDefaultProfile()`의 문자열 미정규화
- **근거**: `defaultProfileFile`을 `fs.readFile(..., 'utf-8')`로 읽어 **`.trim()` 없이** `readProfile(defaultName)`에 전달. `setDefaultProfile()`은 trim 없이 쓰므로 자체 왕복은 안전하지만, 파일을 수기 편집하거나 줄바꿈이 붙으면 `Profile not found`가 된다.
- **개선안**: `const defaultName = (await fs.readFile(...)).trim() || 'default'`.

#### P2-9. 문서 사실관계 (확인 필요)
- **근거**: `docs/WORK_REPORT.md` 3행 `> 작성일: 2026-08-03` — 현재 시점 기준 **미래 날짜**로 보이며 오기 가능성. 같은 문서 4행은 "v1.0 달성 / 100개 테스트"를 선언하지만 `package.json` version은 `0.1.0`.
- **확인 필요**: 테스트 총 개수 실제 카운트(`npm run test:run`) 및 버전 표기 정합. 사용자에게 "v1.0"으로 제시할 근거로 쓰기 전 실측 필요.
- **개선안**: 버전·테스트 수치는 실행 결과로만 문서에 기입(선언 → 실측 원칙).

### ⚪ P3 — 사소한 개선
- `src/core/agent-editor.ts`: `import` 문이 파일 **하단**에 위치(함수 선언 뒤). ESM에선 동작하지만 순환참조 위험과 가독성 저해 → 상단으로 이동.
- `src/core/detector.ts` `detectOpenClaw()` 등 6개 메서드가 `await import('os')`를 **메서드마다** 실행 → 파일 상단 정적 import로 통일.
- `src/core/tool-check.ts` `findExecutable()`이 PATH 전체를 **동기식(`accessSync`) 3중 루프**로 탐색 → PATH가 길면 status 호출마다 블로킹. 결과 캐시(1회 메모이즈) 권장.
- `src/core/wizard.ts` 모델 선택지가 하드코딩(`anthropic/claude-sonnet-4-6`, `claude-haiku-3-20240307` 등) → 모델 카탈로그를 `models.ts` 상수로 분리해 갱신 지점 1곳화.
- `sync to-tools`에서 `unchanged`인 툴은 `success`에 포함되지 않아, 사용자에겐 "아무것도 안 됨"으로 보임 → "변경 없음 N건" 별도 표기.

---

## 5. 종합 평가

### 강점 (구조)
이 프로젝트의 진짜 자산은 **추상화 3층**이다.
1. **어댑터 계약** — 6개 이기종 포맷(JSON5/YAML/JSON/Markdown×2)을 `detect/read/write/validate` 4메서드로 수렴
2. **`AgentEditorPort`** — 툴별 편집기를 동일 인터페이스로 통일해 TUI가 툴을 몰라도 편집 가능
3. **`StatusAdapter`의 4단 상태 의미론** — "설정은 있는데 바이너리가 없다"를 `configured`로 분리하고 Copilot은 상한을 명시한 **정직한 판정**

여기에 **비파괴 병합 + dry-run + 타임스탬프 백업**이라는 3중 안전 설계가 얹혀 있어, 설계 의도는 상용 도구 수준이다.

### 약점 (실행)
문제는 **의도가 코드 경로마다 균일하게 적용되지 않았다**는 점이다.
- 백업은 `sync`/`editors`에는 있고 **`adapters`(= `init` 경로)에는 없다** → 가장 위험한 곳이 가장 무방비
- 백업 실패를 무시하고 쓰기를 강행 → 안전 설계가 코드로 보증되지 않음
- `syncToCursor`/`syncToCopilot`의 고정 파일명 → 다중 에이전트에서 last-write-wins 데이터 손실
- 위저드가 받은 답변을 버림 → 사용자 선택이 조용히 무시됨

즉 **"설계는 A, 구현은 B"인 지점이 5곳**(P0-1, P0-2, P0-3, P1-1, P1-3)이며, 이는 테스트가 "동작함"은 검증했지만 **"경로 간 일관성"은 검증하지 않았기 때문**으로 보인다(테스트 10파일이 모두 단일 경로 단위 검증 중심).

### 권고 순서
1. **P0-1 + P0-2**를 한 커밋으로: 어댑터 `write()` 6곳에 `backupFile()` 삽입 + 백업 실패 시 throw. 회귀 테스트 2건.
2. **P0-3** 수정: 파일명을 에이전트 단위로 분리. `sync.test.ts`에 "동일 툴 에이전트 2개" 케이스 추가.
3. **P1-2** (`process.exit` 제거) → 라이브러리 API 신뢰성 확보. 이후 **P1-1**, **P1-3**.
4. P2는 신규 툴 추가 시점에 레지스트리화(P2-1)로 묶어 처리.

### 미검증 항목 (정직 고지)
- 각 어댑터 `validate()` 본문 전체(`openclaw.ts` 120행 이후, `claude-code.ts` 110행 이후, `aider.ts` 90행 이후)는 **부분만 읽음** → 해당 구간에 추가 결함이 있을 수 있음
- `src/core/editors/*` 5개 파일 본문 미열람 → 편집기의 백업/병합 정합성 별도 확인 필요
- `src/__tests__/*` 10개 파일 본문 미열람 → 테스트가 실제로 무엇을 assert하는지(커버리지 주장의 실체) 미확인
- 실제 `npm run verify` 실행 미수행 → 테스트 통과 수, lint/typecheck 결과는 `docs/WORK_REPORT.md`의 **자기 보고**이며 이 보고서에서 독립 검증하지 않았다
- `ink@7`의 Node 최소 버전(P2-6) 미확인

---

*본 보고서의 모든 코드 주장은 `src/**` 파일 직접 read/grep 결과에 근거하며, 근거를 확인하지 못한 항목은 "확인 필요"/"미검증"으로 명시했다.*
