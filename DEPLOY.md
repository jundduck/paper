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
