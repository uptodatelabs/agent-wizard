# TUI 디자인 시스템 명세

`agent-wizard dashboard`의 시각·상호작용 규칙. 구현은 `src/tui/`에 있고, 이 문서는
**왜 그렇게 생겼는지**를 기록한다. 토큰을 바꾸려면 여기 근거부터 고친다.

---

## 1. 설계 원칙

| # | 원칙 | 구현 |
|---|---|---|
| 1 | **색은 선택적이다** | 모든 상태는 `글리프 + 텍스트 라벨 + 색` 3중 신호. 색만으로 의미를 전달하지 않는다 (`describeToolStatus`). |
| 2 | **색은 한 곳에서만 정의된다** | 원시 색상명은 `tui/theme.ts` 밖에 존재하지 않는다. 컴포넌트는 `theme.success` 같은 의미론적 톤을 쓴다. |
| 3 | **stdout은 Ink가 소유한다** | `console.*` 금지. 모든 메시지(오류 포함)는 상태 → 트리 렌더로 나간다 (`useToast`, `error` state). |
| 4 | **입력은 스코프된다** | 활성 뷰의 핸들러만 `isActive`. 편집기에서 `q`를 타이핑해도 화면이 닫히지 않는다. |
| 5 | **단축키는 한 테이블에서 나온다** | `tui/keymap.ts`가 푸터 힌트와 `?` 도움말의 유일한 출처. |

---

## 2. 디자인 토큰 (`src/tui/theme.ts`)

### 2.1 색상 팔레트

두 팔레트를 터미널 능력에 따라 선택한다 (`resolveColorLevel`).

| 톤 | 16색 폴백 | 트루컬러 | 용도 |
|---|---|---|---|
| `brand` | `cyan` | `#38bdf8` | 제품 정체성, 커서, 포커스 |
| `accent` | `magenta` | `#c084fc` | 보조 강조, 그룹 제목 |
| `success` | `green` | `#4ade80` | `active` 상태, 유효 설정 |
| `warning` | `yellow` | `#fbbf24` | `configured` 상태, 입력 프롬프트 |
| `danger` | `red` | `#f87171` | `error` 상태, 삭제 확인 |
| `muted` | `gray` | `#6b7280` | 라벨, 경로, 보조 정보 |
| `text` | `white` | `#e5e7eb` | 본문 |
| `border` | `gray` | `#374151` | 비활성 테두리 |
| `borderFocused` | `cyan` | `#38bdf8` | 포커스 링 |

**색상 결정 순서**
1. `NO_COLOR` 가 설정돼 있으면 → 레벨 0 (색 없음, [no-color.org](https://no-color.org))
2. `stdout`이 TTY가 아니면 → 레벨 0 (`dashboard | tee log` 가 깨지지 않도록)
3. `COLORTERM` 에 `truecolor`/`24bit` → 레벨 3 (트루컬러)
4. 그 외 → 레벨 1 (16색 이름)

### 2.2 글리프

| 상수 | 문자 | 용도 |
|---|---|---|
| `brand` | `🧙` | 제품 아이덴티티 |
| `pointer` | `❯` | 리스트 커서 |
| `dotOn` / `dotOff` | `●` / `○` | 활성 / 비활성 |
| `check` / `cross` | `✓` / `✗` | 성공 / 실패 |
| `sep` | `·` | 인라인 구분자 |
| `bullet` | `∙` | 목록 불릿 |

커서를 글리프로도 표시하는 이유: `NO_COLOR`·단색 터미널에서 색이 사라져도
**선택 위치가 보여야** 하기 때문.

### 2.3 스피너

`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` (브레일 10프레임, 90ms 간격 ≈ 11fps).
8~12fps 구간이 "부드럽다"고 인지되는 하한이며, 그 이상은 CPU만 먹는다.
`useSpinner(isActive)` 는 **비활성일 때 인터벌을 아예 걸지 않는다** —
유휴 대시보드가 초당 11회 리렌더할 이유가 없다.

### 2.4 간격

`spacing = { none: 0, xs: 1, sm: 2 }`. 패널 패딩은 항상 `xs`.

---

## 3. 컴포넌트

```
tui/
  theme.ts              토큰 · 팔레트 · 글리프 · 색 연산 · truncate
  keymap.ts             단축키 테이블 · 액션 카탈로그 · 푸터 힌트
  components/
    Panel.tsx           테두리 표면 (포커스 링)
    Header.tsx          아이덴티티 + 라이브 상태
    GradientText.tsx    트루컬러 가로 그라데이션
    ToolList.tsx        커서 있는 세로 리스트 (윈도잉)
    StatusBadge.tsx     ● Active 배지
    Spinner.tsx         브레일 스피너
    Skeleton.tsx        최초 로딩 자리표시자
    ToastBar.tsx        일시적 피드백
    HelpOverlay.tsx     ? 도움말
    ActionPalette.tsx   a 액션 팔레트 (타이핑 필터)
  hooks/
    useSpinner.ts       프레임 상태
    useListNavigation.ts 커서 이동 + clamp/wrap
    useTerminalSize.ts  크기 구독 + resize + windowRows
    useToast.ts         타임아웃 메시지
```

### 3.1 Panel — 포커스 링 3중 표현

```
╭─ ❯ Tools ─────────╮   ← focused: double border + pointer + brand
│                    │
╰────────────────────╯
```

포커스는 **테두리 굵기(double vs round) + 테두리 색 + 앞머리 포인터** 셋으로
표현한다. 색이 죽어도 굵기와 글리프가 남는다.

### 3.2 레이아웃 — 2-pane / 1-pane

`columns >= 96` 이면 좌우 2-pane (Tools 리스트 + 선택 도구 카드),
그 미만이면 세로 1-pane. 임계값 96은 카드 최소 가독폭 44 + 리스트 44 + gap에서
나온 값이다. 터미널 폭이 그보다 좁으면 카드가 눌려 줄바꿈이 깨지므로 접는다.

### 3.3 윈도잉 (`windowRows`)

리스트가 화면 높이를 넘으면 `↑ N more` / `↓ N more` 마커와 함께 커서 주변만
그린다. 도구 6개·에이전트 40개짜리 툴에서도 푸터가 화면 밖으로 밀리지 않는다.

### 3.4 Skeleton vs Spinner

- **최초 로딩** → `Skeleton`: 최종 레이아웃 높이를 미리 확보해, 데이터 도착 시
  프레임이 튀지 않게 한다.
- **재조회** → `Header` 우측 슬롯의 `Spinner`: 헤더 행 높이가 변하지 않는다.

---

## 4. 상호작용

### 4.1 전역

| 키 | 동작 |
|---|---|
| `Ctrl+C` | 즉시 종료 |
| `?` | 도움말 오버레이 토글 (내용은 `keymap.ts`에서 생성) |
| `a` | 액션 팔레트 |
| `r` | 새로고침 (사용자 요청 → 토스트로 결과 통보) |
| `q` | 뷰별 뒤로/종료 |

### 4.2 뷰별

| 뷰 | 키 | 동작 |
|---|---|---|
| tools | `↑` `↓` | 도구 이동 |
| tools | `Enter` | 에이전트 목록으로 |
| agents | `↑` `↓` | 에이전트 이동 |
| agents | `Enter` | 설정 편집기 |
| agents | `Esc` | 도구 목록으로 |
| editor | `↑` `↓` | 설정 키 이동 |
| editor | `e` / `a` / `d` | 값 편집 / 키 추가 / 키 삭제 |
| editor | `Esc` | 에이전트 목록으로 |

### 4.3 액션 팔레트

`a` 로 열고 **타이핑으로 필터**한다. 비활성 액션도 회색으로 남겨둔다 —
숨기면 "이 화면에서 뭐가 가능한가"가 예측 불가능해진다.

### 4.4 토스트

성공/실패는 상태로 렌더하고 4초 뒤 자동 소멸. `seq` 카운터로 **동일 메시지
반복도 다시 애니메이션**된다 (`Refreshing…` 두 번 눌러도 반응이 보이도록).

---

## 5. 접근성 체크리스트

새 컴포넌트를 추가할 때 확인한다.

- [ ] 원시 색상명(`'cyan'`, `'red'` …)을 쓰지 않았는가 → `theme.*`
- [ ] 색 없이도 상태를 구분할 수 있는가 → 글리프 또는 텍스트 라벨
- [ ] `NO_COLOR=1` 에서 레이아웃이 무너지지 않는가
- [ ] 폭이 80칼럼일 때 줄바꿈으로 열 정렬이 깨지지 않는가 → `truncate`
- [ ] 리스트가 길어져도 푸터가 화면 안에 남는가 → `windowRows`
- [ ] `console.*` 를 호출하지 않았는가 → 상태로 렌더
- [ ] 새 단축키를 `keymap.ts`에 등록했는가 (푸터·도움말 자동 반영)

---

## 6. 테스트 전략

`src/__tests__/tui.test.ts` 는 **순수 계층**을 검증한다 (42 테스트).

| 대상 | 검증 내용 |
|---|---|
| `resolveColorLevel` | `NO_COLOR` 우선, 비TTY→0, `COLORTERM` 감지 |
| `createTheme` | 세 레벨 모두 9개 톤이 비어있지 않은 문자열 |
| `describeToolStatus` | 모든 상태 → 톤·아이콘·라벨, 미지 상태는 `Unknown` |
| `theme[tone]` | 기술자 톤이 팔레트에 실재 (undefined 색 렌더 방지) |
| `parseHex`/`mixHex`/`gradientStops` | 블렌딩·클램프·코드포인트 분할(이모지 보존) |
| `truncate` | 열 예산 클립, 0/1 폭 퇴화, 와이드 문자 |
| `moveIndex` | clamp·wrap·빈 리스트·NaN 커서 |
| `windowRows` | 커서 추적, 범위 초과, 용량 0 |
| `readTerminalSize` | 비TTY 폴백 80×24, 비양수 무시 |
| `keymap`/`footerHints` | 뷰별 바인딩 존재, 폭 예산 초과 없음 |
| `buildActions` | 미지원 도구에서 비활성, 편집기 탈출 경로 보장 |

**의도적 미커버**: Ink 컴포넌트 렌더 스냅샷(`ink-testing-library` 필요),
실제 TTY 프롬프트 흐름. 시각 회귀는 스냅샷보다 수동 확인이 신뢰도가 높다고
판단했다 — 스냅샷은 무관한 리팩터링에도 깨져 신호를 잃는다.

---

## 7. 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-28 | 디자인 토큰·프리미티브·훅 체계 신설. 카드 그리드 → 2-pane 리스트 전환, `?` 도움말·`a` 팔레트·토스트·스켈레톤·윈도잉 도입, 대시보드·에디터의 하드코딩 색상 전량 토큰화 |
