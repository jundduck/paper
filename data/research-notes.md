# 초기 데이터 조사 기록

확인일: 2026-09-17 KST. `updatedAt`에는 같은 시점의 UTC를 저장했다. 스크린샷의 월말 날짜는 초기 데이터에 사용하지 않았다.

`status: pending`은 논문 제출 마감이 미확정이라는 의미다. 학회 개최 기간은 별도로 발표되었을 수 있다. `verifiedAt`은 수동 조사 시 원문을 확인한 시각이며, 실제 제출 마감이 발표되었다는 뜻은 아니다. `deadlinePrecision: date`는 날짜만 발표되어 시각을 만들지 않았다는 뜻이다.

| 항목 | 확인한 공식 원문 | 반영한 내용 |
| --- | --- | --- |
| NeurIPS 2027 | [Future Meetings](https://neurips.cc/Conferences/FutureMeetings) | 유럽 개최. 정확한 날짜·제출 마감은 확인되지 않음. |
| ICML 2027 | [Future Meetings](https://icml.cc/Conferences/FutureMeetings) | 남미 개최. 정확한 날짜·제출 마감은 확인되지 않음. |
| ICCV 2027 | [CVF 개최 공지](https://www.thecvf.com/?p=137) | 홍콩, 2027-10-02~08. 제출 마감은 확인되지 않음. |
| ECCV 2028 | [ECCV 공식 홈페이지](https://eccv.ecva.net/) | 현재 2026년 회차와 짝수 해 개최 원칙을 안내. 2028년 날짜 미확인. |
| CVPR 2027 | [Dates](https://cvpr.thecvf.com/Conferences/2027/Dates), [CFP](https://cvpr.thecvf.com/Conferences/2027/CallForPapers) | 등록 2026-11-10, 본문 11-16, AoE. 시애틀 2027-06-20~25. |
| ICLR 2027 | [CFP](https://www.iclr.cc/Conferences/2027/CallForPapers), [홈페이지](https://www.iclr.cc/) | 초록 2026-09-18, 본문 09-25, 23:59 AoE. 캘리포니아 2027-04-26~30. 백엔드 담당자가 공식 HTML의 UTC 타임스탬프에서 59초까지 확인함. |
| CoRL 2027 | [공식 홈페이지](https://www.corl.org/) | 현재 2026년 회차. 2027년 일정 미확인. |
| AAAI 2027 | [공식 Timetable](https://aaai.org/conference/aaai/aaai-27/) | 메인 트랙 초록 2026-07-21, 본문 07-28, 23:59 UTC−12. 몬트리올 2027-02-16~23. |
| ICRA 2027 | [최신 CFP](https://2027.ieee-icra.org/contribute/call-for-icra-2027-papers-now-accepting-submissions/), [홈페이지](https://2027.ieee-icra.org/) | 2026-09-16 23:59 PST로 하루 연장. 서울 COEX 2027-05-24~28. |
| IROS 2027 | [IEEE RAS 행사](https://www.ieee-ras.org/event/2027-ieee-rsj-international-conference-on-intelligent-robots-and-systems-iros-70525/), [행사 홈페이지](https://2027.ieee-iros.org/) | 제출 마감 2027-03-01, 시각·시간대 미표기. 피렌체 2027-09-26~10-01. |
| RSS 2027 | [공식 타임라인](https://roboticsconference.org/) | 아테네 2027-07-06~11. 제출 마감은 TBA. |
| RA-L | [저자 안내](https://www.ieee-ras.org/publications/ra-l/ra-l-information-for-authors/) | 일반 투고 저널. 학회 발표 연계 마감과 일반 투고를 구분. |
| TRO | [저자 안내](https://www.ieee-ras.org/publications/t-ro/t-ro-information-for-authors/) | 일반 투고 저널. 특집호와 학회 발표 연계 별도. |
| Science Robotics | [저자 안내](https://www.science.org/content/page/science-robotics-information-authors), [AAAS 투고 안내](https://promo.aaas.org/ScienceRobotics/callforpapers/) | 일반 투고 저널. 현재 저자 안내 페이지 직접 접근 실패로 `verifiedAt: null`. |
| TPAMI | [저널](https://www.computer.org/csdl/journal/tp), [IEEE Computer Society 저자 안내](https://www.computer.org/publications/author-resources) | 일반 투고 저널. TPAMI 전용 저자 안내 직접 접근 실패로 `verifiedAt: null`. |
| IV 2027 | [회차 안내](https://ieee-iv.org/2027/intelligent-vehicles-symposium-2027-perth-australia/), [공식 PDF](https://ieee-iv.org/2027/wp-content/uploads/sites/6/2024/11/IV2027-cover.pdf), [2026 CFP](https://ieee-iv.org/2026/contributions/call-for-papers/) | 퍼스 2027-06-15~18. 원문 재접속 후 현재 회차의 제출 마감 2026-11-15를 확인하여 날짜만 반영. |
| ITSC 2027 | [공식 시리즈 페이지](https://ieee-itsc.org/) | 2027년 9월 보스턴. 정확한 개최일과 회차별 CFP 미확인. |

## 자동 반영 시 주의할 실제 사례

- ICRA의 7월 16일 게시물 `/announcements/call-for-technical-papers/`에는 여전히 9월 15일이 남아 있다. 현재 `contribute` 아래 CFP와 홈페이지의 9월 16일 연장 공지가 더 최신이다. 이전 공지에 맞춰 마감을 되돌리면 안 된다.
- ICRA 공식 표기는 `PST`이다. 9월이라는 이유로 임의로 `PDT`로 바꾸지 않았다. 원문 표기 기준 UTC−8로 보존했다.
- CVF 전체 개최 공지의 CVPR 종료일은 6월 24일이지만, 2027년 CVPR 공식 홈페이지와 Dates 페이지는 6월 25일로 일치한다. 개별 회차 공식 페이지를 우선했다.
- CVPR의 첫 마감은 초록이라는 명칭 대신 논문 등록 마감이다. 현재 공통 필드 `abstractDeadline`에 저장하되 UI에서 설명을 함께 보여줘야 한다.
- IV는 초기 검색에서 현재 회차와 과거 CFP의 차기 회차 안내가 충돌하여 보류했다. 2026-09-17 공식 2027 원문에 직접 재접속하여 Paper Submission Deadline November 15, 2026을 확인했다. 현재 회차 공지를 우선해 초기 데이터에 반영했으며, 시간대나 시각은 추정하지 않았다.
- ITSC 운영 매뉴얼의 일반 정책을 해당 회차의 개별 CFP로 간주하지 않았다. 월 단위 개최 안내를 임의의 월초~월말 행사 기간으로 확장하지 않았다.
- RA-L, TRO, Science Robotics, TPAMI는 일반 투고를 추적하는 저널 항목이다. 특집호나 학회 발표 신청 기한을 저널 전체 마감으로 추출하면 안 된다.
- 본문에서 과거 회차의 마감, 워크숍 마감, 리뷰 마감이 먼저 등장할 수 있다. 학회 연도와 마감 종류를 함께 검사하고 불명확한 변경은 검토 필요 상태로 남겨야 한다.
