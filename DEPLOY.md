# Cloudflare Pages 운영

jundduck/paper 저장소의 GitHub Actions에서 Cloudflare Pages로만 배포합니다. 공개 주소는 https://jundduck-paper.pages.dev/ 입니다. 기존 개인 홈페이지 저장소는 수정하지 않습니다.

- main에 푸시하거나 Actions의 Publish Paper를 수동 실행하면 배포됩니다.
- 매시간 17분과 47분에 공식 출처를 수집하고 정적 페이지와 캘린더를 다시 만듭니다. 실행은 GitHub 상황에 따라 지연될 수 있습니다.
- 화면의 새로고침은 공개된 데이터를 다시 읽습니다. 즉시 수집은 Actions에서 실행합니다.
- 이전 확인값은 Actions 캐시로 유지합니다. 캐시가 사라지면 검증된 seed 자료로 시작합니다.
- 공개 저장소가 60일 동안 활동이 없으면 GitHub가 예약 실행을 중지할 수 있습니다. Actions에서 다시 활성화하세요. 사이트는 계속 열리며 3시간 이상 지난 데이터는 갱신 지연으로 표시합니다.
- paper 저장소의 GitHub Pages는 비활성화합니다. 워크플로에는 GitHub Pages 배포 단계가 없습니다.
- 로컬 서버: start.cmd. 정적 빌드: npm run build:static.

https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

## Cloudflare Pages

- 저장소: jundduck/paper. 프로젝트 이름: jundduck-paper. 공개 주소: https://jundduck-paper.pages.dev/
- 계정 이메일 인증 후 최초 생성: `npx --yes wrangler@4.147.0 pages project create jundduck-paper --production-branch main --force`.
- 공식 자료를 새로 수집: `npm run build:static`.
- 최초 배포: `npx --yes wrangler@4.147.0 pages deploy dist --project-name=jundduck-paper --branch=main`.
- `--force`는 최초 프로젝트 생성 시에만 사용합니다. 생성된 Pages 프로젝트의 배포에는 사용하지 않습니다.
- GitHub Repository Actions secret: `CLOUDFLARE_API_TOKEN` (해당 계정의 Cloudflare Pages Edit 권한).
- 계정 ID는 워크플로에 설정돼 있습니다. 다른 계정으로 이전할 때만 `CLOUDFLARE_ACCOUNT_ID` variable을 설정합니다.
- 선택 variable: `CLOUDFLARE_PROJECT_NAME` (기본 jundduck-paper).
- `CLOUDFLARE_API_TOKEN` secret이 없으면 Cloudflare 단계는 건너뜁니다. 토큰은 배포 단계에서만 사용합니다.
- 기존 Publish Paper 워크플로에서 생성한 동일한 dist를 Cloudflare에 배포합니다. push, 수동 실행, 정기 갱신 모두 적용됩니다.
- 토큰과 비밀번호를 저장소나 채팅에 기록하지 마세요.
- 최초 공개 배포 및 공개 사이트 브라우저 검사 57개 완료. GitHub 자동 배포는 CLOUDFLARE_API_TOKEN secret 설정 후 활성화됩니다.

https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
