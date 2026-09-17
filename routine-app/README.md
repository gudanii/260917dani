# 매일 루틴 (Routine App)

요일과 하루 목표 횟수를 정해두고, 매일 완료 여부를 체크하는 간단한 웹앱입니다.

## ⚠️ GitHub에서 파일을 클릭해서 열면 안 됩니다

GitHub 저장소 페이지에서 `index.html`을 클릭하면 앱이 실행되는 게 아니라 **코드 텍스트만 보여줍니다** (GitHub은 HTML을 렌더링하지 않고 그대로 표시함). 실제로 앱을 보려면 아래 방법 중 하나를 사용하세요.

## 로컬에서 열기

가장 간단한 방법: 저장소를 내려받은 뒤 `index.html` 파일을 더블클릭해서 바로 브라우저로 엽니다.

```bash
git clone https://github.com/gudanii/260917dani
cd 260917dani/routine-app
open index.html      # macOS
xdg-open index.html  # Linux
# Windows는 탐색기에서 index.html 더블클릭
```

이 방식으로도 루틴 추가/체크/삭제는 정상 동작합니다. 다만 `file://`로 열면 브라우저 정책상 Gemini API로 보내는 세분화 요청이 막힐 수 있으니, AI 세분화 기능까지 테스트하려면 로컬 서버로 띄우는 걸 권장합니다.

```bash
cd 260917dani/routine-app
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

## Netlify 배포

저장소 루트에 있는 `netlify.toml`이 배포 설정(퍼블리시 폴더 `routine-app`, 빌드 명령 없음)을 자동으로 처리합니다.

**Git 연동 배포 (권장)**
1. [app.netlify.com](https://app.netlify.com) 로그인 → `Add new site` → `Import an existing project`
2. GitHub에서 이 저장소(`gudanii/260917dani`) 선택
3. Base directory / Build command는 비워두고, Publish directory는 자동으로 `routine-app`이 채워집니다 (netlify.toml 덕분). 그대로 `Deploy` 클릭
4. 배포가 끝나면 `https://<사이트이름>.netlify.app` 주소로 바로 접속해서 확인

**드래그 앤 드롭 배포 (Git 연동 없이 빠르게)**
1. `routine-app` 폴더만 압축하거나, 폴더 자체를 준비
2. Netlify 대시보드의 `Deploys` 탭에서 `routine-app` 폴더를 화면에 끌어다 놓기
3. 즉시 URL이 발급되고 바로 접속 가능

배포 후에는 HTTPS로 서비스되므로 Gemini API 세분화 기능도 로컬 `file://`보다 안정적으로 동작합니다.

## 기능

- **루틴 추가**: 이름, 적용할 요일(월~일), 하루 목표 횟수를 설정
- **요일 체크**: 루틴마다 요일을 여러 개 선택 가능 (예: 월/수/금만 운동)
- **횟수 체크**: 하루에 여러 번 해야 하는 루틴은 목표 횟수만큼 동그라미로 체크
- **AI 세분화 (Gemini)**: 루틴 카드의 `✨ 세분화` 버튼으로 하위 단계를 만들고, 요일 칸의 배지(`n/m`)를 눌러 각 단계를 개별 체크
- **주간 보기**: 이전/다음 주 이동, 오늘 날짜 강조
- **삭제**: 루틴별 삭제 가능
- 모든 데이터는 브라우저 `localStorage`에 저장됩니다 (서버 없음, 기기별로 별도 저장).

## AI 세분화 (Gemini) 설정

1. 상단 `⚙️ AI 설정 (Gemini API 키)`를 펼쳐서 [Google AI Studio](https://aistudio.google.com/apikey)에서 발급받은 API 키를 입력하고 저장합니다.
   모델명은 기본값 `gemini-3.5-flash-lite`이며 필요시 다른 모델 ID로 바꿀 수 있습니다.
2. 각 루틴 카드의 `✨ 세분화` 버튼을 누르면 편집창이 열립니다. `✨ Gemini로 만들기`를 누르면 루틴 이름을 바탕으로 하위 단계 3~6개를 생성해 텍스트 영역에 채워줍니다. 직접 줄 단위로 수정한 뒤 저장해도 됩니다.
3. 저장하면 해당 루틴은 요일 칸에 단순 횟수 대신 `완료/전체` 배지가 표시됩니다. 배지를 누르면 하위 단계 체크리스트가 펼쳐지고, 각 단계를 개별로 체크할 수 있습니다.
4. `세분화 해제`를 누르면 다시 기존의 단순 횟수 체크 모드로 돌아갑니다.

**보안 참고**: API 키는 이 브라우저의 `localStorage`에만 저장되고, 세분화를 실행할 때 브라우저에서 Google Gemini API로 직접 전송됩니다(별도 서버 없음). 공용/공유 기기에서는 사용 후 설정 패널에서 키를 지워주세요.

## 파일 구성

- `index.html` — 마크업 (AI 설정 패널, 단계 편집 다이얼로그 포함)
- `style.css` — 스타일 (라이트/다크 모드 지원)
- `app.js` — 상태 관리, 렌더링, Gemini API 연동 로직 (외부 의존성 없음)
