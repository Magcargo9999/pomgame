const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const v=read('art-review/pig_adult.validation.json'),b=read('art-review/pig_adult.browser.json'),p=read('art-review/keyposes/processing.json'),t=read('art-review/validation-tests/results.json');
const lines=v.results.map(r=>'| '+path.relative(root,r.file).replaceAll('\\','/')+' | '+(r.pass?'PASS':'FAIL')+' | '+r.opaqueColors+' | '+r.issues.join('; ')+' |').join('\n');
const report=`# pig_adult 검수 보고서

상태: **검토용 산출물 준비 / 자동 검사 통과 / 완전 규격 승인 보류**.
기준: 공유 저장소 docs/art/SPRITE-SPEC.md v1, 2026-11-18.

## 산출물

- assets/sprites/pig/pig_adult.png: 128×480, 15행, 사용 프레임 39개. 나머지 칸 투명.
- assets/sprites/pig/pig_adult.json: 32×32 셀, 앵커 [16,29], 방향·행·타이밍·반복·점프 예외·left 반전 정보.
- pig_adult.spots.png / pig_adult.belt.png / pig_adult.points.png: 같은 크기, spot 마커만 사용. 몸 바깥 픽셀 0개.
- docs/art/palette.json: 실제 게임 색 32개 + 예약 유전 마커 11개. 8개 재질 램프.
- docs/art/breeds.json: 요크셔·랜드레이스, 듀록, 버크셔, 재래흑돼지, 점박이. 품종별 coat/spot/snout 배열.
- art-review/pig_adult_x8.png: 듀록 색을 적용한 전체 시트 1024×3840. 최근접 확대 불일치 0개.
- art-review/pig_adult.html: 서버 없이 파일로 실행. 15행을 1·4·8배로 재생. 품종/무늬/좌우 반전/정지/재시작/프레임 선택/실제 breeds.json 다시 읽기.

## 자동 검사

검사기: tools/sprite-validate.cjs. 실패 시 종료 코드 1, 결과는 JSON.
통합 실행: node tools/validate-pig.cjs.

1. 셀·행·열과 PNG 크기 일치: PASS.
2. 알파 0 또는 255: PASS.
3. 불투명 색의 팔레트 소속: PASS.
4. 스프라이트당 불투명 색 12개 이하: PASS.
5. 외곽선·눈을 제외한 고립 픽셀 0개: PASS.
6. 외곽선 순검정 금지 및 재질 램프 최암색: PASS.
7. 앵커 행 접지: PASS. happy의 가운데 프레임만 2px 점프 예외.

무늬 PNG는 독립 동물이 아니므로 자체 발·접지를 요구하지 않는다. 무늬 파일은 spot 색·알파·크기·고립 픽셀·투명 빈 칸을 검사하고, 원본과 합성한 3개 PNG에 7개 규칙 전부를 적용했다. 원본 실루엣 밖으로 나오는 무늬 픽셀도 별도로 검사했다.

| 파일 | 결과 | 불투명 색 수 | 문제 |
| --- | --- | ---: | --- |
${lines}

검사기 회귀 시험 ${t.cases.length}건 통과. 정상, 잘못된 크기, 반투명, 팔레트 이탈, 13색, 내부 고립 픽셀, 잘못된 외곽선 명암, 순검정 외곽선, 접지 누락, 눈 예외, 점프 예외를 확인했다. 실패 시험용 PNG는 실행 후 지운다.

원본 생성 초안 *.source.png는 녹색 배경과 생성 색을 보존한 입력 자료이며 게임 자산이 아니다. pig_adult.browser.png는 미리보기 화면 캡처다. 이 입력·화면 자료는 스프라이트 팔레트 검사 대상에서 제외한다.

## 브라우저 검증

기존 설치된 Playwright와 Chromium으로 file: 주소를 직접 열었다. 설치·서버·업로드 없이 실행했다.

\`\`\`json
${JSON.stringify(b,null,2)}
\`\`\`

5개 품종 × 4개 무늬의 20조합, 45개 캔버스, happy 착지 프레임에서 정지, 슬라이더, 좌우 반전, breeds.json 파일 재로드를 확인했다. 페이지 오류 0개, 외부 요청 0개. 이미지와 JSON은 HTML에 내장되어 로컬 파일 보안 정책에 막히지 않는다. 수정한 breeds.json은 파일 선택으로 재로드한다.

## 눈 검사: 1배와 확대 화면

- [x] 돼지 축종과 down/up/right 방향을 구별할 수 있다.
- [x] 정면 눈 2개, 측면 눈 1개를 1px로 복원했다. 기본 자세 다리는 투명 틈으로 나뉜다.
- [x] 큰 머리 비율: 정면 머리가 몸의 30% 이상이며 측면 머리도 몸 길이의 약 1/3 이상이다.
- [x] 재질 램프는 3~4단계로 정의했으며 동일 슬롯을 모든 프레임에 재사용한다.
- [x] idle 다리 고정, walk 대각선 교차 및 몸통 상승, eat 머리 2~3px 이동·꼬리 흔들기, sleep 엎드림·호흡, happy 2px 점프를 픽셀 편집으로 파생했다.
- [ ] eat의 코가 바닥에 닿는 표현은 더 손봐야 한다. 특히 right는 머리를 내렸지만 코와 바닥 사이가 남는다.
- [ ] up의 꼬리 컬은 축소 후 충분히 읽히지 않는다. 단순한 꼬리 끝 모양으로 보인다.
- [ ] 모든 동작의 외곽선 두께·머리와 몸통 연결부가 완전히 일정하다고 판단할 수 없다. eat 연결부와 걷기 다리 표현은 최종 시각 검토가 필요하다.

## 제작 절차 편차: 승인 필요

이미지 도구에는 512×512, 32×32 격자, 16px 블록, 단색 녹색 배경을 요청했지만 실제 출력은 1254×1254였다. 32×32의 각 영역에서 녹색을 배경으로 분류하고 RGB 최빈색을 선택한 뒤 가장 가까운 마커 색으로 맞췄다. 평균 축소는 사용하지 않았다. 방향별 idle 포즈만 생성했으며 재생성 포함 총 7회였다. 애니메이션 프레임은 생성하지 않았다.

기준 포즈 보정량(앵커 평행 이동 제외, 최종 픽셀 차이):

| 방향 | 출력 영역 | 보정 픽셀 |
| --- | --- | ---: |
${Object.entries(p).map(([k,r])=>'| '+k+' | '+(r.bounds[2]-r.bounds[0]+1)+'×'+(r.bounds[3]-r.bounds[1]+1)+' | '+r.correctedPixels+' |').join('\n')}

SPRITE-SPEC §5의 “픽셀 20개 정도”보다 보정량이 크다. 이 편차와 위 시각 문제를 숨기지 않았으며, **현재 결과를 완전 규격 통과나 최종 게임 아트로 승인하지 않는다**. god에게 다음 범위 결정을 요청한다: 현재 산출물에서 시각 문제를 추가 픽셀 편집하고 절차 편차를 수용할지, 기준 포즈를 다시 생성할지.

버크셔의 여섯 흰 지점은 주둥이·꼬리 끝·네 발로 정의했다. 뒤에서는 주둥이가, 정면에서는 꼬리가 가려지므로 여섯 지점을 억지로 모두 그리지 않는다. points 레이어와 JSON에 이 가림 규칙을 기록했다.

## 재현

\`\`\`powershell
node tools/animate-pig.cjs
node tools/build-art-preview.cjs
node tools/validate-pig.cjs
node tools/test-sprite-validate.cjs
# 기존 playwright-core 경로를 PLAYWRIGHT_MODULE에 지정한 뒤 실행:
node tools/check-art-preview.cjs
\`\`\`

도구는 Node 표준 라이브러리만 사용한다. 브라우저 검증만 기존 Playwright 설치를 사용한다. Python, 패키지 설치, git 명령, 원격 업로드는 실행하지 않았다.

원자료: keyposes/sources.json, keyposes/processing.json, pig_adult.validation.json, pig_adult.browser.json, validation-tests/results.json.
`;
fs.writeFileSync(path.join(root,'art-review/pig_adult.report.md'),report);console.log('Wrote art-review/pig_adult.report.md');
