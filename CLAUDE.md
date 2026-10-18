# 제조 AX 통합 관제·분석 프로토타입

가상의 자동차 부품 회사(사업장 4곳: 프레스·용접, 사출·도장, 정밀 가공, 모듈 조립) 데이터로 "제조 AX 통합 관제·분석" 솔루션의 시연용 화면을 만든다.
목적은 경영진 시연에서 생산·품질·설비·에너지·원가를 하나의 데이터로 보여 주고, AI 결과와 AX 효과를 근거와 함께 설명할 수 있는지 검증하는 것이다. 운영 시스템이 아니다.

일반 제조 솔루션으로 설계한다. 업종별 지표는 초기 설정에서 업종 템플릿으로 제시하고 고른다. 기본 템플릿은 자동차 부품이다.

## 먼저 읽을 것

- `prompts/00-진행-순서.md` — 단계와 모든 단계에 적용하는 규칙
- `docs/screen-guide.md` — 공통 틀, 화면 패턴 13종, 공통 규칙. 화면 구조의 기준이다.
- `docs/decisions.md` — 가이드에 없어 따로 정한 사항
- `config/menu.json` — 화면 ID, 메뉴, 패턴, 사업장 범위, 역할, 구현 단계. 메뉴의 단일 출처다.
- `config/company.json` — 가상 회사, 사업장, 라인, 설비, 제품, 고객사, 단가, 시나리오
- `config/industry-templates.json` — 업종 템플릿
- `docs/kpi-dictionary.md` — 지표 정의와 계산식, 합산 방식, 비교 기간
- `docs/data-model.md` — 데이터 계층, 파일 구성, 용량 목표
- `docs/roi-method.md` — AX 효과 산정 방법
- `docs/ai-engine.md` — 가상 AI 엔진 규격
- `docs/demo-story.md` — 경영진 시연 흐름

문서끼리 다르면 `docs/screen-guide.md`와 `docs/kpi-dictionary.md`가 우선이다. 문서에 없는 것을 정해야 하면 멈추고 묻는다.

## 기술 구성

- Vite + React + TypeScript, Ant Design 5, Apache ECharts, AG Grid Community, React Router(해시 라우팅), PDF는 pdfmake
- 서버 없음. 가상 데이터는 스크립트로 한 번 생성해 `public/mock/`에 JSON으로 둔다. 빌드는 상대 경로(`base: './'`)로 만든다.
- 화면 기준은 1920×1080. EXE-010(경영 현황)과 COM-020(알림 상세)은 휴대폰 폭까지 대응한다.

## 라이선스 규칙

- 허용: MIT, Apache-2.0, BSD, ISC, BlueOak-1.0.0, Zlib, 글꼴은 OFL (BlueOak·Zlib은 PDF 보고서 의존 패키지 때문에 2026-10-17 추가, decisions.md D-46)
- 금지: GPL·AGPL 계열, AG Grid Enterprise 기능(행 그룹핑, 피벗, 엑셀 내보내기, 트리 데이터, 마스터/디테일), 그 밖의 상용 라이선스
- 패키지를 추가할 때마다 라이선스를 확인하고 `npm run check:licenses`가 통과해야 한다.
- 표 내보내기는 CSV, 보고서는 PDF로 한다.

## 구조 규칙

1. **화면은 설정으로 정의한다.** `config/screens/<화면ID>.json`이 패턴, 조건, 열, 지표, 차트, AI 결과 영역을 정의하고 `src/patterns/` 템플릿이 그린다. 설정으로 안 되는 부분만 `src/screens/`에 두고 이유를 정의 파일에 적는다.
2. **메뉴는 `config/menu.json`에서만 온다.** 메뉴명, 화면 제목, 경로 표시의 마지막 단어는 같은 값을 쓴다.
3. **스타일은 토큰만 쓴다.** `src/` 아래에 색상값과 px 값을 직접 쓰지 않는다. Ant Design, ECharts, AG Grid 테마는 같은 토큰을 읽는다.
4. **계산은 한곳에서 한다.** 지표는 `src/data/metrics`, AI 결과는 `src/data/aiEngine.ts`, 효과 금액은 `src/data/roi`에서만 계산한다. 화면과 PDF는 결과만 쓴다.
5. **상태 표시는 4단계다.** 긴급, 주의, 참고, 정상. 색·도형·글자를 함께 쓰고 정상은 무채색으로 둔다. 상태색을 장식이나 차트 계열색으로 쓰지 않는다.
6. **버튼 명칭은 `config/terms.json`에서만 온다.** 명령 6개(조회, 신규, 저장, 삭제, 내보내기, 확인)와 decisions.md D-02에 정한 보조·판정·처리 명칭만 쓴다.

폴더 구성:

```
src/
  shell/        공통 틀, 역할별 메뉴, 사업장 선택, 알림 센터, AI 도우미 창
  patterns/     P1~P13 템플릿
  components/   상태 배지, 지표 카드, 금액 카드, AI 결과 카드, 그리드·차트 래퍼
  data/         로더, 집계, metrics/, roi/, aiEngine.ts, 비교 기간
  report/       PDF 보고서 구성
  screens/      설정만으로 안 되는 화면의 보조 코드
config/         menu.json, company.json, industry-templates.json, terms.json, screens/
scripts/        gen-data, check-tokens, check-screens, check-licenses, build-artifact
```

## 데이터 규칙

- 모든 데이터와 금액은 가상이다. 실제 회사명, 실제 제품·설비 번호, 출처를 확인하지 못한 통계를 쓰지 않는다. 고객사는 "고객사 A·B·C"로 부른다.
- 상단 바에 "가상 데이터"를 항상 표시한다. 금액·단가·효과가 나오는 화면과 PDF에는 "시연용"을 표시한다.
- `npm run gen:data`는 고정 시드로 항상 같은 결과를 낸다. 화면에서 난수를 만들지 않는다.
- "현재"는 `company.json`의 `now`로 고정한다. 시스템 시계를 쓰지 않는다.
- 같은 수치는 화면과 PDF에서 같은 값이어야 한다. 합계와 금액은 원본에서 계산한다.
- 전사 값은 `docs/kpi-dictionary.md`에 정한 합산 방식(합, 시간 가중, 수량 가중, 최댓값)을 따르고 포함 사업장 수를 표시한다.
- 수집 중단은 0으로 보이지 않고 미수신으로 표시한다.
- AI 결과는 가상 엔진이 데이터에서 결정적으로 계산한다. 근거, 신뢰도, 모델·버전, "가상 엔진" 표시를 함께 보여 주고 사람이 채택·기각한다.

## 작업 방식

- `prompts/`의 단계 순서대로 진행한다. 한 단계가 끝나면 멈추고 보고한다.
- 각 단계 끝에 `npm run check`가 통과해야 한다(2단계부터).
- 화면을 만들면 개발 서버에서 직접 열어 1920×1080에서 겹침·잘림·콘솔 오류를 확인하고, 확인한 화면 ID를 보고에 적는다. 확인하지 못한 것은 확인하지 못했다고 적는다.
- 응답과 화면 문구는 한국어, 코드 식별자와 주석은 영어로 쓴다.
- v1(`D:\ems-prototype`)은 수정하지 않는다.
