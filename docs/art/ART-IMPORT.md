# 외부 아트 가져오기

입력 폴더는 `projects/game-dev/art-inbox/`다. 원본은 수정하지 않는다. 새 이미지 생성은 중단하며 외부 제작 파일을 가져온다. 프로토타입은 기존32px 돼지 규격을 사용하고128px 사실형 파일은 게임 manifest에서 제외한다.

한 파일의 축소·팔레트 정리:

```powershell
node tools/art-import.cjs INPUT_x16.png --out art-review/imported/INPUT.png --report art-review/INPUT.import.json
node tools/art-import.cjs tile_grass_1_x16.png --out assets/sprites/tiles/tile_grass_1.png --kind tile --cell 16x16
node tools/art-import.cjs pig_adult_idle_down_x16.png --out art-review/imported/pig_adult_idle_down.png --kind pig --cell 32x32 --markers
```

- `_xN`이 배율이다. 없으면1배다. `--scale N`으로 명시할 수 있다. 가로·세로가 배율로 정확히 나뉘지 않으면 실패하며 임의로 늘이거나 자르지 않는다.
- 각 블록의 RGB 최빈색을 고른 뒤 팔레트의 가장 가까운 색에 맞춘다. 평균 축소를 하지 않는다.
- 기본 팔레트는 `docs/art/palette.json`의32색이다. `--markers` 또는 pig 종류는 유전 마커도 허용한다. 정적 타일을 마커 색으로 자동 치환하지 않는다.
- 기본 배경은 `#00ff00`, 허용 오차는8이다. 근접한 순녹색만 지우므로 녹색 옷을 지우지 않는다. `--background`, `--tolerance`, `--alpha-threshold`로 조정할 수 있다.
- 알파는0/255로 맞춘다. 눈·재질 최암색 외곽선을 제외한 고립 픽셀을 정리한다. sprite/pig/player는 재질 최암색으로 경계를 정리하며 tile은 지면에 외곽선을 강제하지 않는다.
- 종류를 지정하지 않으면 파일명의 pig/player/tile/fence/gate 접두어로 추론한다. 그 외는 일반 sprite다. `--cell WxH`로 논리 셀을 지정한다.
- 색12개 초과나 남은 고립 픽셀 등 검사 실패 시 보고서만 쓰고 출력 PNG는 만들지 않는다. 기존 출력 교체는 `--force`가 필요하다. 입력 자체는 이 옵션으로도 덮지 않는다.
- 투명 무늬처럼 빈 파일이 의도적일 때만 `--allow-empty`를 쓴다.

보고서는 JSON과Markdown으로 쓰며 BOM이 없다. 연결 성분 수는 참고 값이다. 서로 다른 프레임이나 여러 기둥이 들어 있는 파일은 연결 성분이 여러 개일 수 있으므로 자동으로 신체를 이어 붙이지 않는다.

이 도구는 첫 가져오기 단계만 맡는다. 애니메이션 생성, 최종 검수, manifest 갱신은 자동으로 하지 않는다. 기준 포즈가 모이면 규격대로 누락 프레임을 픽셀 편집으로 만들고 `tools/sprite-validate.cjs`를 실행한 뒤 해당 자산을 manifest에 추가하고 한 자산씩 커밋한다. 원본과 보고서에서 시각 문제를 확인한다.

시험: `node --test tools/art-import.test.cjs`. 시험 입력·출력은 각각의 고유 임시 폴더에서 만들고 시험 종료 후 지운다. 실제 art-inbox나 게임 자산은 시험에서 수정하지 않는다.
