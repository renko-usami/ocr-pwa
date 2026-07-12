# OCR PWA · OpenRouter

Android에서 화면을 캡처한 뒤 **공유 메뉴**로 이 PWA에 보내면, OpenRouter 비전 모델이 OCR을 수행하고 결과를 **클립보드에 자동 복사**합니다.

## 기능

- **Web Share Target** 지원: Android 공유 시트에서 이미지를 이 앱으로 직접 전송
- **OpenRouter 비전 모델** 호출: `chat/completions` API에 이미지(base64) + 텍스트 프롬프트 전송
- **클립보드 자동 복사**: OCR 완료 후 결과를 클립보드에 복사 (옵션)
- **PWA**: 오프라인 앱 셸 캐싱, 홈 화면 설치 지원
- 설정(API Key, 모델, 자동복사)은 `localStorage`에 저장

## 파일 구성

```
and-ocr/
├── index.html          # UI
├── styles.css          # 다크 테마 스타일
├── app.js              # 메인 로직 (OCR, 클립보드, 공유 파일 수신)
├── service-worker.js   # 캐싱 + Web Share Target POST 처리
├── manifest.json       # PWA 매니페스트 (share_target 포함)
├── generate-icons.js   # PNG 아이콘 생성 스크립트
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-512-maskable.png
└── README.md
```

## 로컬에서 실행하기

PWA(서비스워커, Web Share Target)는 **HTTPS** 또는 **localhost**에서만 동작합니다.

### 방법 1: Python

```bash
python -m http.server 8080
```

### 방법 2: Node (npx)

```bash
npx http-server -p 8080
```

브라우저에서 `http://localhost:8080/` 을 엽니다.

## Android에서 사용하기

1. **OpenRouter API Key 발급**
   - https://openrouter.ai/ 에서 가입 후 키 생성 (`sk-or-v1-...`)

2. **PWA 설치**
   - Android Chrome에서 `http://localhost:8080/` (또는 배포 URL) 접속
   - 메뉴 → "홈 화면에 추가" 또는 앱 내 **홈 화면에 설치** 버튼
   - ⚠️ Web Share Target은 **설치된 PWA**에서만 동작합니다.

3. **설정 입력**
   - 앱 실행 후 OpenRouter API Key와 비전 모델 입력
   - 기본 모델: `google/gemma-3-27b-it`
   - 다른 비전 모델 예시:
     - `openai/gpt-4o-mini`
     - `google/gemini-flash-1.5`
     - `meta-llama/llama-3.2-11b-vision-instruct`
     - `qwen/qwen-2-vl-72b-instruct`

4. **화면 캡처 후 공유**
   - Android에서 전원 + 볼륨 down 으로 스크린샷 캡처
   - 갤러리/공유 시트에서 **OCR** 앱 선택
   - 이미지가 앱에 전달되면 **OCR 실행** 버튼 탭
   - 결과가 자동으로 클립보드에 복사됨

## 작동 원리

```
Android 공유 시트
   │  POST multipart/form-data (image)
   ▼
Service Worker (fetch 이벤트)
   │  formData → IndexedDB 저장
   │  Response.redirect("./index.html", 303)
   ▼
index.html 로드
   │  IndexedDB에서 파일 꺼내기
   │  미리보기 표시
   ▼
"OCR 실행" 버튼
   │  이미지 → base64
   │  POST https://openrouter.ai/api/v1/chat/completions
   │  { model, messages:[{ content:[{type:text}, {type:image_url}] }] }
   ▼
응답 텍스트 추출
   │  navigator.clipboard.writeText(text)
   ▼
클립보드에 복사 완료
```

## 아이콘 재생성

```bash
node generate-icons.js
```

Node.js 내장 모듈(`fs`, `zlib`)만 사용하므로 추가 패키지 설치 불필요합니다.

## 보안 참고

- API Key는 브라우저 `localStorage`에만 저장되며 서버로 전송되지 않습니다.
- OpenRouter API 호출은 브라우저에서 직접 이루어집니다.
- 프로덕션 배포 시 **HTTPS**가 필요합니다 (서비스워커 + 클립보드 API).

## 배포

GitHub Pages, Netlify, Vercel, Cloudflare Pages 등 정적 호스팅에 업로드하면 됩니다.

```bash
# 예: 이 디렉토리를 그대로 정적 호스팅에 업로드
```
