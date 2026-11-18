const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));const v=read('art-review/pig_adult_realistic.validation.json'),b=read('art-review/pig_adult_realistic.browser.json'),p=read('art-review/realistic-keyposes/processing.json');
const report=`# 사실적 성체 돼지 개정 보고서

사람이 첨부한 참고처럼 긴 몸통·자연스러운 다리와 관절·작은 눈·피부 입체 명암으로 다시 제작했다. 기존32px 만화형은 보존했고 새 시트는 pig_adult_realistic 이름으로 분리했다. 비교 화면: [pig_adult_realistic.html](pig_adult_realistic.html).

## 산출물과 검증

- 시트 512×1920, 셀128×128, 앵커 [64,119], 15행·39프레임.
- base PNG와 JSON, spots/belt/points 무늬 PNG, 전체 x8 PNG, 독립 HTML, 검증 JSON.
- 실제32색 + 유전 마커11색. 기본 시트8색, 합성12색 이하.
- 자동 검사 ${v.results.length}건 ${v.pass?'PASS':'FAIL'}. 크기·알파·팔레트·색 수·고립 픽셀·외곽선·접지와 빈 프레임을 검사했다. 무늬는 단독 검사와 원본 합성 검사를 함께 실행했다.
- x8 PNG는 모든 픽셀이 품종 색 적용 원본의 정확한8×8 블록인지 검사했다. 확대 일치가 알파·색·외곽선·앵커를 보존하며 새 고립 픽셀을 만들지 않는다.
- file: 미리보기 15개 동작행, 5품종×4무늬20조합, 1·4·8배, 좌우 반전, 프레임 선택, happy 1회 종료를 확인했다. 브라우저 오류${b.pageErrors.length}개·외부 요청${b.externalRequests}개.

## 제작과 눈 검사

- [x] 새 방향별 idle만 이미지 도구로 생성했다. 기타 프레임은 픽셀 편집이다.
- [x] 기존 큰 머리·짧은 다리 형태에서 성체의 긴 몸통과 관절을 가진 체형으로 바꿨다.
- [x] 작은 눈, 두꺼운 귀, 긴 주둥이, 읽히는 꼬리 컬과 분리된 다리를 확인했다.
- [x] 최빈색 축소 후 팔레트에 맞췄고 평균 축소를 사용하지 않았다.
- [x] 회전은 역방향 최근접 샘플링을 써 얼굴에 빈 격자 픽셀이 생기던 문제를 고쳤다.
- [ ] 사실형 전체 애니메이션은 관절 마스크와 먹기 자세의 추가 시각 정리가 필요하다. 최종 수작업 수준의 애니메이션 승인으로 표시하지 않는다.

| 방향 | 자동 픽셀 정리 | 출력 영역 |
| --- | ---: | --- |
${Object.entries(p).map(([d,r])=>'| '+d+' | '+r.automaticCleanupPixels+' | '+(r.bounds[2]-r.bounds[0]+1)+'×'+(r.bounds[3]-r.bounds[1]+1)+' |').join('\n')}

## 호환성과 남은 통합

이 개정은 사용자의 최신 사실적 화풍 지시를 반영한128px 프로필이며, 기존 SPRITE-SPEC v1의32px 크기 및 약20px 보정 제한에 합격했다고 주장하지 않는다. 1254×1254 생성 원본을128px로 줄이고 외곽선·고립 픽셀을 자동 정리한 양을 위에 공개했다. 기준 문서 원문을 바꾸지 않았다.

god에게 원본128px/월드32px 텍스처 밀도4 통합을 제안했다. 기존32px 호환 시트도 유지했으므로 통합 결정을 기다리지 않고 나머지 자산 작업을 진행할 수 있다. 렌더러가 메타데이터의 셀 크기를 읽으면 자산마다 코드를 바꿀 필요가 없다. 자세한 사용법은 docs/art/INTEGRATION.md.

## 실행

~~~powershell
node tools/build-realistic-pig.cjs
node tools/build-realistic-preview.cjs
node tools/validate-realistic-pig.cjs
node --test tools/sprite-validate.test.cjs
node tools/check-realistic-preview.cjs
~~~

브라우저 도구는 기존 PLAYWRIGHT_MODULE 설치를 사용한다. 설치·업로드·원격push는 하지 않았다. 팔레트와 품종의 기준은 docs/art/*-realistic.json이며 빌더는 그 데이터를 읽기만 한다.
`;
fs.writeFileSync(path.join(root,'art-review/pig_adult_realistic.report.md'),report);console.log('Wrote realistic report');
