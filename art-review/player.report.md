# 플레이어 스프라이트 보고서

`assets/sprites/player/player.png`: 64×192 시트, 셀16×32, 앵커 [8,31]. idle2·walk4 × down/up/right의6행·18프레임이다. left는 right를 반전한다. JSON에 재생 정보와 팔레트 경로가 있다. `player_x8.png`와 `player.html`은 확대·애니메이션 검수용이다.

성인 농장 일꾼의 밀짚모자·밝은 작업 셔츠·녹색 멜빵바지·갈색 장화를 기준 포즈3장으로 생성했다. 나머지 동작은 다리 픽셀과 몸통1px 이동으로 파생했다. 축소 시 최빈색을 사용하고32색 공용 팔레트에 맞췄다. 얼굴·수염·눈과 목의 가독성을 작은 픽셀 묶음으로 보완했다.

- [x] 원본6행과 기준포즈·x8에서 크기·알파·팔레트·12색 제한·고립 픽셀·재질 최암색 외곽선·접지 검사 통과.
- [x] 첫 idle 기준포즈의 머리부터 발까지28~30px, 모든 프레임 접지 행31 유지.
- [x] 정면 눈2개·뒷면0개·측면1개, 각 눈1px.
- [x] 모자·셔츠, 옷, 피부 각각3단계 색을 쓰며 전체10색이다.
- [x] 각 방향 걷기4프레임은 서로 다르다. x8은 원본의 정확한 최근접 확대다.
- [x] 녹색 배경 제거가 녹색 작업복을 지우던 문제를 수정하고 몸통 불투명 회귀 시험을 추가했다.
- [x] 파일 실행 HTML에서18캔버스의1·4·8배 표시, 프레임 선택, 실제 좌우 반전, 정지·재시작을 확인했다. 페이지 오류와 외부 요청은0개다.

검증 결과: `environment.validation.json`, `environment.browser.json`. 재현: `node tools/build-player.cjs`, `node tools/validate-environment.cjs`, `node --test`. 브라우저 검증은 기존 Playwright 경로를 PLAYWRIGHT_MODULE에 지정하고 `node tools/check-environment-preview.cjs`를 실행한다. 설치나 서버가 필요 없다.
