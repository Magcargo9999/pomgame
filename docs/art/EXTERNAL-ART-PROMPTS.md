# 빚더미 목장: 외부 제작용 도트 목록과 프롬프트

외부 이미지 생성 도구(ChatGPT 이미지, Midjourney, Aseprite 등)로 도트를 만들어 올 때 쓰는 문서입니다.
규격은 `docs/art/SPRITE-SPEC.md`가 기준이고, 이 문서는 그 규격을 그대로 프롬프트로 옮긴 것입니다.

---

## 0. 게임 소개 (모든 프롬프트 앞에 붙이는 설명)

**빚더미 목장 (Debt Pile Ranch)**: 빚 1,000만 원을 떠안고 시골 양돈장을 물려받은 주인공이 1년(4계절, 112일) 동안 돼지를 키우고 교배하고 등급을 받아 출하해서 빚을 갚는 2D 도트 경영 게임입니다. 분위기는 **따뜻하고 귀엽고 아기자기하며, 블랙코미디가 아주 살짝** 섞입니다. PC 브라우저 게임이고, 화면은 위에서 비스듬히 내려다보는 시점(¾ 탑다운)입니다.

**공통 프롬프트 머리말 (영어, 그대로 복사)**
```
Pixel art game asset for "Debt Pile Ranch", a cozy, warm, cute 2D farm-management game about raising pigs to pay off a debt (slightly darkly comedic, mostly wholesome). 3/4 top-down view, light from the top-left. Strict pixel art: hard square pixels, no anti-aliasing, no gradients, no blur, no drop shadow, flat color areas with 3-4 step shading ramps, 1-pixel outline using the darkest shade of each material (never pure black). Limited palette (see below). Solid #00ff00 background (or transparent).
```

---

## 1. 꼭 지켜야 할 공통 규격

| 항목 | 규칙 |
|---|---|
| 파일 | PNG. 배경은 투명이 가장 좋고, 안 되면 단색 `#00ff00` |
| 크기 | **아래 표의 픽셀 크기 그대로(1배)**. 생성기가 크게 만들면 512×512처럼 정확한 배수로 받고, 한 칸이 정확히 N×N 블록이 되게 하세요(예: 32×32 그림 → 512×512, 한 픽셀 = 16×16 블록). 우리가 줄입니다 |
| 반투명 | 금지. 알파는 0 아니면 255 |
| 색 | 아래 팔레트 32색만 사용. 그림 하나에 **불투명 색 12개 이하** |
| 외곽선 | 1px, 그 재질의 가장 어두운 색. 순검정 `#000000` 금지 |
| 시점·빛 | ¾ 탑다운, 빛은 왼쪽 위 |
| 고립 픽셀 | 눈과 외곽선 말고 1px 점 따로 찍지 않기 |
| 애니메이션 | 같은 캐릭터의 프레임끼리 색, 비율, 외곽선이 같아야 함. 생성기로 프레임을 따로 뽑지 말고 **기준 포즈 1장**만 받아 오세요. 나머지 프레임은 우리가 픽셀 편집으로 만듭니다(받아 오셔도 됩니다) |
| 게임 안 크기 | 화면에서 2배로 확대해 보여 줍니다. 1배에서 알아볼 수 있어야 합니다 |

**팔레트 (32색, 재질별 밝음→어두움)**
```
white   #fff1df #e8c9ad #ba947e #795d56
skin    #efb39f #ce887c #a45d59 #653f43
red     #dc925a #b9603d #843d30 #4d282b
black   #85818b #5d5969 #3d394c #252438
soil    #c0ad76 #968051 #6c573c #473b30
grass   #b4cd73 #7da95d #527a4b #334e40
wood    #dfb97b #b48756 #7e593e #513b32
outline #c9c1c3 #96919d #635e71 #353247
```
프롬프트에 붙일 때: `Use only these hex colors: ` + 위 32개.

---

## 2. 제작 목록

우선순위: ★★★ 화면이 바로 좋아짐 / ★★ 아기자기함 / ★ 있으면 좋음

### A. 바닥 타일 (16×16, 이음매 없이 반복) ★★★
| 파일 이름 | 크기 | 내용 |
|---|---|---|
| `tile_grass_1~3.png` | 16×16 ×3 | 잔디 3종(조금씩 다른 풀잎 무늬). 이어 붙여도 반복이 티 나지 않게 |
| `tile_grass_flower_1~2.png` | 16×16 ×2 | 잔디 위 작은 꽃(흰색·분홍), 클로버 |
| `tile_path_9.png` | 48×48 (16×16 칸 3×3) | 흙길 9칸 세트: 가운데 1 + 가장자리 4 + 바깥 모서리 4 (잔디와 만나는 테두리) |
| `tile_path_inner_corner.png` | 32×32 (2×2) | 흙길 안쪽 모서리 4개 |
| `tile_hedge_9.png` | 48×48 (3×3) | 농장 테두리 생울타리 9칸 세트 |
| `tile_penfloor_1~2.png` | 16×16 ×2 | 돈사 바닥: 흙+짚(지푸라기) 2종 |
| `tile_mud.png` | 16×16 | 진흙 웅덩이(돼지가 좋아함) |

프롬프트 예:
```
[머리말] Seamless tileable 16x16 pixel ground tile: short grass, three shades of green, a few darker blade clusters, cozy farm. Render as 256x256 where each pixel is a 16x16 block. Must tile seamlessly on all four edges.
```

### B. 울타리·돈사 소품 ★★★
| 파일 이름 | 크기 | 내용 |
|---|---|---|
| `fence_h.png` / `fence_v.png` | 16×16 | 나무 울타리 가로·세로 |
| `fence_corner_tl/tr/bl/br.png` | 16×16 ×4 | 울타리 모서리 4개 |
| `fence_gate_closed/open.png` | 16×16 ×2 | 돈사 출입문 닫힘·열림 |
| `trough_feed_empty/full.png` | 32×16 ×2 | 사료통 빈 것·찬 것(사료 알갱이 보이게) |
| `trough_water.png` | 32×16 | 물통(물 2px 반짝임) |
| `pen_sign.png` | 16×16 | 돈사 번호 팻말 (숫자는 게임이 씀, 빈 나무판) |

### C. 건물 (¾ 탑다운, 아래쪽 가운데에 문) ★★★
| 파일 이름 | 크기 | 내용 |
|---|---|---|
| `bld_house.png` | 64×48 | 주인공 집: 작은 시골집, 빨간 지붕, 창문 2, 문 1, 굴뚝. 살짝 낡았지만 따뜻하게 |
| `bld_shed.png` | 48×48 | 창고: 나무 판자, 사료 포대가 문 옆에 기대 있음 |
| `bld_dock.png` | 80×48 | 출하장: 짐칸 있는 작은 트럭 + 나무 상하차대 |
| `bld_piggery_t1.png` | 96×64 | 확장 돈사(T1): 길쭉한 축사, 슬레이트 지붕 (나중에 쓸 것) |
| `gate_farm.png` | 16×32 | 농장 출입구 나무 팻말 "읍내 →" (글자 없이 화살표만) |

프롬프트 예:
```
[머리말] 64x48 pixel art building, 3/4 top-down view: a small, slightly worn but cozy countryside farmhouse with a red tiled roof, chimney, two windows with light curtains, wooden front door centered on the bottom edge. Render as 512x384 where each pixel is an 8x8 block.
```

### D. 주인공 (16×32, 발 기준점 (8,31)) ★★★
| 파일 이름 | 크기 | 내용 |
|---|---|---|
| `player_base_down/up/right.png` | 16×32 ×3 | 서 있는 기준 포즈 3방향(정면·뒷모습·옆모습). 왼쪽은 오른쪽을 뒤집어 씀 |
| (선택) `player.png` 시트 | 64×(32×6) = 64×192 | 행: idle down/up/right(2프레임), walk down/up/right(4프레임). 빈 칸 투명 |

캐릭터 설정: 20대 후반, 밀짚모자, 파란 작업복 멜빵바지, 장화. 표정은 지쳤지만 씩씩함. 머리 크게(몸의 30% 이상), 2~3등신 귀여운 비율. 머리부터 발까지 28~30px.
```
[머리말] 16x32 pixel art character, chibi proportions (big head), young farmer in straw hat, blue overalls, rubber boots, tired but determined smile. Front view, standing idle, feet touching the bottom row. Render as 256x512 where each pixel is a 16x16 block.
```

### E. 읍내 사람들 (대화창 얼굴 48×48 + 선택 걷는 그림 16×32) ★★
대화창 얼굴은 어깨 위 정면, 배경 투명. 표정 2개(기본·특수)씩.
| 파일 이름 | 누구 | 특수 표정 |
|---|---|---|
| `npc_creditor_face.png` (96×48, 2칸) | 빚쟁이(채권자): 정장 입은 둥근 아저씨, 웃는데 무서움 | 눈이 번쩍 |
| `npc_vet_face.png` | 수의사: 안경, 흰 가운, 차분 | 걱정 |
| `npc_feed_face.png` | 사료 가게 할머니: 앞치마, 푸근 | 웃음 |
| `npc_auction_face.png` | 경매사: 나비넥타이, 신남 | 소리침 |
| `npc_worker_face.png` | 일꾼: 수건 머리띠, 근육 | 엄지 척 |

### F. 돼지 (이미 있음, 다시 만들고 싶을 때만) ★
지금 게임에 들어간 것: 성체 32×32, 자돈 32×32 시트(128×480). 다시 만든다면:
- `pig_adult_base_down/up/right.png` 32×32 ×3, 몸 가로 24~28px·세로 18~22px, 발 기준점 (16,29)
- `piglet_base_down/up/right.png` 32×32 ×3, 몸 가로 14~18px·세로 11~14px
- **털 색은 흰 돼지(분홍빛 흰색)로만** 그려 오세요. 품종 색(두록 붉은색, 버크셔 검정+흰 반점 등)은 게임이 바꿔 칠합니다.

### G. 감정 말풍선·효과 (16×16, 애니메이션은 가로로 이어 붙임) ★★
| 파일 이름 | 크기 | 내용 |
|---|---|---|
| `emote_heart.png` | 16×16 | 하트(행복) |
| `emote_hungry.png` | 16×16 | 빈 그릇(배고픔) |
| `emote_sick.png` | 16×16 | 초록 물결(아픔) |
| `emote_angry.png` | 16×16 | 십자 핏줄(스트레스) |
| `emote_zzz.png` | 48×16 (3프레임) | Z가 떠오름(잠) |
| `emote_note.png` | 16×16 | 음표(기분 좋음) |
| `fx_dust.png` | 64×16 (4프레임) | 걸을 때 흙먼지 |
| `fx_sparkle.png` | 48×16 (3프레임) | 반짝(등급 좋음, 명품 인증) |
| `fx_coin.png` | 64×16 (4프레임) | 동전이 튀어 오름(판매) |

### H. 장식 소품 (아기자기함 담당) ★★
| 파일 이름 | 크기 | 내용 |
|---|---|---|
| `deco_tree.png` | 32×48 | 동그란 활엽수 |
| `deco_bush.png` | 16×16 | 덤불 |
| `deco_rock_1~2.png` | 16×16 ×2 | 돌 |
| `deco_haybale.png` | 16×16 | 건초 더미 |
| `deco_feedsack.png` | 16×16 | 사료 포대 |
| `deco_bucket.png` | 16×16 | 양동이 |
| `deco_wheelbarrow.png` | 32×16 | 외바퀴 수레 |
| `deco_mailbox.png` | 16×32 | 우편함(빨간 독촉장이 삐져나옴, 블랙코미디) |
| `deco_debt_board.png` | 32×32 | 집 앞 칠판: 빚 액수 쓰는 곳(글자 없이) |
| `deco_butterfly.png` | 16×8 (2프레임) | 나비 |
| `deco_chicken.png` | 16×16 (2프레임) | 마당 닭(장식) |

### I. UI 아이콘 (16×16, 가운데 14×14 안에 그림) ★★
| 파일 이름 | 내용 |
|---|---|
| `icon_gold.png` | 동전(G) |
| `icon_ap.png` | 행동력(번개 또는 땀방울) |
| `icon_calendar.png` | 달력 |
| `icon_season_spring/summer/autumn/winter.png` | 계절 4종(새싹·해·단풍·눈꽃) |
| `icon_debt.png` | 빚 문서(빨간 도장) |
| `icon_pig.png` | 돼지 얼굴(마리 수) |
| `icon_market.png` | 시세 그래프 |
| `icon_feed_starter/grower/finisher.png` | 사료 3단계(포대 색만 다르게) |
| `icon_medicine.png` | 약병 |
| `icon_breed.png` | 하트 두 개(교배) |
| `icon_grade_1p/1/2/out.png` | 돼지 등급 배지: 1+(금), 1(은), 2(동), 등외(금 간 회색 배지). 글자는 2~3px 숫자로 |
| `icon_brand.png` (32×32도 하나) | **빚더미 목장 명품** 인증 도장: 돼지 얼굴+왕관, 빨간 원형 도장 |
| `icon_town_auction/creditor/facility/feed/vet/workers.png` | 읍내 시설 6곳 아이콘 |

### J. 계절 바꾸기 (선택) ★
잔디·나무만 계절별로 4종: `*_summer`, `*_autumn`(누런 잔디·단풍), `*_winter`(눈 덮임). 크기는 원본과 같게.

---

## 3. 넘겨주는 방법
1. 파일 이름을 위 표대로 맞춰 `projects/game-dev/art-inbox/` 폴더에 넣어 주세요(없으면 만들기).
2. 큰 해상도로 받았다면 몇 배인지 파일 이름 끝에 붙여 주세요. 예: `bld_house_x8.png`
3. 넣었다고 말씀해 주시면 도트 디렉터가 1배로 줄이기, 팔레트 맞추기, 검사 스크립트(`tools/sprite-validate`) 통과, 애니메이션 프레임 만들기, 게임 연결까지 합니다.

## 4. 생성기를 쓸 때 요령
- 한 번에 한 그림만 요청하세요. 여러 개를 한 장에 뽑으면 크기가 들쭉날쭉해집니다.
- "Render as WxH where each pixel is an NxN block"을 꼭 넣으세요. 그래야 정확히 줄일 수 있습니다.
- 결과에 흐린 경계나 그라디언트가 보이면 "hard pixels, no anti-aliasing"을 다시 강조해서 재생성하세요.
- 손으로 고칠 수 있는 건 20픽셀 정도까지입니다. 그 이상 틀리면 다시 뽑는 게 빠릅니다.
