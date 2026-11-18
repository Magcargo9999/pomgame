# 농장 타일 보고서

`assets/sprites/tiles/farm_tiles.png`는16×16 셀39개를128×80 아틀라스로 묶는다. 같은 이름의 JSON에 각 타일의 행·열·종류·통과 가능 여부·울타리 연결 비트·집 그룹을 기록했다. 개별16×16 PNG도 함께 제공한다.

- 잔디4, 흙4, 축사 바닥4: 상하좌우 경계가 일치하는 반복 변형.
- 울타리16: north1, east2, south4, west8 비트 조합. 이름은 fence_0~fence_f.
- gate_closed / gate_open: 닫힌 문·열린 문과 각각의 통과 여부.
- 낡은 집9타일: 3×3으로 재조합한다. 편의용48×48 전체 스프라이트는 `assets/sprites/buildings/old_house.png`와 JSON에 있다.
- `farm_tiles_x8.png`, `farm_tiles.html`: 최근접 확대와 예시 농장 배치. HTML은 파일로 열며 문 상태를 바꿀 수 있다.

기준 그림6장만 이미지 도구로 만들고 반복 변형·연결형·문 열기·집 분할은 픽셀 편집으로 파생했다. 최빈색 축소와 기존32색 팔레트 스냅을 사용했다. 아틀라스 전체는12색 이하이며 개별 지면은3~4단계 명암을 쓴다.

검증: `node tools/validate-environment.cjs`, `node --test`, `node tools/check-environment-preview.cjs`.

- [x] 크기·알파·팔레트·색 수·고립 픽셀·재질 외곽선·투명 빈 칸 검사 통과.
- [x] 지면4방향 반복 경계 일치, 집9분할 재조합 일치, 개별 PNG와 아틀라스 픽셀 일치.
- [x] 깨진 경계를 넣은 음성 시험은 실패한다.
- [x] HTML 문 열기/닫기가 실제 화면 픽셀을 바꾸며 원상 복귀한다.
- [x] 1배에서 잔디·흙·축사 바닥과 울타리·문·낡은 집을 구별할 수 있다.

타일은 발 앵커가 없고 지면에 외곽선을 두르지 않는다. 집 분할 경계는 인접 조각과 연결되는 내부 경계이므로 전체48px 집을 별도 검사한다. PNG 검증 결과는 `environment.validation.json`, 브라우저 결과는 `environment.browser.json`에 있다. 생성 원본과 UI 화면 캡처는 게임 팔레트 검사 대상이 아니다.
