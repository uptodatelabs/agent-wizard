# 분석 보고서 지적사항 수정 대응표

> 원 보고서: [`docs/CODE_ANALYSIS_REPORT.md`](./CODE_ANALYSIS_REPORT.md)
> 작업일: 2026-10-28
> 범위: 보고서가 지목한 P0 3건 · P1 5건 · P2 9건 · P3 5건
> 원칙: **외부 동작·공개 API 계약 불변**(기존 테스트의 기대값을 바꾸지 않음)
> 최종 검증: `npm run verify` (lint → typecheck → test → build) **exit=0**

---

## 0. 검증 결과 (실측)

```
npm run verify   →  exit 0
  npm run lint       : 0 errors / 0 warnings
  npm run typecheck  : tsc --noEmit 통과
  npm run test:run   : Test Files 11 passed (11) / Tests 117 passed (117)
  npm run build      : CJS + ESM + DTS 모두 success
```

**베이스라인 대비:** 작업 착수 시점 `npm run typecheck` 는 **exit=2 (의존성 미설치로 인한 200+ 오류)**,
테스트는 100 passed(10 files)였다. 현재는 typecheck 0 오류, 117 passed(11 files)로
**신규 실패 0건, 신규 테스트 +17건**이다.

---

## 1. P0 — 데이터 안전

| # | 지적사항 | 수정 내용 | 검증 |
|---|---|---|---|
| P0-1 | `init`/`configure` 경로가 백업 없이 설정을 덮어씀 | 어댑터 6종의 `write()` 전부에 `await backupFile(경로)` 선행 삽입 — `adapters/openclaw.ts`, `hermes.ts`, `claude-code.ts`, `cursor.ts`(+`writeRule`), `copilot.ts`(+`writePathInstruction`), `aider.ts`. 포맷 직렬화는 `OpenClawAdapter.serialize()` 로 추출해 어댑터 내부에서 단일화 | `grep backupFile` → 6개 어댑터 전부 히트. `fixes.test.ts` 백업 관련 3건 통과 |
| P0-2 | 백업 실패를 무시하고 쓰기 강행 | `core/backup.ts` — `fs.copyFile` 실패를 **던지도록** 변경(문서 계약을 "null = 백업할 대상 없음 / throw = 백업 실패"로 명확화). `sync.ts applyWrite()` 는 예외를 `SyncFailure` 로 승격 | `fixes.test.ts` › `throws when an existing path cannot be backed up` 통과(디렉터리를 백업 대상으로 주입 → reject) |
| P0-3 | `syncToCursor`/`syncToCopilot` 이 고정 파일명에 써서 last-write-wins | Cursor: `agent-wizard-${sanitizeId(agent.id)}.mdc` 로 **에이전트별 파일 분리**. Copilot: `<!-- agent-wizard:<id> --> … <!-- /agent-wizard:<id> -->` 마커로 **섹션 upsert**(사용자 작성 영역 보존) | `fixes.test.ts` › `writes one Cursor rule file per agent`(2파일 확인), `accumulates Copilot managed sections`(두 마커 공존) 통과 |

**포맷 단일화에 대한 판단 근거:** sync 경로는 `JSON.stringify`(strict JSON)를 유지했다.
`sync.test.ts` 가 결과를 `JSON.parse` 로 읽고, strict JSON은 JSON5의 부분집합이라
OpenClaw가 그대로 읽는다. JSON5 스타일로 바꾸면 **기존 계약(테스트)이 깨지므로**
"동작 불변" 원칙에 따라 유지하고, 코드에 이유를 주석으로 남겼다(`sync.ts`).

---

## 2. P1 — 기능 결함

| # | 지적사항 | 수정 내용 | 검증 |
|---|---|---|---|
| P1-1 | 위저드가 수집한 답변(Aider architect, Hermes reasoning effort)을 버림 | `core/types.ts` 의 `Agent` 에 `settings?: Record<string, unknown>` 추가 → `wizard.ts` 가 `settings: { architect }` / `settings: { reasoning_effort }` 로 기록 → `adapters/aider.ts`·`hermes.ts` 의 `fromAgentConfig()` 가 소비 | `fixes.test.ts` › `writes the Aider architect answer`, `lets the Hermes reasoning_effort answer override` 통과 |
| P1-2 | 라이브러리인데 `reviewConfig()` 가 `process.exit(0)` 호출 | `reviewConfig()` → `Promise<boolean>` 반환. `WizardOptions.cancelled` / `AgentWizardResult.cancelled` 로 전파. `process.exit` 은 CLI 계층에만 잔존. CLI는 취소 시 "Nothing was written" 출력 후 **파일 미기록** | `typecheck` 통과 + `cli.test.ts` 8건 통과(exit code 계약 유지) |
| P1-3 | 프로파일 하나에 동일 툴 에이전트 2개 불가 | `createAgentProfile()` 의 id 를 `tool` → `tool[-슬러그]` + 중복 시 `-2`, `-3` suffix. 기존 프로파일/테스트의 `id === tool` 은 그대로 유지 | `fixes.test.ts` › `gives a second same-tool agent a unique id` 통과 |
| P1-4 | 감지 오탐/누락 (`nestjs`/`angular`/`tauri` 미매칭, 1단계 readdir, Copilot 판정 불일치) | `SCOPED_FRAMEWORK_PACKAGES` 로 `@nestjs/core`·`@angular/core`·`@tauri-apps/api`·`@tauri-apps/cli` 매칭. `getFiles()` 를 `MAX_SCAN_DEPTH=3`·`SKIP_DIRS` 적용 재귀 탐색으로 교체. `detectCopilot()` 을 `CopilotAdapter.detect()` 에 위임(단일 소스) | `typecheck` 통과 + `basic.test.ts`/`integration.test.ts` 의 detector 4건 통과 |
| P1-5 | `deepEqual` 이 `JSON.stringify` 문자열 비교 | 키 정렬 + 재귀 비교 `stableEqual()` 로 교체 → 키 순서만 다른 동일 설정을 `modify` 로 오판하지 않음 | `fixes.test.ts` › `keeps key order irrelevant when deciding "unchanged"` 통과 |

---

## 3. P2 — 코드 품질

| # | 지적사항 | 수정 내용 | 검증 |
|---|---|---|---|
| P2-1 | 어댑터 목록 5곳 하드코딩 | `src/adapters/index.ts` 신설 — `getAllAdapters(): RegisteredAdapter[]` + `ToolAdapter` 구조적 계약 + 라벨 표. CLI `validate`/`list` 와 `AgentWizard.validate()` 가 이 레지스트리 사용 | `fixes.test.ts` › `exposes every supported tool from one place` 통과 |
| P2-2 | `init`/`configure` 본문 중복 | CLI 내부 `writeConfiguredTools(wizard, mode: 'init'\|'configure')` 로 추출, 두 액션이 호출 | `grep writeConfiguredTools(wizard` → 2개 호출부 확인. lint 통과 |
| P2-3 | 프로파일 YAML 런타임 검증 없음 | `src/schemas/profile-schema.ts` — zod `profileSchema`/`agentProfileSchema` + `parseProfile()`. `readProfileFromDir()`·`importProfile()` 이 사용(누락 필드 정규화, 잘못된 데이터는 사유와 함께 거부) | `fixes.test.ts` › profile schema 3건 통과 |
| P2-4 | Ink 내부 `console.error` 가 화면을 깨뜨림 | `error` state 로 승격 → `<Text color="red">⚠ Status refresh failed: …</Text>` 로 렌더 | `grep console.error` → 대시보드에서 제거 확인. lint 통과 |
| P2-5 | `status-adapter` 가 Cursor frontmatter 파서를 재구현 | `CursorAdapter.parseRule()` 을 공개 메서드로 승격하고 `status-adapter.ts` 가 호출 | `grep parseRule` → `adapters/cursor.ts` 정의 1곳 + `status-adapter.ts` 사용 1곳 확인 |
| P2-6 | `engines >=18` vs `ink@7`(실제 `node>=22`) 불일치 | **실측**: `npm view ink@7 engines` → 전 버전 `>=22`, `ink@6` → `>=20`. → `ink ^6.5.1`, `engines >=20.0.0`, CI 매트릭스 `[20, 22]` 로 정합 | `npm view` 출력 + `package.json`·`ci.yml` read. `npm install` exit=0, 빌드/테스트 통과 |
| P2-7 | 백업 무한 누적 | `pruneBackups()` + `DEFAULT_BACKUP_KEEP = 10`, `AGENT_WIZARD_BACKUP_KEEP` env 로 조정(0=비활성). **자체 생성 패턴(`.bak-YYYYMMDD-HHMMSS[-N]`)만** 삭제 대상 | `fixes.test.ts` › `prunes older backups` (keep:2 → 2개 유지) 통과 |
| P2-8 | `default-profile.txt` 미정규화 | `getDefaultProfile()` 에서 `.trim()` 후 빈 값이면 `'default'` 폴백 | `fixes.test.ts` › `trims a stray newline in default-profile.txt` 통과 |
| P2-9 | 문서 사실관계(미래 날짜·테스트 수·버전) | `docs/WORK_REPORT.md` — 테스트 수를 **실측값(117)** 으로 정정, 최초 작성일/최종 갱신일 분리 표기. **"미래 날짜" 지적은 재현되지 않음** — 시스템 시계(2026-10-28) 기준 `2026-08-03` 은 과거이므로 오기 아님으로 판정, 표기만 명확화 | `grep` 로 본 문서 기재값 확인. `package.json version 0.1.0` 은 의도적 유지(v1.0은 문서상 등급 표기) |

---

## 4. P3 — 사소한 개선

| 지적사항 | 수정 내용 | 검증 |
|---|---|---|
| `detector.ts` 메서드마다 `await import('os')` | 파일 상단 정적 `import * as os / path / fs` 로 통일 | `detector.ts` 1-5행 read 확인 |
| `findExecutable()` PATH 동기 3중 루프 | `(PATH, PATHEXT, names)` 키 메모이즈 + `clearExecutableCache()` 제공. 환경이 바뀌면 키가 달라져 재탐색 | `tool-check.ts` read 확인, `status.test.ts` 7건 통과 |
| 위저드 모델 목록 하드코딩 | `src/core/models.ts` 로 분리(`OPENCLAW_MODELS`/`HERMES_MODELS`/`CLAUDE_CODE_MODELS`/`AIDER_MODELS`/`DEFAULT_MODELS`). `profile-manager.getAgentDefaultSettings()` 도 같은 상수 사용 → 위저드 기본값과 프로파일 기본값의 드리프트 제거 | `models.ts`·`wizard.ts`·`profile-manager.ts` read 확인 |
| `unchanged` 툴이 사용자에게 "아무것도 안 됨"으로 보임 | `SyncResult.unchanged` 추가 → CLI가 `Already up to date: <tools>` 별도 출력 | `fixes.test.ts` › `reports unchanged tools separately` 통과 |
| `agent-editor.ts` import 하단 위치 | import 6건을 파일 상단(12-18행)으로 이동 — 순환참조 위험·가독성 | `read src/core/agent-editor.ts` 1-14행에서 상단 배치 확인 |

---

## 5. 함께 처리한 부수 결함 / 위생

- **테스트가 저장소 루트를 오염시키던 문제**: `integration.test.ts` 의 Aider 케이스가
  `process.cwd()` 기준으로 `.aider.conf.yml` 을 리포지토리 루트에 생성하고 있었다 →
  `vi.spyOn(process, 'cwd')` 로 임시 디렉터리를 주입하고 `finally` 복원.
- **`.gitignore`**: 백업 산출물(`*.bak-YYYYMMDD-HHMMSS[-N]`)과 `.multicode-backups/` 를
  무시 목록에 추가 → 실제로 생성된 백업 파일이 `git status` 에 나타나지 않음을 확인.
- **`vitest.config.ts`**: E2E 스위트가 빌드된 CLI를 실행하므로 `testTimeout` 을 20초로 상향
  (기존 5초에서 1건 타임아웃 → 원인은 로직이 아니라 서브프로세스 기동 시간).
- **린트 위반 2건**(`error` state 미사용, `writeConfiguredTools` 미사용) 자체 발견·수정.

---

## 6. 미커버 / 남은 한계 (정직 고지)

- **`npm publish`·GitHub Actions 실행은 하지 않았다.** 로컬 `npm run verify` 만 검증했다.
- **`core/editors/*` 5개 파일 본문은 여전히 미열람**이다. 이번 수정은 `agent-editor.ts` 의
  팩토리 배선과 백업 호출에 한정되며, 각 편집기 내부 로직은 손대지 않았다.
- **`status-adapter.ts` 는 레지스트리(P2-1)로 완전 이관하지 않았다** — 툴별 상태 계산 메서드가
  각자 어댑터 인스턴스를 보유한다. 중복 제거는 Cursor 파서 공유(P2-5)까지만 수행했다.
- **모델 ID의 공식 문서 대조는 하지 않았다**(기존 후속 과업 항목, 외부 문서 확인 필요).
- **대화형 TTY 흐름(`init`/`configure` 프롬프트)은 자동 테스트하지 않았다** — 비TTY 경로와
  취소 분기만 코드/타입으로 검증했다.
- Ink 컴포넌트 렌더 스냅샷 테스트는 없다(대시보드는 타입·린트까지만 검증).
