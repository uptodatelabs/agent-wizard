# AgentWizard 구현 계획서

## 프로젝트 개요

```
프로젝트명: AgentWizard
목적: AI 코딩 어시스턴트 설정을 돕는 CLI 도구
대상: OpenClaw, Hermes, Claude Code, Cursor, Copilot, Aider 등 10+ 툴 지원
핵심 가치: 범용성, 자동 감지, 품질 큐레이션, 팀 협업
```

---

## 지원 대상 툴 목록 (최초 6개)

| 툴 | 설정 포맷 | 설정 위치 | 우선순위 |
|---|---|---|---|
| **OpenClaw** | JSON5 | `~/.openclaw/openclaw.json` | ⭐⭐⭐⭐⭐ |
| **Hermes** | JSON/YAML | `~/.hermes/config.json` | ⭐⭐⭐⭐⭐ |
| **Claude Code** | JSON | `.claude/settings.json` | ⭐⭐⭐⭐ |
| **Cursor** | Markdown + YAML | `.cursor/rules` | ⭐⭐⭐⭐ |
| **GitHub Copilot** | YAML | `.github/copilot.yml` | ⭐⭐⭐ |
| **Aider** | YAML | `.aider.conf.yml` | ⭐⭐⭐ |

---

## Phase 1: 프로젝트 초기 설정 (1-2주)

### 1.1 프로젝트 구조 생성

```
agent-wizard/
├── packages/
│   ├── core/              # 코어 엔진
│   ├── cli/               # CLI 인터페이스
│   ├── adapters/          # 툴별 어댑터
│   │   ├── openclaw/
│   │   ├── hermes/
│   │   ├── claude-code/
│   │   ├── cursor/
│   │   ├── copilot/
│   │   └── aider/
│   └── registry/          # 에이전트/스킬 레지스트리
├── templates/             # 설정 템플릿
├── schemas/               # JSON 스키마
└── docs/                  # 문서
```

### 1.2 기술 스택 확정

```json
{
  "runtime": "Node.js 22+",
  "language": "TypeScript 5.0+",
  "packageManager": "pnpm (workspace)",
  "cli": "Commander.js + Inquirer.js",
  "validation": "Zod",
  "testing": "Vitest",
  "linting": "ESLint + Prettier",
  "build": "tsup",
  "distribution": "npm + Docker"
}
```

### 1.3 필수 패키지 설치

- `commander` - CLI 프레임워크
- `inquirer` - 대화형 입력
- `zod` - 스키마 검증
- `chalk` - 터미널 색상
- `ora` - 로딩 애니메이션
- `fs-extra` - 파일 시스템 유틸리티
- `yaml` / `json5` - 설정 파일 파서

---

## Phase 2: 코어 엔진 개발 (3-4주)

### 2.1 프로젝트 감지 엔진

```typescript
// 감지 대상
interface ProjectDetector {
  detectProjectType(): ProjectType;      // web, mobile, cli, library
  detectFramework(): Framework[];        // react, vue, nextjs, etc.
  detectLanguage(): Language[];           // typescript, python, etc.
  detectPackageJson(): PackageInfo;      // 의존성 분석
  detectExistingConfigs(): ConfigMap;    // 기존 설정 파일 탐지
}
```

### 2.2 설정 포맷 변환기

```typescript
// 지원 포맷
type ConfigFormat = 'json' | 'json5' | 'yaml' | 'toml' | 'markdown';

interface FormatConverter {
  convert(config: AgentConfig, format: ConfigFormat): string;
  parse(content: string, format: ConfigFormat): AgentConfig;
  validate(content: string, format: ConfigFormat): ValidationResult;
}
```

### 2.3 공통 설정 스키마

```typescript
// 범용 설정 인터페이스
interface AgentConfig {
  project: ProjectMetadata;
  agents: Agent[];
  skills: Skill[];
  permissions: PermissionConfig;
  hooks: HookConfig;
  mcp: MCPServerConfig[];
}

interface Agent {
  id: string;
  name: string;
  role: 'reviewer' | 'coder' | 'debugger' | 'tester';
  model: string;
  instructions: string;
  tools: string[];
  guardrails: Guardrail[];
}
```

---

## Phase 3: 툴별 어댑터 개발 (4-6주)

### 3.1 OpenClaw 어댑터 (최우선)

```typescript
class OpenClawAdapter implements ToolAdapter {
  name = 'openclaw';
  configPath = '~/.openclaw/openclaw.json';
  format = 'json5';
  schema = openClawSchema;

  // OpenClaw 특수 기능
  features = {
    hotReload: true,           // 핫 리로드 지원
    envSubstitution: true,     // ${VAR_NAME} 치환
    gatewayIntegration: true,  // Gateway 연동
  };

  async detect(): Promise<boolean>;
  async read(): Promise<AgentConfig>;
  async write(config: AgentConfig): Promise<void>;
  async validate(): Promise<ValidationResult>;
  async hotReload(): Promise<void>;  // 핫 리로드 트리거
}
```

### 3.2 Hermes 어댑터 (최우선)

```typescript
class HermesAdapter implements ToolAdapter {
  name = 'hermes';
  configPath = '~/.hermes/config.json';
  format = 'json';
  schema = hermesSchema;

  // Hermes 특수 기능
  features = {
    multiModel: true,         // 멀티 모델 지원
    pluginSystem: true,       // 플러그인 시스템
    customAgents: true,       // 커스텀 에이전트
  };

  async detect(): Promise<boolean>;
  async read(): Promise<AgentConfig>;
  async write(config: AgentConfig): Promise<void>;
  async validate(): Promise<ValidationResult>;
  async installPlugin(plugin: Plugin): Promise<void>;
}
```

### 3.3 Claude Code 어댑터

```typescript
class ClaudeCodeAdapter implements ToolAdapter {
  name = 'claude-code';
  configPath = '.claude/settings.json';
  format = 'json';
  schema = claudeCodeSchema;

  // Claude Code 특수 기능
  features = {
    mcpServers: true,         // MCP 서버 지원
    managedSettings: true,    // 엔터프라이즈 설정
    multiScope: true,         // 다중 스코프 (User > Project > Local)
  };

  async detect(): Promise<boolean>;
  async read(): Promise<AgentConfig>;
  async write(config: AgentConfig): Promise<void>;
  async validate(): Promise<ValidationResult>;
  async configureMCPServer(server: MCPServer): Promise<void>;
}
```

### 3.4 Cursor 어댑터

```typescript
class CursorAdapter implements ToolAdapter {
  name = 'cursor';
  configPath = '.cursor/rules';
  format = 'markdown';
  schema = cursorSchema;

  // Cursor 특수 기능
  features = {
    ruleFiles: true,          // 규칙 파일 시스템
    yamlFrontmatter: true,    // YAML 프론트매터
    projectRules: true,       // 프로젝트별 규칙
  };

  async detect(): Promise<boolean>;
  async read(): Promise<AgentConfig>;
  async write(config: AgentConfig): Promise<void>;
  async validate(): Promise<ValidationResult>;
}
```

### 3.5 GitHub Copilot 어댑터

```typescript
class CopilotAdapter implements ToolAdapter {
  name = 'copilot';
  configPath = '.github/copilot.yml';
  format = 'yaml';
  schema = copilotSchema;

  async detect(): Promise<boolean>;
  async read(): Promise<AgentConfig>;
  async write(config: AgentConfig): Promise<void>;
  async validate(): Promise<ValidationResult>;
}
```

### 3.6 Aider 어댑터

```typescript
class AiderAdapter implements ToolAdapter {
  name = 'aider';
  configPath = '.aider.conf.yml';
  format = 'yaml';
  schema = aiderSchema;

  async detect(): Promise<boolean>;
  async read(): Promise<AgentConfig>;
  async write(config: AgentConfig): Promise<void>;
  async validate(): Promise<ValidationResult>;
}
```

---

## Phase 4: CLI 인터페이스 개발 (3-4주)

### 4.1 명령어 구조

```bash
# 기본 명령어
agent-wizard init                    # 새 프로젝트 초기 설정
agent-wizard detect                  # 현재 프로젝트 감지
agent-wizard configure               # 대화형 설정 위저드
agent-wizard validate                # 설정 검증
agent-wizard export --format json    # 설정 내보내기
agent-wizard import --file config.yml  # 설정 가져오기

# 툴별 명령어
agent-wizard add openclaw            # OpenClaw 설정 추가
agent-wizard add hermes              # Hermes 설정 추가
agent-wizard add claude-code         # Claude Code 설정 추가
agent-wizard add cursor              # Cursor 설정 추가
agent-wizard sync                    # 모든 툴 설정 동기화

# 레지스트리 명령어
agent-wizard search agents           # 에이전트 검색
agent-wizard install agent-name      # 에이전트 설치
agent-wizard list agents             # 설치된 에이전트 목록
```

### 4.2 대화형 위저드 흐름

```
1. 프로젝트 감지
   └── "React + TypeScript 프로젝트를 감지했습니다"

2. 툴 선택
   └── "어떤 AI 어시스턴트를 사용하시겠습니까?"
       ├── ☑ OpenClaw
       ├── ☑ Hermes
       ├── ☑ Claude Code
       ├── ☑ Cursor
       ├── ☐ GitHub Copilot
       └── ☐ Aider

3. 에이전트 선택
   └── "설치할 에이전트를 선택하세요"
       ├── ☑ 코드 리뷰어
       ├── ☑ 테스트 작성자
       └── ☐ 디버깅 헬퍼

4. 설정 커스터마이징
   └── "모델을 선택하세요"
       ├── ○ Claude 3.5 Sonnet
       ├── ○ Claude 3 Opus
       └── ○ Claude 3 Haiku

5. 설정 생성
   └── ".claude/settings.json 파일을 생성했습니다"
```

---

## Phase 5: 레지스트리 시스템 개발 (4-6주)

### 5.1 에이전트/스킬 구조

```typescript
interface RegistryItem {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: 'agent' | 'skill' | 'command';
  compatibility: string[];  // 지원 툴 목록
  quality: QualityScore;
  downloads: number;
  stars: number;
}

interface QualityScore {
  overall: number;      // 0-100
  documentation: number;
  tested: number;
  maintained: number;
  community: number;
}
```

### 5.2 로컬 레지스트리

```json
{
  "registry": {
    "agents": [
      {
        "id": "code-reviewer",
        "name": "코드 리뷰어",
        "description": "코드 품질 및 보안 검사",
        "model": "claude-3-5-sonnet",
        "instructions": "당신은 숙련된 코드 리뷰어입니다...",
        "tools": ["Read", "Bash", "Edit"],
        "quality": 85
      }
    ],
    "skills": [
      {
        "id": "tdd-methodology",
        "name": "TDD 방법론",
        "description": "테스트 주도 개발 패턴",
        "files": ["skills/tdd.md"],
        "quality": 90
      }
    ]
  }
}
```

---

## Phase 6: 프리미엄 기능 개발 (4-6주)

### 6.1 팀 협업 기능

```typescript
interface TeamFeatures {
  sharedConfig: SharedConfig;      // 공유 설정
  configVersioning: Versioning;    // 설정 버전 관리
  auditLog: AuditLog;              // 변경 이력
  roleBasedAccess: RBAC;           // 역할 기반 접근
}
```

### 6.2 분석 대시보드

```typescript
interface Analytics {
  usageStats: UsageStats;          // 사용 통계
  teamActivity: TeamActivity;     // 팀 활동
  configChanges: ConfigChanges;   // 설정 변경 이력
  recommendations: Recommendation[];  // 개선 제안
}
```

### 6.3 엔터프라이즈 기능

- SSO/SAML 연동
- 감사 로그
- 커스텀 모델 설정
- SLA 보장
- 전용 지원

---

## Phase 7: 테스트 및 배포 (2-3주)

### 7.1 테스트 전략

```bash
# 단위 테스트
vitest run --coverage

# 통합 테스트
vitest run --project integration

# E2E 테스트
vitest run --project e2e

# 스키마 검증 테스트
vitest run --project schemas
```

### 7.2 배포 파이프라인

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test
      - run: pnpm build

  publish:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: pnpm publish --access public
```

### 7.3 배포 채널

- **npm**: `npm install -g agent-wizard`
- **Docker**: `docker run agentwizard/cli`
- **GitHub Releases**: 바이너리 배포

---

## 개발 일정 요약

| Phase | 기간 | 산출물 |
|---|---|---|
| Phase 1 | 1-2주 | 프로젝트 구조, 기초 설정 |
| Phase 2 | 3-4주 | 코어 엔진, 감지기, 변환기 |
| Phase 3 | 4-6주 | 6개 툴 어댑터 (OpenClaw, Hermes, Claude Code, Cursor, Copilot, Aider) |
| Phase 4 | 3-4주 | CLI 인터페이스, 위저드 |
| Phase 5 | 4-6주 | 레지스트리 시스템 |
| Phase 6 | 4-6주 | 프리미엄 기능 |
| Phase 7 | 2-3주 | 테스트, 배포 |
| **총** | **21-31주** | **v1.0 릴리스** |

---

## 마일스톤

```
M1 (4주): 프로젝트 초기화 + 코어 엔진 프로토타입
M2 (10주): OpenClaw + Hermes 어댑터 완성 + CLI alpha
M3 (16주): 6개 툴 어댑터 완성 + CLI beta
M4 (22주): 레지스트리 시스템 + 프리미엄 기능
M5 (28주): v1.0 릴리스 + npm 배포
```

---

## 수익화 전략

### Phase 1: 오픈소스 + 스폰서십 (0-6개월)
- GitHub Sponsors (0% 수수료)
- Ko-fi (기부용)
- 목표: 1,000+ 스타, 커뮤니티 구축

### Phase 2: 프리미엄 릴리즈 (6-12개월)
- **Free**: 기본 설정 (제한된 툴 수)
- **Pro ($15/월)**: 모든 툴, 팀 기능, 우선 지원
- **Enterprise ($99/월/인원)**: SSO, 감사 로그, SLA

### Phase 3: 마켓플레이스 (12개월+)
- 설정 템플릿 판매 ($10-50)
- 커스텀 설정 서비스 ($100-500)
- 파트너 프로그램

---

## 수익 시뮬레이션

| 시기 | GitHub Sponsors | Pro 구독 | Enterprise | 총합 |
|---|---|---|---|---|
| Year 1 | $500-1,000/월 | $500-2,000/월 | - | $1,000-3,000/월 |
| Year 2 | $1,000-3,000/월 | $3,000-10,000/월 | $2,000-5,000/월 | $6,000-18,000/월 |
| Year 3 | $2,000-5,000/월 | $10,000-30,000/월 | $10,000-50,000/월 | $24,000-90,000/월 |

---

## 핵심 성공 요인

1. **범용성**: 모든 주요 AI 코딩 어시스턴트 지원
2. **스마트 감지**: 프로젝트 유형 자동 인식
3. **품질 시스템**: 에이전트/스킬 품질 점수
4. **팀 기능**: 공유 설정, 정책 집행
5. **커뮤니티**: 활발한 기여자 생태계 구축

---

## 다음 단계

1. 프로젝트 저장소 생성
2. pnpm 워크스페이스 설정
3. 코어 패키지 스캐폴딩
4. OpenClaw 어댑터 프로토타입 개발
