# GitHub Pages 운영

별도 paper 저장소의 프로젝트 사이트로 배포합니다. 기존 홈페이지 저장소는 수정하지 않습니다.

- main에 푸시하거나 Actions의 Publish Paper를 수동 실행하면 배포됩니다.
- 매시간 17분과 47분에 공식 출처를 수집하고 정적 페이지와 캘린더를 다시 만듭니다. 실행은 GitHub 상황에 따라 지연될 수 있습니다.
- 화면의 새로고침은 공개된 데이터를 다시 읽습니다. 즉시 수집은 Actions에서 실행합니다.
- 이전 확인값은 Actions 캐시로 유지합니다. 캐시가 사라지면 검증된 seed 자료로 시작합니다.
- 공개 저장소가 60일 동안 활동이 없으면 GitHub가 예약 실행을 중지할 수 있습니다. Actions에서 다시 활성화하세요. 사이트는 계속 열리며 3시간 이상 지난 데이터는 갱신 지연으로 표시합니다.
- 최초 설정: Settings → Pages → Source → GitHub Actions.
- 로컬 서버: start.cmd. 정적 빌드: npm run build:static.

https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

## Cloudflare Pages (연결 준비)

- 저장소: jundduck/paper. 프로젝트 예정 이름: papertrail-robotics.
- 계정 이메일 인증 후 최초 생성: `npx --yes wrangler@4.147.0 pages project create papertrail-robotics --production-branch main --force`.
- 공식 자료를 새로 수집: `npm run build:static`.
- 최초 배포: `npx --yes wrangler@4.147.0 pages deploy dist --project-name=papertrail-robotics --branch=main --force`.
- `--force`는 Wrangler의 Workers 자동 전환 대신 Pages에 배포하기 위한 옵션입니다.
- GitHub Repository Actions secret: `CLOUDFLARE_API_TOKEN` (해당 계정의 Cloudflare Pages Edit 권한).
- GitHub Repository Actions variable: `CLOUDFLARE_ACCOUNT_ID`.
- 선택 variable: `CLOUDFLARE_PROJECT_NAME` (기본 papertrail-robotics).
- 토큰을 먼저 저장하고 account ID variable을 마지막에 설정합니다. account ID가 없으면 Cloudflare 단계는 건너뜁니다.
- 기존 Publish Paper 워크플로에서 생성한 동일한 dist를 Cloudflare에 배포합니다. push, 수동 실행, 정기 갱신 모두 적용됩니다.
- 토큰과 비밀번호를 저장소나 채팅에 기록하지 마세요.
- 현재 상태: 로그인 완료, 이메일 인증 대기. Cloudflare 공개 주소 및 GitHub 자동 배포 연결은 아직 완료되지 않았습니다.

https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
