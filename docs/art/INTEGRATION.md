# 스프라이트 추가와 사용

동작 정보는 `assets/sprites/<species>/<name>.json`에 있다. `cell`, `anchor`, `anims`를 읽고 시트의 원본 사각형을 계산한다. 행 이름은 `<animation>_<direction>`이며 `row`, `frames`, `ms`, `loop`가 재생을 결정한다. left는 right를 반전한다. happy처럼 `loop:false`인 동작은 마지막 프레임에서 멈춘다.

원본 셀 크기를 게임 월드 크기와 분리한다. 발 위치에 그릴 때 `anchor / cell` 비율을 표시 크기에 곱해 빼면 32px와128px 시트를 같은 발 기준으로 배치할 수 있다. 캔버스 `imageSmoothingEnabled=false`를 사용한다.

coat/spot/snout 마커 색을 품종 JSON의 같은 순서 색으로 바꾼다. 필요한 `.spots.png`, `.belt.png`, `.points.png`를 같은 프레임에 합성한다. 베이스와 무늬는 반드시 함께 이동·반전한다. 여섯 흰 지점은 시점에 따라 가려질 수 있다.

새 종이나 자산 추가 순서:

1. 해당 종 폴더에 PNG 시트, JSON, 필요한 무늬 PNG를 추가한다.
2. 품종 슬롯과 팔레트를 JSON으로 추가한다. 자산별 `palette`/`breeds` 필드가 있으면 그 파일을 사용한다.
3. 공통 시트 검사와 합성 검사를 실행한다. 색·알파·프레임 수·빈 칸·접지를 함께 확인한다.
4. `art-review` 미리보기와 보고서를 추가하고 커밋 해시를 god·프런트엔드에게 전달한다.

실행:

```powershell
node --test tools/sprite-validate.test.cjs
node tools/validate-pig.cjs
node tools/validate-realistic-pig.cjs
```

브라우저 검증은 설치된 `playwright-core` 경로를 `PLAYWRIGHT_MODULE`에 지정한 뒤 `check-art-preview.cjs` 또는 `check-realistic-preview.cjs`를 실행한다. 패키지를 내려받지 않으며 페이지는 `file:`로 직접 연다.
