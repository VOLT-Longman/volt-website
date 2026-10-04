-- Reviewed English for published content observed on 2026-10-05.
-- Exact Korean text/version guards prevent applying translations to later edits.
-- Existing English translations and all Korean content remain unchanged.

UPDATE notices SET title_en='Administrator account login and website usability update', content_en='■ Overview

Hello, VOLT fleet members.

We have improved account login in the administrator CMS, notice sharing links and gallery photo previews. This update makes administrator access checks clearer and resolves inconveniences when opening shared notices or registering photos.

⸻

■ Main changes

1. Administrator Discord account login

Administrators with the CEO or Executive role can sign in to the CMS using their own Discord account. The account and authorized roles appear in the administrator screen. Editing is blocked when access cannot be verified. The existing administrator password login remains available.

2. Notice sharing links

Opening a link to a newly written CMS notice automatically displays its details. The notice opens even when its data arrives later, and a notice you have closed will not unnecessarily reopen.

3. Gallery photo previews

Photo previews now display correctly when selecting a photo in the CMS. Large photos are reduced for preview, and cancelling an edit clears the selected photo and its preview together.

4. Separate verification environment

We prepared a test environment separate from the live website. Test content and photo storage are isolated, and the CMS identifies the test environment to reduce accidental changes to live data while verifying improvements.

⸻

■ Before and after

Previously, administrator login mainly relied on a shared password. Some links to new notices did not immediately open their details, and photo previews could be blocked by browser security settings.

Authorized administrators can now verify their login through a personal Discord account, and shared links open the intended notice. Photo previews and edit cancellation have also improved.

⸻

■ How to use

Fleet members can continue using the website as usual. Share a notice using its Copy notice link button so the recipient can open it directly.

CEOs and executives should select Sign in with Discord on the administrator page. If already signed in with the administrator password, use Switch to Discord account.

⸻

■ Deployment and verification

These improvements are live. Administrator account login and shared notice links were verified in the actual interface. We also confirmed that notice and photo saves in the test environment are isolated from live content.

⸻

■ Notes

Logging out of the CMS ends the administrator login. The website''s ordinary Discord login is maintained separately. Changes to Discord roles or an inability to verify the account may restrict administrator access.

This update did not bulk-change existing notices, events or gallery content. Refresh the page if an older state remains visible.', tag_en='System', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='notice-56350cf7-625c-4dbb-9441-affada2a889c' AND title='관리자 계정 로그인 및 홈페이지 사용성 개선 업데이트 안내' AND COALESCE(content,'')='■ 내용

안녕하세요, VOLT 함대원 여러분.

관리자 CMS의 계정 로그인과 홈페이지 공지 링크, 갤러리 사진 미리보기를 개선했습니다. 관리자의 접근 권한을 더 명확하게 확인하고, 전달받은 공지를 바로 열거나 사진을 등록할 때 발생하던 불편을 줄이는 업데이트입니다.

⸻

■ 주요 변경 사항

1. 관리자 Discord 계정 로그인

대표이사·임원진 역할의 관리자는 자신의 Discord 계정으로 CMS에 로그인할 수 있습니다. 로그인한 계정과 역할이 관리자 화면에 표시되며, 접근 권한을 확인할 수 없을 때는 편집을 허용하지 않습니다. 기존 관리자 비밀번호 로그인 방식도 사용할 수 있습니다.

2. 공지 공유 링크 개선

CMS에서 새로 작성한 공지의 링크를 열면 해당 공지의 상세 내용이 자동으로 표시됩니다. 공지 데이터를 늦게 받아오는 경우에도 내용을 확인할 수 있으며, 닫은 공지가 다시 불필요하게 열리지 않도록 정리했습니다.

3. 갤러리 사진 미리보기 개선

관리자 CMS에서 사진을 선택했을 때 미리보기 이미지가 정상적으로 표시되도록 수정했습니다. 큰 사진은 미리보기 크기를 줄여 표시하고, 편집을 취소하면 선택한 사진과 미리보기가 함께 정리됩니다.

4. 운영 전 검증 환경 분리

운영 홈페이지와 별도의 테스트 환경을 준비했습니다. 테스트용 콘텐츠와 사진 저장 공간을 분리하고 관리자 화면에 테스트 환경 표시를 추가해, 개선 사항을 확인할 때 운영 데이터를 실수로 수정하는 일을 줄였습니다.

⸻

■ 변경 전·후 한눈에 보기

이전에는 관리자 로그인이 공통 비밀번호 중심이었고, 새 공지의 공유 링크를 열어도 상세 내용이 바로 표시되지 않는 경우가 있었습니다. 사진 미리보기도 브라우저 보안 설정에 따라 나타나지 않을 수 있었습니다.

이제 허용된 관리자는 개인 Discord 계정으로 로그인 상태를 확인할 수 있고, 공유 링크에서 해당 공지를 바로 읽을 수 있습니다. 사진 선택 후 미리보기와 편집 취소 동작도 개선했습니다.

⸻

■ 사용 방법

일반 함대원은 기존처럼 홈페이지를 이용하면 됩니다. 공지의 ‘공지 링크 복사’ 버튼으로 링크를 전달하면 받는 사람이 해당 공지를 바로 확인할 수 있습니다.

대표이사·임원진은 관리자 페이지에서 ‘Discord 계정으로 로그인’을 선택하세요. 기존 관리자 비밀번호로 로그인한 상태라면 ‘Discord 계정으로 전환’ 버튼을 사용할 수 있습니다.

⸻

■ 반영 및 확인 사항

이번 개선 사항은 운영 홈페이지에 반영되었습니다. 관리자 계정 로그인과 공지 공유 링크를 실제 화면에서 확인했고, 테스트 환경의 공지·사진 저장이 운영 콘텐츠와 분리되는 것도 확인했습니다.

⸻

■ 참고 사항

CMS 로그아웃은 관리자 화면의 로그인 상태를 종료합니다. 홈페이지의 일반 Discord 로그인은 별도로 유지됩니다. Discord 역할이 변경되거나 계정 인증을 확인할 수 없는 경우 관리자 접근이 제한될 수 있습니다.

이번 업데이트로 기존 공지, 일정, 갤러리의 운영 콘텐츠를 일괄 변경하지 않았습니다. 화면에 이전 상태가 남아 있으면 새로고침한 뒤 확인해 주세요.' AND updated_at='2026-10-04T15:29:28.323Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='Website stability and gallery optimization update', content_en='■ Overview

We improved website access, login stability and administrator operations, and updated gallery photos to load more efficiently.

The update preserves existing content and original photos while improving reliability during website use and updates.

⸻

■ Main changes

Gallery list image optimization

We added small preview images for the two existing gallery photos. Their combined list-image size fell from approximately 5.26 MB to 49.6 KB, a reduction of about 99%. Previews are WebP images with a maximum dimension of 640 px.

Original photos, titles, descriptions, dates and publication states are preserved. Opening a photo at full size still shows the original.

Access and Discord login verification

We revised access paths, caching and security settings. After an actual Discord login, we confirmed that My Page correctly displayed the profile, roles and membership state.

Administrator CMS improvements

Content editing is separated from image and data cleanup. Change history and restoration are now available in production.

We fixed a security-setting issue that blocked thumbnail generation for existing photos. Conversion failures are now reported separately from cases where the image size simply remains unchanged.

Conflicts with another edit while saving a thumbnail are reported, and unsaved temporary files are cleaned up.

Update verification procedure

Production updates are now published only after all automated checks for that exact version succeed. Versions with pending or failed checks are withheld. We also verify that the current version is served after deployment.

⸻

■ Before and after

Gallery lists
Before: originals loaded in the list
After: small previews used while preserving originals

Thumbnail results
Before: some conversion failures appeared as unchanged size
After: successful optimization, unchanged size and conversion errors are distinguished

Production updates
Before: deployment and automated checks ran at the same time
After: deployment follows successful checks for that version

⸻

■ How to use

Gallery
Go to More → Gallery in the navigation. Select a photo to view the original at a larger size.

My Page
After signing in with Discord, check your profile, roles and membership state on My Page.

Administrator CMS
Use Image and data cleanup → Data and image cleanup to optimize existing gallery thumbnails. Change history and restoration are available in the content editor.

⸻

■ Deployment and verification

All 211 server checks and 317 interface checks passed. Automated checks, production deployment and post-deployment verification completed. Optimization of the two existing gallery photos produced two successes and no errors.

⸻

■ Notes

No additional installation or settings changes are required. An already-open page may retain older images; refresh it if the latest state is not visible. We will continue publishing update details and usage instructions in fleet-wide notices after completing updates.', tag_en='System', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='notice-0556841a-bdb4-4976-ad16-1edca1e17b5b' AND title='홈페이지 안정성 개선 및 갤러리 최적화 업데이트 안내' AND COALESCE(content,'')='■ 내용

VOLT 웹사이트의 접속·로그인 안정성과 관리자 운영 기능을 개선하고, 갤러리 사진을 더 가볍게 볼 수 있도록 업데이트했습니다.

이번 개선은 기존 콘텐츠와 사진 원본을 유지하면서, 홈페이지 이용과 업데이트 과정의 안정성을 높이는 데 초점을 맞췄습니다.

⸻

■ 주요 변경 사항

갤러리 목록 이미지 최적화

기존 갤러리 사진 2건에 작은 미리보기 이미지를 추가했습니다.

목록용 이미지의 합계 용량은 약 5.26MB에서 49.6KB로 줄어 약 99% 감소했습니다. 미리보기는 가로·세로 중 긴 변이 최대 640px인 WebP 이미지로 제공됩니다.

사진의 원본, 제목, 설명, 날짜와 게시 상태는 그대로 유지했습니다. 사진을 크게 볼 때는 기존 원본을 확인할 수 있습니다.

접속 및 Discord 로그인 점검

홈페이지 접속 경로와 캐시·보안 설정을 정비했습니다.

실제 Discord 로그인 후 마이페이지에서 프로필, 역할과 멤버 상태가 정상적으로 표시되는 것을 확인했습니다.

관리자 CMS 운영 개선

콘텐츠 편집과 이미지·데이터 정리 작업을 구분하고, 변경 이력 확인과 복구 기능을 운영에 반영했습니다.

기존 사진의 썸네일 생성이 보안 설정에 막히던 문제를 수정했습니다. 이미지 변환이 실패한 경우에는 단순히 크기를 유지한 경우와 구분해 결과를 안내합니다.

새로운 썸네일을 저장할 때 다른 수정과 충돌하면 해당 결과를 안내하고, 저장되지 않은 임시 파일을 정리합니다.

업데이트 검증 절차 개선

앞으로 운영 업데이트는 해당 버전의 자동 검사가 모두 성공한 뒤 반영됩니다.

검사 중이거나 실패한 버전은 공개되지 않도록 절차를 보완했으며, 운영 반영 후에도 최신 버전이 정상 제공되는지 다시 확인합니다.

⸻

■ 변경 전·후 한눈에 보기

갤러리 목록
기존: 사진 원본을 목록에서도 불러옴
변경: 작은 미리보기 이미지를 사용하고 원본은 보존

썸네일 생성 결과
기존: 일부 변환 실패가 크기 유지로 표시됨
변경: 최적화 성공, 크기 유지와 변환 오류를 구분

운영 업데이트
기존: 배포와 자동 검사가 동시에 진행됨
변경: 해당 버전의 검사 성공 후 운영 반영

⸻

■ 사용 방법

갤러리
상단 메뉴의 더보기 → 갤러리로 이동합니다.
사진을 선택하면 큰 화면에서 원본을 확인할 수 있습니다.

마이페이지
Discord 로그인 후 마이페이지에서 프로필, 역할과 멤버 상태를 확인할 수 있습니다.

관리자 CMS
이미지·데이터 정리 → 데이터와 이미지 정리에서 기존 갤러리 썸네일 최적화를 실행할 수 있습니다.
콘텐츠 편집 화면에서는 변경 이력과 복구 기능을 확인할 수 있습니다.

⸻

■ 반영 및 확인 사항

서버 검사 211개와 화면 검사 317개가 모두 통과했습니다.

자동 검사 성공 후 운영 배포와 배포 후 확인까지 완료했으며, 기존 갤러리 2건의 최적화 결과는 성공 2건, 오류 0건입니다.

⸻

■ 참고 사항

별도의 프로그램 설치나 설정 변경은 필요하지 않습니다.

이미 열어둔 페이지에는 이전 이미지가 남아 있을 수 있습니다. 최신 상태가 보이지 않으면 페이지를 새로고침해 주세요.

앞으로도 업데이트가 완료되면 전체 공지를 통해 변경 내용과 사용 방법을 안내하겠습니다.' AND updated_at='2026-10-04T14:49:27.719Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='Ship Database 2.0 major update', content_en='■ Overview

The VOLT website''s Ship Database has been redesigned as version 2.0.

Version 1.0 focused on basic information such as manufacturer, role, cargo capacity and short descriptions. Version 2.0 brings detailed specifications, in-game purchase locations, rental information, lowest prices and Korean descriptions together in the ship detail screen.

Use it as a practical reference when buying ships, preparing operations, assembling a fleet or comparing ships.

⸻

■ Main changes

More detailed specifications

Ship details now include more performance information:
HP
Speed: SCM / boost / NAV
Handling: pitch / yaw / roll
Cargo capacity
Dimensions
Mass
Hydrogen / quantum fuel
Insurance claim / expedited claim times

You can compare the performance needed for actual operations in more detail, beyond a ship''s general role.

In-game purchase and rental information

Check whether each ship can be purchased or rented in-game, along with purchase locations, rental locations and the lowest price. You can find these directly in the ship details without a separate search.

Improved Korean descriptions

Ship descriptions have been revised. VOLT''s original descriptions were replaced with Korean translations based on official English descriptions. Reviewed translations that consider meaning and context were used, rather than unreviewed automatic translation.

Ongoing updates

Specifications and purchase information can change with game patches. Version 2.0 supports administrator synchronization to refresh values from community-standard data sources. We intend to keep updating specifications and locations as patches change them.

⸻

■ Version 1.0 → 2.0

Data
Before: basic information
After: detailed specifications and purchase-location data

Specifications
Before: roles, cargo and other summaries
After: speed, handling, HP, dimensions, fuel and insurance details

Purchase information
Before: unavailable
After: purchase locations, rentals and lowest prices

Descriptions
Before: VOLT''s own descriptions
After: reviewed Korean translations based on official descriptions

Freshness
Before: mainly manual updates
After: resynchronization from data sources

⸻

■ Scope

At the time of this update, detailed data was matched to 210 of the 247 registered ships. No data conflicts were found. Some newly released or older ships will be added as their purchase locations and specifications are verified.

⸻

■ How to use

Open the VOLT website and select Ship Database in the navigation. Select a ship to view basic information, detailed specifications, speed and handling, cargo, fuel, insurance claim times, in-game purchase locations, rentals, lowest prices and Korean descriptions.

Use these as references for buying ships, operating them, preparing operations and assembling fleet groups.

⸻

■ Notes

Displayed figures come from community-standard data sources. Star Citizen patches may change prices, purchase locations, performance and insurance times. Check the values in-game before purchasing or deploying a ship.', tag_en='System', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='notice-d8120d35-783f-44b3-b147-979b52c288bd' AND title='함선 데이터베이스 2.0 대규모 업데이트 안내' AND COALESCE(content,'')='■ 내용

VOLT 웹사이트의 함선 데이터베이스가 2.0으로 전면 개편되었습니다.

기존 1.0 버전이 제조사, 역할, 화물량, 간단 설명 등 기본 정보 중심이었다면, 이번 2.0 버전은 함선 상세 화면에서 실측 스펙, 인게임 구매처, 렌탈 정보, 최저가, 한국어 설명까지 한 번에 확인할 수 있도록 개선되었습니다.

함선 구매, 작전 준비, 함대 편성, 함선 비교 시 더 실용적인 참고 자료로 활용할 수 있습니다.

⸻

■ 주요 변경 사항

상세 스펙 추가

함선 상세 화면에서 기존보다 더 많은 성능 정보를 확인할 수 있습니다.

HP
속도: SCM / 부스트 / NAV
기동 성능: 피치 / 요 / 롤
화물 적재량
함선 치수
질량
수소 연료 / 퀀텀 연료
보험 청구 시간 / 신속 청구 시간

이제 단순히 함선 역할만 보는 것이 아니라, 실제 운용에 필요한 성능을 더 구체적으로 비교할 수 있습니다.

인게임 구매처 및 렌탈 정보 추가

함선별로 인게임에서 구매 또는 대여할 수 있는 위치와 가격 정보를 확인할 수 있습니다.

인게임 구매 가능 여부
구매처
렌탈 가능 여부
렌탈 위치
최저가

함선을 찾은 뒤 별도로 구매처를 검색하지 않아도, 함선DB 상세 화면에서 바로 확인할 수 있습니다.

한국어 설명 개선

함선 설명문이 새로 정리되었습니다.

기존 VOLT 자체 설명 중심에서, 공식 영어 설명을 기반으로 한 한국어 번역 설명으로 교체했습니다.

해당 설명은 단순 자동 번역이 아니라, 의미와 문맥을 확인한 검수본 기준으로 반영했습니다.

상시 갱신 구조 적용

함선 수치와 구매 정보는 게임 패치에 따라 변경될 수 있습니다.

이번 2.0 개편에서는 관리자 동기화를 통해 커뮤니티 표준 데이터 소스 기준 최신값을 다시 반영할 수 있는 구조를 적용했습니다.

추후 패치로 함선 스펙이나 구매처가 바뀌더라도, 데이터 동기화를 통해 계속 갱신할 예정입니다.

⸻

■ 1.0 → 2.0 한눈에 보기

데이터
기존: 기본 정보 중심
변경: 실측 스펙 + 구매처 기반 상세 데이터
함선 스펙
기존: 역할, 화물량 등 요약 정보
변경: 속도, 기동, HP, 치수, 연료, 보험 등 상세 정보
구매 정보
기존: 없음
변경: 인게임 구매처, 렌탈 정보, 최저가 표시
설명문
기존: VOLT 자체 설명
변경: 공식 설명 기반 한국어 번역 설명
최신성
기존: 수동 갱신 중심
변경: 데이터 소스 기준 재동기화 지원

⸻

■ 반영 규모

현재 등록 함선 247척 중 210척에 실측 데이터를 매칭했습니다.

데이터 충돌은 0건으로 확인되었습니다.

일부 신규 출시 함선 또는 구형 함선은 구매처와 스펙 확인 후 순차적으로 반영될 예정입니다.

⸻

■ 사용 방법

VOLT 웹사이트 접속 후 상단 메뉴에서 함선 데이터베이스로 이동합니다.

원하는 함선을 선택하면 상세 화면에서 아래 정보를 확인할 수 있습니다.

기본 정보
상세 스펙
속도 및 기동 성능
화물량
연료 정보
보험 청구 시간
인게임 구매처
렌탈 정보
최저가
한국어 설명

함선 구매, 운용, 작전 준비, 함대 편성 시 참고 자료로 활용해 주세요.

⸻

■ 참고 사항

함선DB에 표시되는 수치는 커뮤니티 표준 데이터 소스를 기준으로 반영됩니다.

다만 Star Citizen의 특성상 게임 패치에 따라 함선 가격, 구매처, 성능 수치, 보험 시간 등이 변경될 수 있습니다.

실제 구매나 작전 투입 전에는 인게임에서 한 번 더 확인하는 것을 권장합니다.' AND updated_at='2026-07-12T02:19:19.245Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='Trade Planner major update and usage guide', content_en='■ Overview

The VOLT Trade Planner has received a major update. It now supports profit management across multiple commodities for actual trading operations, expanding its previous simple calculation workflow.

Fleet members can use ship cargo capacity to inspect UEX trade candidates and accumulate purchases, sales and profits for multiple commodities in one profit table.

■ Main changes

UEX live trade candidates

Search for a commodity to view UEX buy and sell candidates. Information includes trade locations, unit prices, estimated purchase cost, sale revenue, profit and return.

Filter candidates by All, Stations / Cities or Outposts. Star-system filters help narrow candidates to the location of your operation.

Profit ledger

Select buy and sell candidates and enter a quantity in SCU to add the trade to the profit table. The table shows commodity, purchase location, sale location, quantity, total purchase cost, total sale revenue, estimated profit and overall totals.

Add multiple commodities repeatedly to plan a route covering several goods.

Saving and managing the table

Entries are saved in your browser and remain after refreshing. You can delete individual entries, clear the entire table, retain saved entries, check cargo utilization and see an overload indication when cargo capacity is exceeded. Clearing browser cache or site data may remove the saved table.

■ How to use

Open the VOLT website.
Go to Trade → Trade Planner.
Select a ship or enter cargo capacity in SCU manually.
Search for a commodity.
Select buy and sell candidates.
Enter a quantity.
Click Add to profit table.
Check total purchase cost, sale revenue and estimated profit at the bottom.

Example commodities: Gold, Beryl, Laranite, Titanium, Diamond and Medical Supplies.

You can use the planner without selecting a ship by entering cargo capacity manually. Mobile access is supported, although desktop use is recommended because the planner displays a large amount of information.

■ Example uses

Calculate personal trade routes in advance.
Plan loading for large cargo ships.
Compare profits across multiple commodities.
Prepare fleet trading operations.
Review safer station/city routes.
Assess the risks of high-return outpost routes.
Compare cargo efficiency across ships.

For mixed cargo, add each commodity to the table to inspect overall profitability instead of calculating every item separately.

■ Usage notes

Trade candidates use UEX data. In-game prices may temporarily differ, and candidates may load slowly or be unavailable depending on the UEX API. Even with a high return, consider distance, security and outpost access difficulty. Calculations support planning and do not guarantee profit. Deleting browser storage may erase the table.

■ Planned improvements

The Trade Planner will continue to improve. Areas under consideration include clearer UEX error messages, more reliable saved tables, mobile usability, examples linked to notices and guides, and sharing trading routes for fleet operations.', tag_en='System', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='notice-7ab096ee-05dc-4a0f-8196-1ef6daee35ee' AND title='무역플래너 대규모 업데이트 안내 및 사용 방법' AND COALESCE(content,'')='■ 내용
VOLT 웹사이트의 무역플래너가 대규모로 업데이트되었습니다.

이번 업데이트의 핵심은 기존의 단순 계산 중심 구조에서 벗어나, 실제 무역 운영 중 사용할 수 있는 다품목 수익 관리 도구로 개편된 것입니다.

이제 함대원은 함선 적재량을 기준으로 UEX 거래 후보를 확인하고, 여러 무역품의 매수·매도·수익을 하나의 수익표에 누적해 관리할 수 있습니다.

■ 주요 변경 사항

UEX 실시간 거래 후보 연동

무역품을 검색하면 UEX 기준 매수·매도 후보를 확인할 수 있습니다.

확인 가능한 정보는 다음과 같습니다.

매수 후보 / 매도 후보
거래 위치
매수·매도 단가
예상 매수 비용
예상 매도 금액
예상 이윤
수익률

또한 거래 후보는 아래 기준으로 필터링할 수 있습니다.

전체
스테이션 / 도시
지상기지

항성계 필터도 제공되므로, 작전 위치에 맞춰 거래 후보를 좁혀 볼 수 있습니다.

수익 관리 원장 추가

매수 후보와 매도 후보를 선택한 뒤 수량(SCU)을 입력하면, 해당 거래를 수익표에 추가할 수 있습니다.

수익표에서는 다음 항목을 한 번에 확인할 수 있습니다.

무역품
구입처
판매처
수량
총매수 금액
총매도 금액
예상 이윤
전체 합계

여러 상품을 반복해서 추가할 수 있으므로, 단일 품목이 아니라 복수 품목 무역 루트를 계획할 때 유용합니다.

수익표 저장 및 관리

수익표에 추가한 항목은 브라우저에 저장됩니다.

따라서 페이지를 새로고침해도 입력한 수익표가 유지됩니다.

지원되는 관리 기능은 다음과 같습니다.

개별 항목 삭제
전체 비우기
저장된 수익표 유지
함선 적재량 기준 사용량 확인
적재량 초과 시 과적 상태 표시

단, 브라우저 캐시 또는 사이트 데이터를 삭제하면 저장된 수익표도 사라질 수 있습니다.

■ 사용 방법

VOLT 웹사이트 접속
상단 메뉴에서 무역 → 무역플래너 이동
사용할 함선 선택 또는 화물량(SCU) 직접 입력
거래할 무역품 검색
매수 후보와 매도 후보 선택
거래 수량 입력
수익표에 추가 클릭
수익표 하단에서 총매수·총매도·총예상 이윤 확인

예시 상품:

Gold
Beryl
Laranite
Titanium
Diamond
Medical Supplies

함선을 선택하지 않아도 수동으로 화물량을 입력해 사용할 수 있습니다.

모바일에서도 접근 가능하지만, 무역플래너는 표시 정보가 많기 때문에 가능하면 데스크톱 환경에서 사용하는 것을 권장합니다.

■ 활용 예시

무역플래너는 다음 상황에서 활용할 수 있습니다.

개인 무역 루트 사전 계산
대형 화물선 적재 계획 수립
복수 품목 수익 비교
함대 단위 무역 작전 준비
스테이션/도시 중심 안전 루트 검토
지상기지 고수익 루트 위험도 검토
함선별 적재 효율 비교

특히 여러 품목을 한 번에 싣는 경우, 개별 상품을 따로 계산하지 않고 수익표에 누적해 전체 수익성을 확인할 수 있습니다.

■ 사용 시 주의사항

무역플래너는 UEX 데이터를 기반으로 거래 후보를 표시합니다.

따라서 아래 사항을 유의해 주세요.

실제 게임 내 가격과 UEX 데이터가 일시적으로 다를 수 있습니다.
UEX API 상태에 따라 후보가 늦게 표시되거나 조회되지 않을 수 있습니다.
수익률이 높더라도 이동 거리, 보안 상황, 지상기지 접근 난이도를 함께 고려해야 합니다.
수익표의 계산 결과는 작전 계획 보조용이며, 실제 수익을 보장하지 않습니다.
브라우저 저장 데이터를 삭제하면 수익표 내용도 사라질 수 있습니다.

■ 향후 개선 예정

무역플래너는 앞으로도 지속적으로 개선될 예정입니다.

검토 중인 개선 방향은 다음과 같습니다.

UEX 데이터 오류 안내 강화
저장된 수익표 안정성 개선
모바일 화면 사용성 개선
공지 및 가이드와 연계한 사용 예시 추가
함대 작전용 무역 루트 공유 기능 검토' AND updated_at='2026-07-12T02:19:24.542Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='Appointment of the Chief of Defence Officer (CDO)', content_en='■ Effective date
[2026-06-17]

■ Decision
@새달콤달 김유자 (Freedom06), Defence Director, is appointed Chief of Defence Officer (CDO).

■ Background / reason
The member has consistently expressed interest in participating in fleet activities and made a substantial contribution to writing the operations manual.

■ Main responsibilities
Develop overall cooperation and ideas for fleet operations.
Take responsibility for comprehensive defence planning when a station is built in the future.', tag_en='Notice', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='notice-bf270ad0-3b38-414c-a3a9-5693a653646e' AND title='최고방위책임자(CDO, Chief of Defence Officer) 임명' AND COALESCE(content,'')='■ 발효일
[2026-06-17]

■ 결정 사항
@새달콤달 김유자(Freedom06) [방위이사]을 최고방위책임자(CDO, Chief of Defence Officer) 에 임명한다.

■ 배경 / 사유
평소 함대 활동에 적극적으로 참여 의사를 표했으며 작전 교범 작성에 큰 도움을 줌

■ 주요 담당 업무
함대 작전에 있어 전반적인 협력과 아이디어를 확립
추후 스테이션 건설시 종합적인 방어 대책을 전담할 예정' AND updated_at='2026-07-12T02:18:04.121Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='Appointment of a diplomat for Japanese relations', content_en='■ Effective date
[2026-06-13]

■ Appointee
@아카시엘라 (𝓐𝓴𝓪𝓼𝓲𝓮𝓵𝓵𝓪) is appointed Diplomat.

■ Reason
The member has strong Japanese-language skills and has actively participated in fleet activities.

■ Main responsibilities
Relations with foreign fleets, primarily Japanese fleets.
Act as a bridge between the executive team and foreign fleets.', tag_en='Notice', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='notice-dcedff90-3648-44fc-bc19-494bb282e416' AND title='JP부분 외교관 임명' AND COALESCE(content,'')='■ 발효일
[2026-06-13]

■ 임명 인원
@아카시엘라(𝓐𝓴𝓪𝓼𝓲𝓮𝓵𝓵𝓪)를 @외교관 으로 임명한다.

■ 임명 이유
위 함대원은 함대 내에서 일본어 구사 능력이 우수하며 평소 함대 활동에 적극적으로 참여하였음

■ 주요 담당 업무
외국 함대와의 교류(JP 위주)
임원진과 외국 함대와의 중간다리' AND updated_at='2026-07-12T02:18:17.329Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='Mutual partnership with Black Deep Group', content_en='■ Partner introduction

Black Deep Group (BDG)
Representative: @Jennie
Orientation: Lawful / neutral multi-role organization
Divisions: Black Deep Inc. / Black Deep Service
Primary fields: industry, logistics, resource operations, security, protection and military operations support

Black Deep Group comprises Black Deep Inc., responsible for industry, and Black Deep Service, responsible for security and military operations support. As a lawful organization, it prohibits criminal acts and aims to establish a stable activity base through neutral operations.

━━━━━━━━━━━━━━━━━━━

■ Partnership direction

The partnership recognizes how VOLT''s logistics, trading, transport and information operations can complement BDG''s industry, security and operations support.

VOLT values practical cooperation that connects each organization''s strengths when needed during real activities, beyond a purely nominal relationship. Both organizations will preserve their independence and operating principles, discussing relevant matters before cooperating.

━━━━━━━━━━━━━━━━━━━

■ Main areas of cooperation

Industry and logistics
Mutual cooperation in acquiring resources, managing supplies, transport and industrial activities.

Security and escort support
Discuss protection, escort and security assistance against threats arising during logistics, trade and resource operations.

Defensive cooperation
Review situations and provide mutual support when clear threats arise, such as unjustified attacks, looting, piracy or persistent harassment.

Training and exchanges
Practical exchanges and training in communications, combat fundamentals, infantry fundamentals and understanding operations.

Information exchange
Share information about operational stability, market conditions, risks and practical experience.

━━━━━━━━━━━━━━━━━━━

■ Notes

This is a situational cooperation relationship based on neutrality and legitimacy, rather than an offensive military alliance. VOLT retains its independent operating policy and mission priorities, while BDG retains neutrality and its lawful principles.

Please respect Black Deep Group and Black Deep Service members as friendly partners.

━━━━━━━━━━━━━━━━━━━

We hope this partnership strengthens VOLT''s logistics, trading and operational stability and develops into a cooperative framework that provides practical benefits to both organizations.', tag_en='Notice', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='notice-47bf053d-09f2-4fea-8342-374b03f2c0b4' AND title='Black Deep Group 상호 파트너십 체결 안내' AND COALESCE(content,'')='■ 파트너 조직 소개

Black Deep Group (BDG)
대표: @Jennie 
성향: Lawful / 중립 기반 복합 ORG
구성: Black Deep Inc. / Black Deep Service
주력 분야: 산업, 물류, 자원 운용, 보안, 경호, 군사 작전 지원

Black Deep Group은 산업 분야를 담당하는 Black Deep Inc.와 보안 및 군사 작전 지원을 담당하는 Black Deep Service로 구성된 복합 조직입니다.

해당 조직은 Lawful ORG로서 범죄 행위를 금지하고 있으며, 중립적인 운영 기조를 바탕으로 안정적인 활동 기반을 형성하는 것을 목표로 하고 있습니다.

━━━━━━━━━━━━━━━━━━━

■ 체결 방향

이번 파트너십은 VOLT의 물류·무역·수송·정보 운용 역량과 BDG의 산업·보안·작전 지원 역량이 서로 보완될 수 있다는 판단 아래 체결되었습니다.

VOLT는 단순한 명목상의 관계보다, 실제 활동 과정에서 필요한 순간에 서로의 강점을 연결할 수 있는 실질적인 협력 관계를 중요하게 보고 있습니다.

이에 따라 양 조직은 각자의 독립성과 운영 원칙을 유지하면서, 필요한 사안에 대해 협의 후 협력하는 방향으로 관계를 이어갈 예정입니다.

━━━━━━━━━━━━━━━━━━━

■ 주요 협력 범위

산업 및 물류 협력
자원 확보, 물자 운용, 수송 및 산업 활동 과정에서의 상호 협력

보안 및 호송 지원
물류·무역·자원 운용 중 발생할 수 있는 위협 상황에 대한 경호, 호송, 보안 지원 협의

방어적 협력
부당한 공격, 약탈, 해적 행위, 지속적인 괴롭힘 등 명백한 위협 발생 시 상황 검토 후 상호 지원

교육 및 교류
통신, 전투 기초, 보병 기초, 작전 이해도 향상을 위한 교육 및 실무 교류

정보 교류
작전 안정성, 시장 상황, 위험 요소, 활동 노하우 등에 대한 상호 정보 공유

━━━━━━━━━━━━━━━━━━━

■ 안내 사항

이번 파트너십은 공격적 군사 동맹이 아닌, 중립성과 정당성을 바탕으로 한 상황별 협력 관계입니다.

VOLT는 함대의 독립적인 운영 방침과 임무 우선순위를 유지하며, BDG 역시 중립성과 Lawful ORG 원칙을 유지하는 것을 전제로 협력하게 됩니다.

함대원 여러분께서는 Black Deep Group 및 Black Deep Service 소속 인원분들을 우호 파트너로서 존중해 주시기 바랍니다.

━━━━━━━━━━━━━━━━━━━

이번 파트너십이 VOLT의 물류·무역·작전 안정성을 강화하고, 양 조직 모두에게 실질적인 도움이 되는 협력 체계로 발전하기를 기대합니다.' AND updated_at='2026-06-14T15:04:08.664Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='Promotion to Human Resources and Finance Director', content_en='■ Member promoted
@아마그란데 (AmAgrande), Human Resources Director

■ New positions
@CFO (Finance) @CHRO (Human Resources)

━━━━━━━━━━━━━━━━━━━
■ Main responsibilities
• Fleet personnel management and support for organizational operations
• Guidance and settling-in support for new members
• Financial management and support for fleet asset operations
• Support for executive decision-making

━━━━━━━━━━━━━━━━━━━
■ Announcement
AmAgrande has consistently participated diligently and responsibly in fleet activities, earning trust through fleet operations and member support.

Following executive discussion, AmAgrande is promoted and appointed Human Resources and Finance Director.

Please offer your cooperation and encouragement as we work toward more stable personnel and financial operations.

━━━━━━━━━━━━━━━━━━━', tag_en='Notice', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='notice-a2111166-7ceb-4a7b-9720-4bc7a613e92b' AND title='인사·재무 이사 승진 공지' AND COALESCE(content,'')='■ 승진 대상
@아마그란데(AmAgrande) [인사이사]

■ 승진 직책
@CFO(재무) @CHRO(인사)

━━━━━━━━━━━━━━━━━━━
■ 주요 담당 업무
• 함대 인사 관리 및 조직 운영 보조
• 신규 함대원 안내 및 정착 지원
• 재무 관리 및 함대 자산 운용 보조
• 운영진 의사결정 과정 지원

━━━━━━━━━━━━━━━━━━━
■ 안내 사항
아마그란데님은 그동안 함대 내 여러 활동에서 성실한 참여와 책임감 있는 모습을 보여주셨으며, 함대 운영과 구성원 지원에 있어 충분한 신뢰를 쌓아오셨습니다.

이에 따라 운영진 논의를 거쳐 아마그란데님을 인사·재무 이사로 승진 임명합니다.

앞으로 함대 인사와 재무 분야에서 보다 안정적인 운영이 이루어질 수 있도록 많은 협조와 응원 부탁드립니다.

━━━━━━━━━━━━━━━━━━━' AND updated_at='2026-06-14T15:03:44.193Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='Mutual partnership with HMC', content_en='■ Partner fleet introduction

Hanza Merchant Corporation (HMC)
Fleet leader: @natsuba
Orientation: pacifist merchant fleet
Primary fields: player-to-player item trading, supply sales and commercial activities

━━━━━━━━━━━━━━━━━━━

■ Partnership direction

This friendly cooperation relationship is based on both fleets'' activity directions and mutual benefit.

VOLT focuses on logistics, trading, transport, information operations and strategic resource acquisition. HMC is a merchant fleet focused on pacifist commercial activities and supply trading.

Both fleets will respect each other''s independence and operating policies and maintain stable cooperation within the necessary scope.

━━━━━━━━━━━━━━━━━━━

■ Main areas of cooperation

PVE cooperation
Mutual support for purely PVE content such as TSG.

Defensive military cooperation
Review situations and provide mutual defensive support in response to first strikes, looting or unjustified threats.

Trade exchanges
Share trade items through the VOLT Trade Hub and connect commercial activities.

Information exchanges
Share market information, trading experience and supply management information.

━━━━━━━━━━━━━━━━━━━

■ Notes

This is a friendly cooperation relationship supporting mutual benefit and a stable activity base, rather than an offensive military alliance.

Please warmly welcome HMC members as friendly partners.

━━━━━━━━━━━━━━━━━━━

We look forward to VOLT and HMC growing together by building on each other''s strengths.', tag_en='Notice', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='notice-d22526ba-cece-4773-823f-69207663edf4' AND title='HMC 상호 파트너십 체결 안내' AND COALESCE(content,'')='■ 파트너 함대 소개

Hanza Merchant Corporation (HMC)
함대장: @natsuba
성향: 평화주의 기반 상인 함대
주력 분야: 유저 간 아이템 거래, 물자 판매, 상업 활동

━━━━━━━━━━━━━━━━━━━

■ 체결 방향

이번 파트너십은 양 함대의 활동 방향과 상호 이익을 바탕으로 체결된 우호 협력 관계입니다.

VOLT는 물류, 무역, 수송, 정보 운용 및 전략 자원 확보를 중심으로 활동하는 함대이며, HMC는 평화주의 기반의 상업 활동과 물자 거래를 중심으로 운영되는 상인 함대입니다.

양 함대는 서로의 독립성과 운영 방침을 존중하며, 필요한 범위 안에서 안정적인 협력 관계를 이어갈 예정입니다.

━━━━━━━━━━━━━━━━━━━

■ 주요 협력 범위

PVE 협력
TSG 등 순수 PVE 콘텐츠 진행 시 상호 지원

방어적 군사 협력
선제 공격, 약탈, 부당한 위협 발생 시 상황 검토 후 상호 방어 지원

무역 교류
VOLT 무역허브를 통한 거래 품목 공유 및 상업 활동 연계

정보 교류
시장 정보, 거래 노하우, 물자 운용 정보 상호 공유

━━━━━━━━━━━━━━━━━━━

■ 안내 사항

이번 파트너십은 공격적 군사 동맹이 아닌, 상호 이익과 안정적인 활동 기반을 위한 우호 협력 관계입니다.

함대원 여러분께서는 HMC 함대원분들을 우호 파트너로서 따뜻하게 맞이해 주시기 바랍니다.

━━━━━━━━━━━━━━━━━━━

앞으로 VOLT와 HMC가 서로의 강점을 바탕으로 함께 성장하는 관계가 되기를 기대합니다.' AND updated_at='2026-06-14T15:03:08.087Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='TSG operation changed from joint to VOLT-only', content_en='The TSG operation scheduled for Sunday, May 31 at 7 PM has changed from a joint operation with MJO to a VOLT-only operation. The schedule remains unchanged. Detailed plans and ship assignments will be provided in a separate notice.', tag_en='Operation', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='notice-3cdb860d-e24d-4331-9901-b670cf46580f' AND title='TSG 작전 일정 변경 안내 (연합 → 단독)' AND COALESCE(content,'')='5월 31일(일) 오후 7시 예정된 TSG 작전이 MJO 연합 합동에서 VOLT 함대 단독 작전으로 변경되었습니다. 일정은 동일하게 유지되며, 세부 작전 계획 및 함선 배정은 별도 공지를 통해 안내드릴 예정입니다.' AND updated_at='2026-05-25T08:47:30.663Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='VOLT operating policy takes effect', content_en='The VOLT operating policy takes effect on May 15, 2026. Please read the full policy, including nickname rules, violations and penalties for accumulated warnings. Details are available in the fleet rules channel and on the official website.', tag_en='Notice', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='notice-cec2ce62-bae3-403c-b48c-8aabd25051c6' AND title='VOLT 운영정책 정식 시행 안내' AND COALESCE(content,'')='2026년 5월 15일부터 VOLT 운영정책이 정식 적용됩니다. 닉네임 규정, 위반 항목, 누적 경고 제재 등 전문을 반드시 숙지해 주시기 바랍니다. 자세한 내용은 함대-규칙 채널 및 공식 홈페이지에서 확인 가능합니다.' AND updated_at='2026-07-12T02:14:44.431Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='Official website redesign launched', content_en='The official website has been redesigned to communicate the fleet''s identity and direction clearly. Explore leadership introductions, fleet history, the Trade Hub, operating policy and other key information.', tag_en='System', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='ann-006' AND title='공식 홈페이지 리뉴얼 오픈' AND COALESCE(content,'')='함대 정체성과 방향성을 명확히 보여주기 위한 공식 홈페이지가 새롭게 개편되었습니다. 임원진 소개, 연혁, 무역허브, 운영정책 등 주요 정보를 확인하실 수 있습니다.' AND updated_at='2026-07-12T02:19:29.323Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='VOLT × MJO joint exchange operation completed', content_en='A joint exchange operation with MJO was successfully held on February 22, 2026 to strengthen friendly cooperation. Polaris operations and ambush missions helped build trust between the two fleets.', tag_en='Operation', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='notice-ee942627-e8d5-4831-9b2a-88da39042cdb' AND title='VOLT × MJO 합동 교류 작전 완료' AND COALESCE(content,'')='2026년 2월 22일 MJO 함대와의 친선 협력 강화를 위한 합동 교류 작전이 성공적으로 진행되었습니다. 폴라리스 운용 및 매복 미션을 통해 양 함대 간 신뢰를 쌓는 계기가 되었습니다.' AND updated_at='2026-05-25T08:47:44.260Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='VOLT AI Discord bot officially launched', content_en='The Google Gemini-powered VOLT AI bot has officially launched on Discord. Features include Ship Database searches and detailed AI analysis. Check the database-ai channel for usage instructions.', tag_en='System', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='notice-eb8325e4-6537-449c-9f35-366e73d164df' AND title='VOLT AI 디스코드 봇 공식 오픈' AND COALESCE(content,'')='Google Gemini 기반의 VOLT AI 봇이 디스코드에 공식 오픈되었습니다. 함선 데이터베이스 검색, AI 정밀 분석 등 다양한 기능을 이용하실 수 있습니다. 자세한 사용법은 데이터베이스-ai 채널을 확인해 주세요.' AND updated_at='2026-05-25T08:47:57.651Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='VOLT Trade Hub officially opened', content_en='The fleet''s integrated trading system, VOLT Trade Hub, is now open. Dedicated Discord channels support trading in-game items and recruiting for short-term missions.', tag_en='System', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='ann-002' AND title='VOLT-무역허브 공식 개설' AND COALESCE(content,'')='함대 전용 통합 교역 시스템 VOLT-무역허브가 공식 개설되었습니다. 인게임 아이템 거래 및 단기 임무 모집을 디스코드 내 전용 채널에서 진행할 수 있습니다.' AND updated_at='2026-05-25T06:59:04.247Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='Lazarus Complex raid completed', content_en='The first official group operation of the second half of the year was successfully completed. Around ten fleet members split into attack and defence teams for a cooperative mission at Lazarus Complex in the Pyro system.', tag_en='Operation', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='ann-001' AND title='Lazarus Complex 레이드 완료' AND COALESCE(content,'')='하반기 첫 공식 단체 작전이 성공적으로 완료되었습니다. Pyro 시스템 Lazarus Complex에서 10명 내외 함대원이 공격팀·방어팀으로 나뉘어 협동 임무를 수행하였습니다.' AND updated_at='2026-05-25T06:59:04.247Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE notices SET title_en='VOLT official website launched', content_en='The VOLT fleet''s official website is now live. Explore leadership introductions, fleet history, the Ship Database, trading guides, operating policy and more. The website will continue to receive updates; we hope you find it useful.', tag_en='System', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='notice-3e1558a1-7eb8-4bd7-9a15-d34e26390060' AND title='VOLT 공식 홈페이지 정식 오픈' AND COALESCE(content,'')='VOLT 함대 공식 홈페이지가 정식 오픈되었습니다. 임원진 소개, 함대 연혁, 함선 데이터베이스, 무역 가이드, 운영정책 등 다양한 정보를 확인하실 수 있습니다. 앞으로도 지속적으로 업데이트될 예정이니 많은 이용 부탁드립니다.' AND updated_at='2026-07-12T02:19:33.369Z' AND COALESCE(title_en,'')='' AND COALESCE(content_en,'')='' AND COALESCE(tag_en,'')='';

UPDATE events SET translations_json='{"title":"TSG operation schedule update","description":"The joint operation with MJO has been cancelled and will proceed as a VOLT-only operation. Operational details and ship assignments will be announced separately. Participants should gather in the Fleet Lounge Discord voice channel at 7 PM.","type":"Operation","status":"Confirmed","dateLabel":"2026-05-31"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='event-496cb200-7693-43c3-9353-bfffa67766f1' AND title='TSG 작전 일정 변경 안내' AND COALESCE(description,'')='MJO 연합 합동 작전이 취소되었으며, VOLT 함대 단독 작전으로 변경되어 진행됩니다. 작전 세부 운용 방식 및 함선 배정은 별도 공지를 통해 안내드릴 예정입니다. 참여 예정이신 분들은 오후 7시에 디스코드 [함대 라운지] 음성 채널로 집결해 주시기 바랍니다.' AND translations_json='{}';

UPDATE gallery_items SET translations_json='{"title":"Large-scale VOLT TSG operation — May 31, 2026","description":"A large-scale TSG mission was successfully completed on May 31, 2026 with 22 participants: six streamers (페르마, 주이켠, 제순씌, 츄나, 루디 and 쌔싹감자), fifteen fleet members and one guest.","category":"Operation"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='gallery-46d1f2b3-372d-4c58-bbd0-026f891a5d86' AND title='2026년 5월 31일 VOLT 함대 대규모 TSG 진행' AND COALESCE(description,'')='2026년 5월 31일 스트리머 6명(페르마, 주이켠, 제순씌, 츄나, 루디, 쌔싹감자), 함대원 15명 손님 1분 총 22명이서 진행한 대규모 TSG 미션 성공적으로 완료' AND updated_at='2026-10-04T14:44:24.953Z' AND translations_json='{}';

UPDATE gallery_items SET translations_json='{"title":"VOLT TSG test with streamers 페르마 and 주이켠 — May 24, 2026","description":"VOLT conducted a TSG mission test with streamers 페르마 and 주이켠 on May 24, 2026.","category":"Operation"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='gallery-95867971-17c7-4726-a7a3-9d882e4d0384' AND title='2026년 5월 24일 VOLT 함대 스트리머 페르마, 주이켠 TSG' AND COALESCE(description,'')='2026년 5월 24일 VOLT 함대에서 페르마, 주이켠 스트리머와 같이 진행한 TSG 미션 테스트 진행' AND updated_at='2026-10-04T14:44:26.263Z' AND translations_json='{}';

UPDATE leadership_members SET translations_json='{"name":"Longman","role":"CEO · Chief Executive Officer","description":"Oversees all VOLT operations and designs the fleet''s strategic direction and organizational structure. Through systematic thinking and organizational design, plays a central role in developing VOLT into an organization with structured, company-style operations.","duties":"","details":[{"title":"Leadership philosophy","content":"Prefers structured leadership over coercion. The principle of voluntary participation with clear standards emphasizes a system in which members can cooperate reliably under predictable rules."},{"title":"Contribution to VOLT","content":"Designed combat, logistics, strategy, information and community activities as one integrated structure. Personally established documentation, procedures and role allocation, helping VOLT grow into one of Korea''s most systematically organized fleets."}],"competencies":["Organizational design and systematization","Data-driven strategy","Long-term vision and sustainability management","Planning and delivering large-scale cooperative activities"]}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='ceo' AND name='롱만' AND COALESCE(description,'')='VOLT의 모든 운영을 총괄하며, 함대의 전략적 방향성과 조직 구조를 설계합니다. 체계적 사고와 구조화 역량을 바탕으로 함대를 기업형 운영 시스템으로 발전시키는 데 핵심적인 역할을 수행합니다.' AND updated_at='2026-06-11T14:20:37.554Z' AND translations_json='{}';

UPDATE leadership_members SET translations_json='{"name":"Gospel","role":"COO · Chief Operating Officer","description":"Establishes organizational operating standards, manages the overall operational structure and oversees personnel systems including staffing, management and evaluation.","duties":"Improve operating systems and establish standards · Manage personnel and organize the role system · Standardize internal operations and build a stable operating environment"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='coo' AND name='가스펠' AND COALESCE(description,'')='조직 운영 표준을 수립하고 전체 운영 구조를 관리하며, 인력 배치, 관리, 평가를 포함한 인사 시스템을 감독합니다.' AND updated_at='2026-06-11T14:20:41.593Z' AND translations_json='{}';

UPDATE leadership_members SET translations_json='{"name":"AmAgrande","role":"CHRO · Chief Human Resources Officer","description":"Oversees member recruitment and management, personnel systems and fleet finances. Supports members'' use of game information through development of the VOLT AI bot.","duties":"Recruit and onboard new members · Manage fleet finances and assets · Develop and operate VOLT AI · Maintain the fleet member database"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='hr' AND name='아마그란데' AND COALESCE(description,'')='함대원 모집 및 관리, 인사 시스템과 함대 재무 운영을 총괄합니다. VOLT AI 봇 개발을 통해 함대원의 게임 정보 활용을 지원하고 있습니다.' AND updated_at='2026-06-11T14:20:45.344Z' AND translations_json='{}';

UPDATE leadership_members SET translations_json='{"name":"Carbon","role":"CIO · Chief Information Officer","description":"Oversees fleet transport resources, analyzes the flow of supplies and resources, and collects and categorizes key in-game information.","duties":"Support fleet transport and research operating systems · Optimize trade routes and analyze risks · Brief members on new content and systems"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='cio' AND name='탄소' AND COALESCE(description,'')='함대의 운송 자원을 감독하고, 물자와 자원 흐름을 분석하며, 게임 내 핵심 정보를 수집하고 분류합니다.' AND updated_at='2026-06-11T14:20:47.506Z' AND translations_json='{}';

UPDATE leadership_members SET translations_json='{"name":"Reaper","role":"CSO · Chief Strategy Officer","description":"Oversees strategic protection systems for high-value transport, studies and standardizes ship loadouts, and manages support for personnel and combat activities.","duties":"Allocate strategic resources and manage fleet assets · Optimize ship loadouts and roles for each situation · Provide strategic combat support and mission briefings"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='cso' AND name='리퍼' AND COALESCE(description,'')='전략적 고가 운송 보호 시스템을 감독하고, 함선 무장 구성을 연구 및 표준화하며, 인적 자원 및 전투 부문 지원을 관리합니다.' AND updated_at='2026-06-11T14:20:49.010Z' AND translations_json='{}';

UPDATE partner_fleets SET translations_json='{"name":"MJO Industry","region":"Korea","game":"Star Citizen","focus":"Industry","description":"MJO Industry\nFleet leader: 소강\nOrientation: prioritizes societal benefit over individual gain through service through enterprise, with an emphasis on contributing to national economic development.","established":"Year 2613"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='mjo' AND name='MJO 인더스트리' AND COALESCE(description,'')='MJO 인더스트리
함대장: 소강
성향: 개개인의 이익보다는 사회의 이익을 중시하는사업보국. 국가의 경제 발전에 이바지한다는 이념을 중시한다.' AND updated_at='2026-10-04T14:05:45.331Z' AND translations_json='{}';

UPDATE partner_fleets SET translations_json='{"name":"Hanza Merchant Corporation","region":"Korea","game":"Star Citizen","focus":"Commerce","description":"Hanza Merchant Corporation (HMC)\nFleet leader: 나츠바\nOrientation: pacifist merchant fleet","established":""}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='partner-15c33072-ea3b-4bcc-96c1-6786b34db947' AND name='Hanza Merchant Corporation' AND COALESCE(description,'')='Hanza Merchant Corporation (HMC)
함대장: 나츠바
성향: 평화주의 기반 상인 함대' AND updated_at='2026-10-04T14:05:45.331Z' AND translations_json='{}';

UPDATE partner_fleets SET translations_json='{"name":"Black Deep Group","region":"Korea","game":"Star Citizen","focus":"Military","description":"Black Deep Group (BDG)\nRepresentative: Jennie\nOrientation: Lawful / neutral multi-role organization\nDivisions: Black Deep Inc. / Black Deep Service","established":""}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='partner-1c5a7843-b998-42df-81ea-335ea0c1acd0' AND name='Black Deep Group' AND COALESCE(description,'')='Black Deep Group (BDG)
대표: 제니
성향: Lawful / 중립 기반 복합 ORG
구성: Black Deep Inc. / Black Deep Service' AND updated_at='2026-10-04T14:05:45.331Z' AND translations_json='{}';

UPDATE timeline_entries SET translations_json='{"title":"VOLT fleet founded","description":"A logistics and trading fleet launched for the Korean Star Citizen community.","dateLabel":"2953.06.18"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='tl-001' AND title='VOLT 함대 창설' AND COALESCE(description,'')='한국 커뮤니티 기반 Star Citizen 물류·무역 함대 출범.' AND updated_at='2026-06-11 12:44:53' AND translations_json='{}';

UPDATE timeline_entries SET translations_json='{"title":"Operating structure refined","description":"Departmental operations were reorganized, regular departmental activities introduced and a quarterly event system established.","dateLabel":"2955.02"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='tl-002' AND title='운영 체계 정비' AND COALESCE(description,'')='부서 운영 체계를 정비하고 부서별 정기 활동 도입. 분기별 이벤트 시스템 구축.' AND updated_at='2026-07-04T12:00:08.276Z' AND translations_json='{}';

UPDATE timeline_entries SET translations_json='{"title":"Strategic Resources Department and loot market established","description":"The Security Department was reorganized as the Strategic Resources Department. The internal loot market began operating as part of the fleet economy.","dateLabel":"2955.02"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='tl-003' AND title='전략자원부 신설 · 전리품 장터 개설' AND COALESCE(description,'')='기존 보안부서를 전략자원부로 개편. 함대 내부 경제 시스템인 전리품 장터 운영 시작.' AND updated_at='2026-06-11 12:44:53' AND translations_json='{}';

UPDATE timeline_entries SET translations_json='{"title":"Discord redesigned and Public Relations Department established","description":"Categories and channels were comprehensively reorganized and roles revised. A streamer-focused Public Relations Department was established.","dateLabel":"2955.04"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='tl-004' AND title='디스코드 시스템 전면 개편 · 홍보부 신설' AND COALESCE(description,'')='카테고리 및 채널 구조 전면 개편, 역할 체계 재정비. 스트리머 중심의 홍보부 신설.' AND updated_at='2026-06-11 12:44:53' AND translations_json='{}';

UPDATE timeline_entries SET translations_json='{"title":"Discord server reaches boost level 3","description":"Active member participation expanded the server''s features.","dateLabel":"2955.06"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='tl-005' AND title='디스코드 서버 부스터 레벨 3 달성' AND COALESCE(description,'')='함대원들의 적극적인 참여로 서버 기능 확장.' AND updated_at='2026-06-11 12:44:53' AND translations_json='{}';

UPDATE timeline_entries SET translations_json='{"title":"Lazarus Complex raid","description":"The first official group operation of the second half of the year, featuring medium-scale cooperative content in Pyro.","dateLabel":"2955.08"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='tl-006' AND title='Lazarus Complex 레이드' AND COALESCE(description,'')='하반기 첫 공식 단체 작전. Pyro 시스템 기반 중형 협동 콘텐츠 진행.' AND updated_at='2026-06-11 12:44:53' AND translations_json='{}';

UPDATE timeline_entries SET translations_json='{"title":"VOLT Trade Hub officially opened","description":"An integrated trading system was established, providing a dedicated platform for in-game item trading and short-term mission recruitment.","dateLabel":"2955.11"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='tl-007' AND title='VOLT-무역허브 공식 개설' AND COALESCE(description,'')='통합 교역 시스템 구축. 인게임 아이템 거래 및 단기 임무 모집을 지원하는 전용 플랫폼.' AND updated_at='2026-06-11 12:44:53' AND translations_json='{}';

UPDATE timeline_entries SET translations_json='{"title":"Fleet website redesigned","description":"The official website was redesigned to communicate the fleet''s identity and direction clearly.","dateLabel":"2956.05"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='tl-010' AND title='함대 홈페이지 리뉴얼' AND COALESCE(description,'')='함대 정체성과 방향성을 명확히 보여주기 위한 공식 홈페이지 개편.' AND updated_at='2026-06-11 12:44:53' AND translations_json='{}';

INSERT OR IGNORE INTO schema_migrations(id,applied_at) VALUES ('0017',datetime('now'));
