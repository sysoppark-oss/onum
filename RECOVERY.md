# 온음 복구 안내

노트북이나 휴대폰을 잃어도 온음을 계속 만들고 스토어에 업데이트할 수 있게 적어 둔 문서예요.
**이 문서와 저장소에는 비밀번호·열쇠 값을 절대 적지 않아요.** 값은 아래 「보관 장소」에만 있어요.

## 1. 무엇이 어디에 있나

| 이름 | 하는 일 | 원본이 있는 곳 | 잃으면 |
|---|---|---|---|
| 프로그램 원본 | 앱 전체 | GitHub `sysoppark-oss/onum`(공개) | 저장소가 남아 있는 한 잃지 않음 |
| `onum-release.keystore` (정식 서명 열쇠 파일) | 스토어에 올리는 정식 판에 서명 | 암호 건 압축으로 USB 두 개(서로 다른 장소, 아래 4) | **스토어(원스토어·갤럭시 스토어)에 올린 온음을 다시는 업데이트할 수 없음** |
| `ONUM_KEYSTORE_B64` | 열쇠 파일을 글자(base64)로 바꾼 것 | GitHub Secrets | 정식 판 만들기가 서명 없이 끝남. 열쇠 파일로 다시 만들어 넣으면 됨 |
| `ONUM_KEYSTORE_PASSWORD` | 열쇠 파일 비밀번호 | GitHub Secrets · 비밀번호 관리자 | 같음. 비밀번호 관리자에서 꺼내 다시 넣음 |
| `ONUM_KEY_ALIAS` | 열쇠 이름 | GitHub Secrets · 비밀번호 관리자 | 같음 |
| `ONUM_KEY_PASSWORD` | 열쇠 비밀번호 | GitHub Secrets · 비밀번호 관리자 | 같음 |
| `ONUM_TEST_KEYSTORE_B64` · `ONUM_TEST_KEYSTORE_PASSWORD` · `ONUM_TEST_KEY_ALIAS` · `ONUM_TEST_KEY_PASSWORD` | 시험판 서명(비공개) | GitHub Secrets. 원본 `onum-test-private.p12`와 비밀번호는 PC `D:\work\onum-KEY`(동기화하지 않는 폴더) | 시험판 만들기가 멈춤. 새 열쇠를 만들어 넣고, 시험판 쓰는 사람은 한 번 지우고 다시 깔면 됨 |

- GitHub Secrets는 **넣을 수만 있고 다시 꺼내 볼 수 없어요.** 그래서 열쇠 파일(USB)과 비밀번호(비밀번호 관리자)를 따로 지켜야 해요. 처음 받은 보관용 메모(`온음_정식서명열쇠_보관용.txt`)의 값은 비밀번호 관리자로 옮긴 뒤 지워요.
- 정식 서명 열쇠의 지문(공개 정보): SHA-256 `3C:21:D9:69 … EA:38`. 다시 넣은 뒤 아래 4의 지문 확인으로 맞는 열쇠인지 봐요.
- 시험판 열쇠는 **2026-11-25부터 비공개**예요(지문 SHA-256 `dd97eb03…`). 그 전에 저장소에 있던 공개 시험 열쇠(`onum-test.keystore`, 지문 `66c66738…`)는 더 쓰지 않아요. 기록에 남아 있어도 그 열쇠로 서명한 앱은 지금 시험판으로 업데이트되지 않아요.

### 시험판과 스토어 판은 다른 앱이에요

| | 패키지 이름 | 앱 이름 | 서명 |
|---|---|---|---|
| 스토어 판 | `org.onum.player` (절대 바꾸지 않음) | 온음 | 정식 열쇠(지문 `3c21d969…`) |
| 시험판 | `org.onum.player.test` | 온음 시험판(아이콘에 「시험」 띠) | 비공개 시험 열쇠(지문 `dd97eb03…`) |

- 시험판은 **GitHub 공식 주소(github.com/sysoppark-oss/onum의 시험판 페이지)에서 받은 것만** 설치해요.
- **2026-11-25 전에 깐 「온음 시험판」**(공개 열쇠로 서명)은 새 시험판으로 업데이트되지 않아요. 지우고 다시 깔아요.
- **옛 시험판**(2026-11-24 전, `org.onum.player`에 시험 열쇠로 서명)을 깐 사람은 그 앱을 지우고 새 시험판이나 스토어 판을 깔아요. 옛 앱의 목록·설정은 넘어오지 않아요.
- 시험판 이름 꼬리는 `android/app/build.gradle`의 debug `applicationIdSuffix ".test"`, 이름·아이콘은 `android/app/src/debug/res`에 있어요(`python3 tools/app-icon.py`로 다시 만듦).

## 2. 새 PC 없이도 되는 것 (GitHub에서)

온음은 GitHub Actions가 대신 만들어 줘서 **PC가 없어도** 아래가 돼요.

- **시험판:** 저장소에 올리면 「안드로이드 시험판 만들기」가 저절로 돌고, Releases에 APK가 올라가요.
- **PC 웹 앱:** 「PC용 웹 앱 올리기」가 저절로 돌아요.
- **스토어 정식 판:** Actions › 「스토어 정식 판 만들기」 › Run workflow
  - 판 이름(예: 2.0.1), 스토어(onestore / galaxy)를 고르고 실행
  - 끝나면 그 실행 기록 아래 **Artifacts**에서 APK를 받음(공개 페이지에는 올라가지 않음)
  - 판 번호(버전 코드)는 실행할 때마다 저절로 올라가요

## 3. 새 PC에서 받아서 직접 만들기 (필요할 때만)

1. 설치할 프로그램: Git, Node.js 22, JDK 21(Temurin), Android Studio(Android SDK 포함)
2. 받기
   ```
   git clone https://github.com/sysoppark-oss/onum.git
   cd onum
   npm ci
   ```
3. 화면 확인(브라우저): `npm run dev` → 주소창에 나온 주소 열기
4. 시험판 APK 만들기
   ```
   npm run build
   npx cap sync android
   cd android
   ./gradlew assembleDebug        (Windows는 gradlew.bat assembleDebug)
   ```
   만든 파일: `android/app/build/outputs/apk/debug/app-debug.apk`
5. 정식 판을 PC에서 만들 때만: 아래 환경 변수 네 개를 **그 창에서만** 넣고 `./gradlew assembleRelease`
   - `ONUM_KEYSTORE` = 열쇠 파일이 있는 경로
   - `ONUM_KEYSTORE_PASSWORD`, `ONUM_KEY_ALIAS`, `ONUM_KEY_PASSWORD` = 비밀번호 관리자의 값
   - 그리고 `VITE_STORE=onestore`(또는 galaxy)로 `npm run build`를 먼저 다시 해야 스토어 판이 돼요
   - 보통은 PC보다 2번의 「스토어 정식 판 만들기」를 쓰는 게 안전해요

## 4. 열쇠와 Secrets 다시 넣기 (값은 화면·채팅에 붙여 넣지 말 것)

1. USB에서 압축을 풀어 `onum-release.keystore`를 꺼내고(압축 암호는 비밀번호 관리자에서), 비밀번호 관리자에서 세 값을 확인해요.
2. 열쇠 파일을 글자(base64)로 바꿔 **클립보드로만** 복사해요.
   - Windows PowerShell:
     `[Convert]::ToBase64String([IO.File]::ReadAllBytes("onum-release.keystore")) | Set-Clipboard`
   - Mac: `base64 -i onum-release.keystore | pbcopy`
3. GitHub 저장소 › Settings › Secrets and variables › Actions › New repository secret
   - `ONUM_KEYSTORE_B64` ← 클립보드 붙여 넣기
   - `ONUM_KEYSTORE_PASSWORD`, `ONUM_KEY_ALIAS`, `ONUM_KEY_PASSWORD` ← 비밀번호 관리자의 값
   - 이름은 위와 글자 하나까지 똑같아야 해요
4. **지문 확인 (꼭 하기):** Actions › 「스토어 정식 판 만들기」를 한 번 돌린 뒤, 그 실행 기록에서 서명을 확인하는 단계를 펼쳐요.
   - `Signer #1 certificate SHA-256 digest:` 뒤의 값이 **`3c21d969`로 시작**해야 해요(콜론을 넣어 쓰면 `3C:21:D9:69…`). 끝은 `…ea38`이에요.
   - 다른 값으로 시작하면 **다른 열쇠**예요. 그 판은 스토어에 올리지 말고, 열쇠 파일과 Secrets를 다시 확인해요.
   - 같은 기록에 「디버깅 꺼짐」 확인도 지나갔는지 봐요.
5. 클립보드를 비우고(다른 글을 한 번 복사), 꺼낸 파일은 다시 보관 장소에만 둬요.

### 보관 방식 (정한 것)

- **비밀번호 4개**(`ONUM_KEYSTORE_PASSWORD`, `ONUM_KEY_ALIAS`, `ONUM_KEY_PASSWORD`, 그리고 아래 압축 암호)는 **비밀번호 관리자**에만 둬요.
- **열쇠 파일**(`onum-release.keystore`)은 **암호를 건 압축 파일**로 만들어 **USB 두 개**에 담고, 두 USB를 **서로 다른 장소**에 둬요.
- **압축 암호는 비밀번호 관리자에만** 적어요. USB나 같은 장소에 적어 두지 않아요.
- 이메일·카톡·메모 앱·클라우드 폴더·공개 저장소에는 두지 않아요.
- 반년에 한 번쯤 USB 두 개를 꽂아 압축이 풀리는지 확인해요.

## 5. 정식 서명 열쇠를 잃었을 때

- 다시 만들 수 없어요. 새 열쇠로 서명한 앱은 스토어에서 **업데이트로 받아들여지지 않아요.**
- 그때는 스토어에 새 상품(새 패키지 이름)으로 다시 올려야 하고, 이미 설치한 분들은 새 앱을 따로 받아야 해요.
- 그래서 열쇠 파일은 **서로 다른 두 곳**(USB 두 개)에, 비밀번호는 비밀번호 관리자에 보관해요.

## 6. 저장소에 일부러 넣지 않은 것

- 정식 서명 열쇠 파일과 비밀번호(위 4)
- 스토어 계정(원스토어·갤럭시 스토어) 로그인 정보: 각 스토어 사이트에서 본인이 직접 로그인
- 만든 결과물(`dist/`, `android/app/build/`, `node_modules/`): 위 3번으로 언제든 다시 만들 수 있어요
