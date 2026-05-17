/**
 * VOLT Fleet Data
 * ===============
 * 함대 정보, 임원진, 스트리머, 연혁 등 동적 데이터 관리
 *
 * 향후 확장 시:
 * - 이 파일의 데이터를 Supabase / Firebase 등 DB로 이전
 * - 각 객체를 API 응답 형식으로 그대로 사용 가능
 * - 관리자 페이지에서 이 데이터를 CRUD하는 형태로 발전
 */

const VOLT_DATA = {
    // ===== 함대 기본 정보 =====
    fleet: {
        name: "VOLT",
        fullName: "Voyagers of Logistics & Trade",
        tagline: "물류와 무역을 위해 여행하는 항해자",
        description: "한국 기반 Star Citizen 물류·무역 전문 함대.\n안전한 운송, 체계적인 무역, 전문적인 정보 전달을 핵심 가치로 운영됩니다.",
        founded: "2953.06.18",
        platform: "Star Citizen",
        timezone: "아시아 (KST)",
        coreValues: "효율 · 조직화 · 확장",
        memberCount: "49+",
        region: "KR",
        discordUrl: "https://discord.gg/voltstarcitizen",
        applicationFormUrl: "https://forms.gle/2X3jLNATNj3fneQq8",
        rsiUrl: "https://robertsspaceindustries.com/orgs/VOLT"
    },

    // ===== 임원진 정보 =====
    leadership: [
        {
            id: "ceo",
            name: "롱만",
            role: "CEO · 대표이사 · 함대 사령관",
            avatar: "L",
            avatarStyle: "ceo", // 특별 스타일
            discord: "@haru801314",
            description: "VOLT의 모든 운영을 총괄하며, 함대의 전략적 방향성과 조직 구조를 설계합니다. 체계적 사고와 구조화 역량을 바탕으로 함대를 기업형 운영 시스템으로 발전시키는 데 핵심적인 역할을 수행합니다.",
            details: [
                {
                    title: "리더십 철학",
                    content: "강압적인 접근보다 구조적 리더십을 선호합니다. \"자율적으로 참여하되, 기준은 명확하다\"는 원칙을 통해 구성원들이 예측 가능한 규칙 내에서 안정적으로 협업할 수 있는 시스템을 강조합니다."
                },
                {
                    title: "VOLT 기여",
                    content: "전투, 물류, 전략, 정보, 커뮤니티 영역을 하나의 통합 구조로 설계. 문서화, 절차, 역할 분담 구조를 직접 구축하여 VOLT를 한국에서 가장 체계화된 함대 중 하나로 성장시켰습니다."
                }
            ],
            competencies: [
                "조직 구조 설계 및 체계화",
                "데이터 기반 전략 수립",
                "장기 비전 수립 및 지속가능성 관리",
                "대규모 협력 콘텐츠 기획 및 실행"
            ]
        },
        {
            id: "coo",
            name: "가스펠",
            role: "COO · 운영총괄이사",
            avatar: "G",
            avatarGradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
            discord: "@gospel0927",
            description: "조직 운영 표준을 수립하고 전체 운영 구조를 관리하며, 인력 배치, 관리, 평가를 포함한 인사 시스템을 감독합니다.",
            duties: "운영 시스템 개선 및 표준 수립 · 인사 관리 및 종합 역할 시스템 정리 · 내부 운영 표준화 및 안정적인 운영 환경 구축"
        },
        {
            id: "cio",
            name: "탄소",
            role: "CIO · 최고정보책임자",
            avatar: "T",
            avatarGradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            discord: "@carbon_tanso",
            description: "함대의 운송 자원을 감독하고, 물자와 자원 흐름을 분석하며, 게임 내 핵심 정보를 수집하고 분류합니다.",
            duties: "함대 운송 관련 지원 및 운영 시스템 연구 · 무역 루트 최적화 및 위험 분석 · 신규 콘텐츠 및 시스템 정보 브리핑"
        },
        {
            id: "cso",
            name: "리퍼",
            role: "CSO · 최고전략책임자",
            avatar: "R",
            avatarGradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
            discord: "@reapers9999",
            description: "전략적 고가 운송 보호 시스템을 감독하고, 함선 무장 구성을 연구 및 표준화하며, 인적 자원 및 전투 부문 지원을 관리합니다.",
            duties: "함대 전략 자원 배분 및 자산 관리 · 상황별 함선 무장 및 역할 최적화 · 전략적 전투 지원 및 임무 브리핑"
        },
        {
            id: "hr",
            name: "아마그란데",
            role: "HR · 인사부장",
            avatar: "A",
            avatarGradient: "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
            discord: "@amagrande",
            description: "함대원 모집 및 관리, 인사 시스템 운영을 담당합니다. VOLT AI 봇 개발을 통해 함대원의 게임 정보 활용을 지원하고 있습니다.",
            duties: "신규 함대원 모집 및 온보딩 · VOLT AI 시스템 개발 및 운영 · 함대원 데이터베이스 관리"
        }
    ],

    // ===== 공식 스트리머 =====
    streamers: [
        {
            id: "rudy",
            name: "루디",
            platform: "치지직",
            description: "토크 중심 방송과 종합게임을 함께 즐기는 스타시티즌 뉴비",
            image: "assets/images/streamers/rudy-v2.png",
            imagePosition: "center 18%",
            iconBg: "linear-gradient(135deg, #9ae6b4 0%, #38b2ac 100%)",
            channelUrl: "https://chzzk.naver.com/05c6daaae355aeae2f1843b9edc426b3",
            sections: [
                {
                    title: "📢 대표 스트리머",
                    content: "스타시티즌 패치나 대규모 함대전 이벤트를 방송과 유튜브에 송출·업로드할 예정입니다."
                },
                {
                    title: "🎨 콘텐츠 특징",
                    content: "· 스타시티즌은 매우 뉴비\n· 토크 콘텐츠 위주의 방송 스타일\n· 종합게임도 함께 진행"
                },
                {
                    title: "✨ 스트리머 특징",
                    content: "VOLT 함대를 통해 스타시티즌을 함께 즐기고, 아름다운 행성 경관을 관광하거나 다양한 콘텐츠를 즐겨나갈 예정입니다!"
                }
            ]
        },
        {
            id: "perma",
            name: "페르마",
            platform: "치지직",
            description: "순수함·청순함·순백함의 상징",
            image: "assets/images/streamers/perma.png",
            iconBg: "linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%)",
            channelUrl: "https://chzzk.naver.com/420728e601f2f4bbcb9cad159f071cec",
            sections: [
                {
                    title: "📢 대표 스트리머",
                    content: "볼트함대 공식 대표 스트리머로, 다수의 대형 이벤트를 성공적으로 진행했습니다."
                },
                {
                    title: "🎨 콘텐츠 특징",
                    content: "· 올바른 질서와 정의 수호\n· 탄탄한 스타시티즌 실력\n· 우주 평화 지키기"
                },
                {
                    title: "✨ 스트리머 특징",
                    content: "순백함을 상징하지만 정의를 위해서는 누구보다 단호한 존재. 볼트함대와 함께 많은 유저들에게 즐거움과 활력을 전달할 예정입니다."
                }
            ]
        },
        {
            id: "kookbap",
            name: "쿠욱밥",
            platform: "치지직",
            description: "탐험과 전투를 사랑하는 우주 개척자",
            image: "assets/images/streamers/kookbap.png",
            iconBg: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            channelUrl: "https://chzzk.naver.com/b61999886b91fb3fa362cf17fef0fd31",
            sections: [
                {
                    title: "🚀 활동 분야",
                    content: "탐험 및 전투 임무 중심으로 우주 곳곳을 누비며 새로운 길을 개척합니다."
                },
                {
                    title: "🎓 멘토링",
                    content: "신규 유저들에게 장비, 임무, 초반 루트를 안내하며 함께 성장하는 걸 즐깁니다."
                },
                {
                    title: "💫 특별한 이력",
                    content: "890 점프의 전설을 가진 조금 기묘한 친구. 함께라면 좋든 나쁘든 항상 사건이 일어나죠!"
                }
            ]
        }
    ],

    // ===== 활동 갤러리 =====
    gallery: [],

    // ===== 함대 연혁 =====
    timeline: [
        {
            date: "2953.06.18",
            title: "VOLT 함대 창설",
            description: "한국 커뮤니티 기반 Star Citizen 물류·무역 함대 출범."
        },
        {
            date: "2955.02",
            title: "운영 체계 정비",
            description: "부서 운영 체계를 정비하고 부서별 정기 활동 도입. 분기별 이벤트 시스템 구축."
        },
        {
            date: "2955.02",
            title: "전략자원부 신설 · 전리품 장터 개설",
            description: "기존 보안부서를 전략자원부로 개편. 함대 내부 경제 시스템인 전리품 장터 운영 시작."
        },
        {
            date: "2955.04",
            title: "디스코드 시스템 전면 개편 · 홍보부 신설",
            description: "카테고리 및 채널 구조 전면 개편, 역할 체계 재정비. 스트리머 중심의 홍보부 신설."
        },
        {
            date: "2955.06",
            title: "디스코드 서버 부스터 레벨 3 달성",
            description: "함대원들의 적극적인 참여로 서버 기능 확장."
        },
        {
            date: "2955.08",
            title: "Lazarus Complex 레이드",
            description: "하반기 첫 공식 단체 작전. Pyro 시스템 기반 중형 협동 콘텐츠 진행."
        },
        {
            date: "2955.11",
            title: "VOLT-무역허브 공식 개설",
            description: "통합 교역 시스템 구축. 인게임 아이템 거래 및 단기 임무 모집을 지원하는 전용 플랫폼."
        },
        {
            date: "2956.01",
            title: "VOLT AI 봇 도입",
            description: "Google Gemini 기반 함선 정보 AI 시스템 오픈. 함대원 전용 정보 분석 도구."
        },
        {
            date: "2956.02",
            title: "VOLT × MJO 합동 교류 작전",
            description: "외부 함대와의 친선 협력 강화. 향후 정기 연합 작전의 기반 마련."
        },
        {
            date: "2956.05",
            title: "함대 홈페이지 리뉴얼",
            description: "함대 정체성과 방향성을 명확히 보여주기 위한 공식 홈페이지 개편."
        }
    ],

    // ===== 함대 부서 / 활동 영역 =====
    departments: [
        {
            icon: "📦",
            name: "물류 & 무역",
            description: "안정적인 운송망 구축과 고가치 화물 운송. 시장 분석과 무역 루트 연구를 통해 함대의 경제 기반을 만듭니다."
        },
        {
            icon: "⚔️",
            name: "전략 자원",
            description: "바운티 미션 수행을 통한 전략 자원 확보. 함선 부품 및 무장을 확보하여 함대 내부에 공급합니다."
        },
        {
            icon: "🔍",
            name: "정보 & 정찰",
            description: "패치 업데이트, 신규 시스템 분석, 무역 루트 정보 수집. 데이터 기반의 의사결정을 지원합니다."
        },
        {
            icon: "🎯",
            name: "홍보 & 미디어",
            description: "스트리머 네트워크와 공식 콘텐츠 제작. 함대의 브랜드 가치 관리 및 신규 인원의 체계적인 온보딩을 지원합니다."
        }
    ],

    // ===== 핵심 가치 =====
    coreValues: [
        {
            title: "자율성 & 책임감",
            description: "각 구성원에게 자율적인 활동 권리를 부여하되, 책임감 있는 행동을 기대합니다. 참여는 강제하지 않지만, 기준은 명확합니다."
        },
        {
            title: "체계적 운영",
            description: "문서화, 절차, 역할 분담을 통해 안정적인 임무 수행을 가능하게 합니다. 예측 가능한 규칙으로 혼란을 최소화합니다."
        },
        {
            title: "지속적 성장",
            description: "전략적 계획과 데이터 기반 의사결정을 통해 장기적 성장을 지원합니다. 모든 함대원이 함께 발전하는 환경을 조성합니다."
        },
        {
            title: "친(UEE) 질서 지향",
            description: "VOLT는 UEE의 법과 질서를 존중하는 조직입니다. 트롤링, 비매너 플레이, 불필요한 외부 분쟁을 지양합니다."
        }
    ],

    // ===== VOLT 무역허브 =====
    hub: {
        title: "VOLT 무역허브",
        subtitle: "함대 전용 통합 교역 시스템",
        description: "함대 내 자산과 인력의 흐름을 보다 체계적으로 관리하기 위해 운영되는 VOLT 함대 전용 공식 플랫폼입니다. 인게임 아이템 거래와 단기 임무 모집을 동시에 지원하며, 함대 내부의 안정적인 거래 및 인력 매칭 환경을 제공합니다.",
        features: [
            {
                icon: "📦",
                title: "아이템 거래",
                items: ["무기, 장비, 방어구", "모듈, 부품", "희귀 전리품", "수집 아이템", "판매 / 교환 / 나눔"]
            },
            {
                icon: "🎯",
                title: "단기 임무 모집",
                items: ["운송 보조", "경호 임무", "채굴 동행", "레이드 지원", "기타 임시 인력 수요"]
            },
            {
                icon: "⚙️",
                title: "운영 방식",
                items: ["디스코드 채널 기반", "지정 양식 준수", "운영진 중재 가능", "인게임 화폐(aUEC)만 허용"]
            }
        ],
        notice: "모든 거래는 인게임 화폐(aUEC)만 허용되며, 현금·계좌이체·실물 등 현금성 거래는 전면 금지됩니다. 시세 교란, 허위 매물, 분쟁 유발 행위 또한 금지되며, 반복 위반 시 이용 제한 조치가 적용됩니다."
    },

    // ===== 가입 절차 =====
    joinSteps: [
        {
            number: 1,
            title: "지원서 제출",
            description: "구글 폼을 통해 간단한 지원서를 작성합니다. 게임 경험과 무관하게 누구나 환영합니다."
        },
        {
            number: 2,
            title: "안내 & 검토",
            description: "제출 내용을 검토한 후, Discord를 통해 간단한 안내 절차를 진행합니다."
        },
        {
            number: 3,
            title: "함대 합류",
            description: "승인 후 공식 VOLT 함대원이 되어 다양한 활동에 참여하게 됩니다."
        }
    ],
    joinChecklist: [
        {
            title: "뉴비도 환영",
            description: "Star Citizen 경험이 적어도 괜찮습니다. 필요한 기본 안내를 함께 제공합니다."
        },
        {
            title: "활동 강제 없음",
            description: "상시 의무 활동보다 자율 참여를 우선합니다. 가능한 때에 함께하면 됩니다."
        },
        {
            title: "Discord 선참여 가능",
            description: "지원 전 Discord에 먼저 들어와 분위기와 공지를 확인할 수 있습니다."
        },
        {
            title: "다양한 플레이 허용",
            description: "물류·무역 중심이지만 전투, 탐사, 정보 수집 등 다양한 활동을 함께합니다."
        },
        {
            title: "대표 ORG 안내",
            description: "가입 후 대표 ORG 설정 방법을 안내하며, 필요한 절차를 차근히 도와드립니다."
        },
        {
            title: "닉네임 기준 명확",
            description: "디코닉(핸들네임) 형식만 맞추면 운영진과 함대원이 서로를 쉽게 찾을 수 있습니다."
        }
    ],

    // ===== 운영정책 =====
    policy: {
        lastUpdated: "2026.05.15",
        sections: [
            {
                title: "1조 · 운영진의 역할",
                items: [
                    { num: "1조 1항", text: "조직장, 임원, 관리자를 포함한 모든 운영진은 질서 있고 쾌적한 조직 운영을 위해 본 정책에 위반되는 사항에 대해 사전 통보 없이 채팅·게시글을 삭제·편집할 수 있으며, 운영정책에 따라 활동을 제한할 수 있습니다." },
                    { num: "1조 2항", text: "운영진은 구성원 간 분쟁에 중립을 원칙으로 하나, 다수의 피해 발생 시 중재 및 부분 개입이 가능합니다." },
                    { num: "1조 3항", text: "운영정책에 명시되지 않은 사항은 운영진의 판단하에 제재할 수 있습니다." },
                    { num: "1조 4항", text: "운영진은 원활한 관리를 위해 일부 정책에 적용받지 않을 수 있으나 이를 악용해서는 안 됩니다." },
                    { num: "1조 5항", text: "사회적으로 문제가 있거나 관계 법령에 위반되는 경우 본 정책에 명시되지 않더라도 재량으로 제재할 수 있습니다." },
                    { num: "1조 6항", text: "모든 최종 결정은 조직장의 판단에 의해 변경될 수 있습니다." }
                ]
            },
            {
                title: "2조 · 구성원의 권리와 의무",
                items: [
                    { num: "2조 1항", text: "구성원은 조직에서 제공하는 콘텐츠, 행사, 복지에 참여할 권리가 있습니다." },
                    { num: "2조 2항", text: "사회적 통념에 어긋나는 행동으로 타인에게 손해를 끼친 경우 본인이 책임을 집니다." },
                    { num: "2조 3항", text: "운영진에게 부당한 대우를 받았다고 판단되는 경우 별도 문의 채널을 통해 이의를 제기할 수 있습니다." },
                    { num: "2조 4항", text: "계정 보호의 책임은 본인에게 있으며, 도용으로 발생한 위반 행위 또한 본인 책임입니다." },
                    { num: "2조 5항", text: "시스템 허점·문제 발견 시 운영진에게 통지해야 하며, 악용·유포는 금지됩니다." }
                ]
            },
            {
                title: "3조 · 닉네임 규정",
                notice: "디스코드 이름은 인게임 핸들 닉네임과 통일해야 합니다. 예시: 롱만(VOLT_Longman)",
                items: [
                    { num: "금지", text: "운영진을 사칭하거나 오해를 유발하는 닉네임" },
                    { num: "금지", text: "선정적이거나 비속어가 포함된 닉네임" },
                    { num: "금지", text: "반사회적이거나 관계 법령에 위반되는 닉네임" },
                    { num: "금지", text: "공백·특수문자를 남용하여 가독성을 해치는 닉네임" }
                ]
            },
            {
                title: "4조 · 위반 항목",
                items: [
                    { num: "4조 1항", text: "공공질서 및 미풍양속 위반 — 욕설·비속어, 성적 수치심 유발 표현, 신체적 비하 발언, 타인 비방, 정치·종교·성별·지역·인종 비하·옹호." },
                    { num: "4조 2항", text: "부적절한 콘텐츠 게시 — 음란 이미지·링크, 시스템 허점 및 버그 악용 방법 유포, 비인가 프로그램 자료 게시." },
                    { num: "4조 3항", text: "도배 및 홍보 — 동일·무의미한 채팅 반복, 무분별한 광고·홍보, aUEC 구걸, 초대코드 요청." },
                    { num: "4조 4항", text: "분쟁 및 선동 — 유언비어 유포 및 고의적 잘못된 정보 전파(서버 추방 사유), 편 가르기 및 갈등 고조 행위." },
                    { num: "4조 5항", text: "사칭 및 사기 — 다른 구성원 닉네임 고의 모방, 운영진 사칭, 거래 사기." },
                    { num: "4조 6항", text: "친목 및 개인정보 — 개인정보 공개, 신규·특정 구성원 배척 행위." },
                    { num: "4조 7항", text: "인게임 활동 — 트롤링·그리핑 금지, CIG EULA 위반(aUEC 현물 거래 등) 금지." }
                ]
            },
            {
                title: "5조 · 조직 운영 관련 의무사항",
                items: [
                    { num: "5조 1항", text: "대표 ORG 설정 — 사전 승낙 없이 VOLT를 대표 ORG로 설정해야 합니다. 1.0 업데이트 이후 모든 콘텐츠 혜택·평판은 대표 조직을 통해 적용됩니다." },
                    { num: "5조 2항", text: "조직 활동 참여 의무 — 정식오픈 이후 분기 단위로 최소 1회 참가 이력이 없을 시 미활동 인원으로 분류됩니다." },
                    { num: "5조 3항", text: "미활동 인원 정리 — 비주기적으로 미활동 인원에 대한 무통보 해임·퇴출이 있을 수 있습니다." }
                ]
            },
            {
                title: "6조 · 누적 경고에 따른 제재",
                notice: "경고는 부과일 기준 30일간 유지되며, 운영진 재량에 따라 제재 수위가 조정될 수 있습니다.",
                items: [
                    { num: "⚠️ 경고 1회", text: "7일간 채팅 제한" },
                    { num: "⚠️ 경고 2회", text: "30일간 활동 제한" },
                    { num: "⚠️ 경고 3회", text: "영구 추방" }
                ]
            }
        ]
    },

    // ===== 공지사항 =====
    announcements: [
        {
            id: "ann-006",
            date: "2026.05.15",
            title: "공식 홈페이지 리뉴얼 오픈",
            content: "함대 정체성과 방향성을 명확히 보여주기 위한 공식 홈페이지가 새롭게 개편되었습니다. 임원진 소개, 연혁, 무역허브, 운영정책 등 주요 정보를 확인하실 수 있습니다.",
            tag: "공지",
            tagColor: "orange",
            pinned: true
        },
        {
            id: "ann-005",
            date: "2026.05.15",
            title: "VOLT 운영정책 정식 시행",
            content: "함대 운영 전반에 대한 운영정책이 오늘부터 정식 적용됩니다. 닉네임 규정, 위반 항목, 누적 경고 제재 등 전문을 반드시 숙지해 주시기 바랍니다.",
            tag: "정책",
            tagColor: "red"
        },
        {
            id: "ann-004",
            date: "2026.02.22",
            title: "VOLT × MJO 합동 교류 작전",
            content: "MJO 함대와의 친선 협력 강화를 위한 합동 교류 작전이 진행되었습니다. 폴라리스 운용 및 매복 미션을 통해 양 함대 간 신뢰를 쌓는 계기가 되었습니다.",
            tag: "작전",
            tagColor: "blue"
        },
        {
            id: "ann-003",
            date: "2026.02.02",
            title: "VOLT AI 봇 공식 오픈",
            content: "Google Gemini 기반의 VOLT AI가 디스코드에 공식 오픈되었습니다. 함선 데이터베이스 검색, AI 정밀 분석 등 다양한 기능을 디스코드에서 이용하실 수 있습니다.",
            tag: "시스템",
            tagColor: "green"
        },
        {
            id: "ann-002",
            date: "2025.11.24",
            title: "VOLT-무역허브 공식 개설",
            content: "함대 전용 통합 교역 시스템 VOLT-무역허브가 공식 개설되었습니다. 인게임 아이템 거래 및 단기 임무 모집을 디스코드 내 전용 채널에서 진행할 수 있습니다.",
            tag: "시스템",
            tagColor: "green"
        },
        {
            id: "ann-001",
            date: "2025.08.02",
            title: "Lazarus Complex 레이드 완료",
            content: "하반기 첫 공식 단체 작전이 성공적으로 완료되었습니다. Pyro 시스템 Lazarus Complex에서 10명 내외 함대원이 공격팀·방어팀으로 나뉘어 협동 임무를 수행하였습니다.",
            tag: "작전",
            tagColor: "blue"
        }
    ],

    // ===== 작전 일정 =====
    calendar: [
        {
            id: "cal-001",
            date: "2026.08",
            dateLabel: "2026년 8월 예정",
            title: "TSG 미션 (4.8 업데이트 후)",
            description: "4.8 업데이트 이후 진행 예정. 우주팀(함대 기동·제공권 확보)과 스테이션 진입팀(FPS 교전)으로 나뉘어 수행.",
            type: "작전",
            status: "예정"
        },
        {
            id: "cal-002",
            date: "2026.Q3",
            dateLabel: "2026년 3분기",
            title: "분기 정기 이벤트",
            description: "함대원 전원이 참여하는 분기별 공식 이벤트. 세부 일정은 디스코드 공지 채널에서 확인.",
            type: "이벤트",
            status: "예정"
        },
        {
            id: "cal-003",
            date: "2026.TBD",
            dateLabel: "일정 미정",
            title: "유저 거래소 프로젝트 재개",
            description: "버그 수정 및 시장 경쟁력 확보 후 샤타곤 유저 거래소 프로젝트 재개 예정.",
            type: "프로젝트",
            status: "대기"
        },
        {
            id: "cal-004",
            date: "2026.TBD",
            dateLabel: "1.0 출시 후",
            title: "세금 제도 도입",
            description: "스테이션·전초기지·함대 복지 운영을 위한 세금 제도 도입 예정. 정식오픈 초기 세율 높게 책정 후 안정화 이후 재조정.",
            type: "정책",
            status: "계획"
        }
    ],

    // ===== 함선 데이터베이스 =====
    ships: [
        // ===== MISC =====
        { id: "endeavor", name: "Endeavor", manufacturer: "MISC", role: "대형 과학선", focus: "연구", size: "캐피탈", crew: "2-4명(변경 예정)", cargo: "500 SCU", description: "미구현, 세계관 최고의 과학선.", tags: ["화물", "무역", "물류", "미구현", "연구"] },
        { id: "expanse", name: "Expanse", manufacturer: "MISC", role: "소형 정제", focus: "정제", size: "중형", crew: "1명", cargo: "64 SCU", description: "소형 정제함, 1인 채광·정제에 최적화.", tags: ["화물", "채굴", "정제"] },
        { id: "fortune", name: "Fortune", manufacturer: "MISC", role: "소형 인양", focus: "인양", size: "소형", crew: "1명", cargo: "16 SCU", description: "소형 인양함, 1인 인양에 최적화.", tags: ["화물", "인양", "입문"] },
        { id: "hull-a", name: "Hull A", manufacturer: "MISC", role: "소형 화물", focus: "물류", size: "소형", crew: "1명", cargo: "64 SCU", description: "소형 화물선, 소량 1인 화물 운송에 최적화.", tags: ["화물", "무역", "물류"] },
        { id: "hull-b", name: "Hull B", manufacturer: "MISC", role: "중형 화물", focus: "물류", size: "대형", crew: "2명", cargo: "512 SCU", description: "중형 화물선, 중용량 화물 운송에 최적화.", tags: ["화물", "무역", "물류"] },
        { id: "hull-c", name: "Hull C", manufacturer: "MISC", role: "대형 화물", focus: "물류", size: "대형", crew: "2-4명", cargo: "4,608 SCU", description: "함대 주력 화물선. 대용량 화물 운송에 최적화된 VOLT 핵심 자산.", tags: ["화물", "무역", "물류"] },
        { id: "hull-d", name: "Hull D", manufacturer: "MISC", role: "초대형 화물", focus: "물류", size: "캐피탈", crew: "2-4명(변경 예정)", cargo: "6,912 SCU", description: "미구현, 초대형 화물선. 대용량 화물 운송에 최적화.", tags: ["화물", "무역", "물류", "미구현"] },
        { id: "hull-e", name: "Hull E", manufacturer: "MISC", role: "초대형 화물", focus: "물류", size: "캐피탈", crew: "2-4명(변경 예정)", cargo: "12,288 SCU", description: "미구현, 최대급 화물선. 대용량 화물 운송에 최적화.", tags: ["화물", "무역", "물류", "미구현"] },
        { id: "freelancer", name: "Freelancer", manufacturer: "MISC", role: "중형 화물", focus: "물류", size: "중형", crew: "1명", cargo: "66 SCU", description: "단독 무역 및 운송에 최적화된 중형 화물선. 전투도 가능하여 진입장벽 낮음.", tags: ["화물", "입문", "무역"] },
        { id: "freelancer-dur", name: "Freelancer DUR", manufacturer: "MISC", role: "탐사", focus: "탐사", size: "중형", crew: "1명", cargo: "36 SCU", description: "중형 크기의 탐사선.", tags: ["화물", "탐사", "입문"] },
        { id: "freelancer-max", name: "Freelancer MAX", manufacturer: "MISC", role: "중형 화물", focus: "물류", size: "중형", crew: "2명", cargo: "122 SCU", description: "단독 무역 및 운송에 최적화된 중형 화물선. 진입 장벽 낮음.", tags: ["화물", "입문", "무역"] },
        { id: "freelancer-mis", name: "Freelancer MIS", manufacturer: "MISC", role: "건쉽", focus: "전투", size: "중형", crew: "1명", cargo: "36 SCU", description: "중형 전투함. 무난한 무장과 풍부한 미사일로 전투 입문에 적합.", tags: ["전투", "입문", "호위"] },
        { id: "odyssey", name: "Odyssey", manufacturer: "MISC", role: "탐사", focus: "탐사", size: "캐피탈", crew: "1명(변경 예정)", cargo: "252 SCU", description: "미구현, 초장거리 심우주 탐사선.", tags: ["미구현", "탐사", "심우주"] },
        { id: "reliant-kore", name: "Reliant Kore", manufacturer: "MISC", role: "입문/소형 화물", focus: "화물", size: "중형", crew: "1명", cargo: "6 SCU", description: "입문용 함선. 소량 화물과 간단한 전투가 가능.", tags: ["화물", "입문", "전투"] },
        { id: "reliant-mako", name: "Reliant Mako", manufacturer: "MISC", role: "방송/중계", focus: "방송", size: "중형", crew: "1명", cargo: "0 SCU", description: "방송·중계용. 현재 기능 미구현.", tags: ["방송", "중계", "미구현"] },
        { id: "reliant-sen", name: "Reliant Sen", manufacturer: "MISC", role: "소형 과학/연구", focus: "연구", size: "중형", crew: "1명", cargo: "0 SCU", description: "소형 과학·연구선.", tags: ["과학", "입문", "연구"] },
        { id: "reliant-tana", name: "Reliant Tana", manufacturer: "MISC", role: "경 전투기", focus: "전투", size: "중형", crew: "1명", cargo: "1 SCU", description: "입문용 함선. 간단한 전투가 가능.", tags: ["입문", "전투"] },
        { id: "starfarer", name: "Starfarer", manufacturer: "MISC", role: "중형 주유", focus: "주유", size: "대형", crew: "1명", cargo: "291 SCU", description: "민간용 수소·퀀텀 주유함선.", tags: ["화물", "주유"] },
        { id: "starfarer-gemini", name: "Starfarer Gemini", manufacturer: "MISC", role: "중형 주유", focus: "주유", size: "대형", crew: "1명", cargo: "291 SCU", description: "군용 수소·퀀텀 주유함선. 민간용보다 튼튼함.", tags: ["화물", "주유"] },
        { id: "starlancer-max", name: "Starlancer MAX", manufacturer: "MISC", role: "대형 화물선", focus: "화물", size: "대형", crew: "1명", cargo: "224 SCU", description: "장거리 화물선. 1인 운송에 최적화.", tags: ["화물", "장거리"] },
        { id: "starlancer-tac", name: "Starlancer TAC", manufacturer: "MISC", role: "건쉽", focus: "전투", size: "대형", crew: "1명", cargo: "96 SCU", description: "건쉽. 내부 소형 차량까지 수송 가능.", tags: ["전투", "차량 운송", "다목적"] },
        { id: "starlite", name: "Starlite", manufacturer: "MISC", role: "소형 주유", focus: "주유", size: "소형", crew: "1명", cargo: "0 SCU", description: "입문용 소형 주유함.", tags: ["주유", "입문"] },
        { id: "prospector", name: "Prospector", manufacturer: "MISC", role: "채굴", focus: "채굴", size: "소형", crew: "1명", cargo: "12 SCU", description: "단독 소행성 채굴에 최적화된 소형 채굴선.", tags: ["채굴", "소형", "입문"] },

        // ===== RSI =====
        { id: "constellation-andromeda", name: "Constellation Andromeda", manufacturer: "RSI", role: "중형 화물/건쉽", focus: "물류/전투", size: "중형", crew: "2-4명", cargo: "96 SCU", description: "전투 능력과 화물 운송을 겸비한 범용 중형 함선.", tags: ["화물", "다목적", "전투"] },
        { id: "constellation-aquila", name: "Constellation Aquila", manufacturer: "RSI", role: "탐사", focus: "탐사", size: "중형", crew: "2-4명", cargo: "96 SCU", description: "심우주 탐사선. 내부에 탐사 차량을 수납 가능.", tags: ["화물", "탐사"] },
        { id: "constellation-phoenix", name: "Constellation Phoenix", manufacturer: "RSI", role: "럭셔리 투어링", focus: "VIP 여행용", size: "중형", crew: "2-4명", cargo: "80 SCU", description: "VIP 인원 수송용 함선. 내부에 피아노 설치 가능.", tags: ["화물", "인원 수송"] },
        { id: "constellation-taurus", name: "Constellation Taurus", manufacturer: "RSI", role: "중형 화물", focus: "물류", size: "중형", crew: "2-4명", cargo: "174 SCU", description: "전투 능력과 화물 운송을 겸비한 범용 중형 함선.", tags: ["화물", "다목적", "전투"] },
        { id: "galaxy", name: "Galaxy", manufacturer: "RSI", role: "중형 화물/모듈함", focus: "물류/모듈", size: "대형", crew: "2-4명(변경 예정)", cargo: "64 SCU", description: "미구현, 모듈 교체로 다목적 운용 가능.", tags: ["미구현", "다목적", "화물"] },
        { id: "hermes", name: "Hermes", manufacturer: "RSI", role: "중형 화물", focus: "물류", size: "중형", crew: "2-4명", cargo: "288 SCU", description: "화물 운송 성능을 최대화한 함선.", tags: ["화물", "다목적", "전투"] },
        { id: "lynx", name: "Lynx", manufacturer: "RSI", role: "지상 투어링", focus: "지상 차량", size: "소형", crew: "1명", cargo: "0 SCU", description: "VIP 수송용 지상 차량. Constellation Phoenix에 기본 탑재.", tags: ["지상", "인원 수송", "수송"] },
        { id: "mantis", name: "Mantis", manufacturer: "RSI", role: "퀀텀 차단", focus: "전투", size: "소형", crew: "1명", cargo: "0 SCU", description: "현재 유일한 퀀텀 차단 함선.", tags: ["퀀텀", "차단", "전투"] },
        { id: "meteor", name: "Meteor", manufacturer: "RSI", role: "중형 전투기", focus: "전투", size: "소형", crew: "1명", cargo: "0 SCU", description: "체급보다 큰 화력을 가진 함선. 별명은 유리대포.", tags: ["전투", "다목적", "전투기"] },
        { id: "orion", name: "Orion", manufacturer: "RSI", role: "대형 채굴", focus: "채굴", size: "캐피탈", crew: "2-4명(변경 예정)", cargo: "384 SCU", description: "미구현, 최대 크기의 채굴함. 자체 정제 가능.", tags: ["채굴", "미구현", "정제"] },
        { id: "perseus", name: "Perseus", manufacturer: "RSI", role: "대형 건쉽", focus: "전투", size: "대형", crew: "6명", cargo: "96 SCU", description: "대형함을 상대하는 목적으로 제작된 함선.", tags: ["대함", "대형", "전투"] },
        { id: "salvation", name: "Salvation", manufacturer: "RSI", role: "소형 인양/입문", focus: "입문", size: "소형", crew: "1명", cargo: "6 SCU", description: "입문용 인양함. 작은 함선을 인양 가능.", tags: ["인양", "입문"] },
        { id: "scorpius", name: "Scorpius", manufacturer: "RSI", role: "중 전투기", focus: "전투", size: "소형", crew: "1~2명", cargo: "0 SCU", description: "RSI 중전투기. 2인 운용 시 최대 화력. 포탑 변경으로 1인 운용도 가능.", tags: ["호위", "전투기", "전투"] },
        { id: "scorpius-antares", name: "Scorpius Antares", manufacturer: "RSI", role: "중 전투기/EMP/퀀텀 댐퍼", focus: "전투", size: "소형", crew: "1~2명", cargo: "0 SCU", description: "RSI 중전투기. 2인 운용 시 기총·EMP·퀀텀 재머 동시 사용 가능.", tags: ["호위", "전투기", "전투"] },
        { id: "ursa", name: "Ursa", manufacturer: "RSI", role: "지상 탐사", focus: "탐사", size: "소형", crew: "1명", cargo: "0 SCU", description: "지상 탐사 차량. Constellation Aquila에 기본 탑재.", tags: ["지상", "탐사", "함재기"] },
        { id: "ursa-medivac", name: "Ursa Medivac", manufacturer: "RSI", role: "지상 의료차량", focus: "의료", size: "소형", crew: "1명", cargo: "0 SCU", description: "지상 의료차량. 3티어 메디베이 탑재.", tags: ["지상", "의료", "함재기"] },
        { id: "zeus-mk2-cl", name: "Zeus MK2 CL", manufacturer: "RSI", role: "중형 화물", focus: "물류", size: "중형", crew: "1~3명", cargo: "128 SCU", description: "중형 화물선. 깔끔한 외형과 빠른 속도, 함선 트랙터빔 기본 장착으로 인기.", tags: ["화물", "다목적", "전투"] },
        { id: "zeus-mk2-es", name: "Zeus MK2 ES", manufacturer: "RSI", role: "탐사", focus: "탐사", size: "중형", crew: "1~3명", cargo: "32 SCU", description: "심우주 탐사선. 적당한 카고량과 풍부한 퀀텀·수소 연료로 인기.", tags: ["화물", "탐사"] },
        { id: "zeus-mk2-mr", name: "Zeus MK2 MR", manufacturer: "RSI", role: "경찰/바운티 헌터", focus: "전투", size: "중형", crew: "1~3명", cargo: "16 SCU", description: "미구현, Zeus MK2 베이스에서 전투 능력을 극대화한 함선. 유일하게 바운티 헌터로 분류.", tags: ["미구현", "다목적", "전투"] },
        { id: "apollo-medivac", name: "Apollo Medivac", manufacturer: "RSI", role: "의료선", focus: "의료", size: "대형", crew: "1~2명", cargo: "32 SCU", description: "전투 지역에 진입해 부상자를 치료하는 군용 의료함.", tags: ["의료", "전투"] },
        { id: "apollo-triage", name: "Apollo Triage", manufacturer: "RSI", role: "의료선", focus: "의료", size: "대형", crew: "1~2명", cargo: "32 SCU", description: "전투 지역에 진입해 부상자를 치료하는 민간 의료함.", tags: ["의료", "전투"] },
        { id: "arrastra", name: "Arrastra", manufacturer: "RSI", role: "채굴/정제", focus: "채굴/정제", size: "대형", crew: "1~2명(미구현)", cargo: "64 SCU", description: "미구현, 대형급 채굴함. 혼자서 정제까지 가능.", tags: ["채굴", "정제", "산업", "미구현"] },
        { id: "aurora-cl", name: "Aurora CL", manufacturer: "RSI", role: "경 화물선", focus: "화물", size: "소형", crew: "1명", cargo: "6 SCU", description: "입문용 경 화물선. 현재 단종.", tags: ["화물", "입문", "단종"] },
        { id: "aurora-es", name: "Aurora ES", manufacturer: "RSI", role: "입문/탐사선", focus: "탐사", size: "소형", crew: "1명", cargo: "3 SCU", description: "입문용 탐사선. 현재 단종.", tags: ["탐사", "입문", "단종"] },
        { id: "aurora-ln", name: "Aurora LN", manufacturer: "RSI", role: "경 전투기", focus: "전투", size: "소형", crew: "1명", cargo: "3 SCU", description: "입문용 경 전투기. 현재 단종.", tags: ["다목적", "입문", "단종"] },
        { id: "aurora-lx", name: "Aurora LX", manufacturer: "RSI", role: "탐사선", focus: "탐사", size: "소형", crew: "1명", cargo: "3 SCU", description: "입문용 탐사선. 현재 단종.", tags: ["입문", "탐사", "단종"] },
        { id: "aurora-mk1-se", name: "Aurora Mk1 SE", manufacturer: "RSI", role: "경 전투기", focus: "전투", size: "소형", crew: "1명", cargo: "6 SCU", description: "입문용 경 전투기. 현재 단종.", tags: ["다목적", "입문", "단종"] },
        { id: "aurora-mk2", name: "Aurora MK2", manufacturer: "RSI", role: "입문/경 전투기", focus: "전투", size: "소형", crew: "1명", cargo: "2 SCU", description: "입문용 경 전투기. 모듈형으로 전투·운송 성능을 극대화 가능.", tags: ["모듈형", "입문", "전투"] },
        { id: "aurora-mr", name: "Aurora MR", manufacturer: "RSI", role: "경 전투기", focus: "전투", size: "소형", crew: "1명", cargo: "3 SCU", description: "입문용 경 전투기. 현재 단종.", tags: ["다목적", "입문", "단종"] },
        { id: "polaris", name: "Polaris", manufacturer: "RSI", role: "코르벳", focus: "전투", size: "대형", crew: "14명", cargo: "576 SCU", description: "VOLT × MJO 합동 작전에서 운용된 함대급 코르벳. 어뢰 및 함재기 운용.", tags: ["전투", "함대", "기함"] },

        // ===== Drake =====
        { id: "caterpillar", name: "Caterpillar", manufacturer: "Drake", role: "중형 화물", focus: "물류", size: "대형", crew: "5명", cargo: "576 SCU", description: "다용도 화물선. 전리품 수거 및 화물 운송 겸용으로 활용.", tags: ["화물"] },
        { id: "caterpillar-pirate", name: "Caterpillar Pirate", manufacturer: "Drake", role: "중형 화물", focus: "물류", size: "대형", crew: "5명", cargo: "576 SCU", description: "다용도 화물선. 전리품 수거 및 화물 운송 겸용. 해적 스웜 클리어 보상.", tags: ["화물"] },
        { id: "cutlass-black", name: "Cutlass Black", manufacturer: "Drake", role: "다목적", focus: "전투", size: "중형", crew: "1-2명", cargo: "46 SCU", description: "전투와 물류를 겸비한 범용 함선. 초보자 권장.", tags: ["전투", "다목적", "입문"] },

        // ===== Aegis =====
        { id: "hammerhead", name: "Hammerhead", manufacturer: "Aegis", role: "전투함", focus: "전투", size: "대형", crew: "9명", cargo: "0 SCU", description: "함대 호위 및 전투 지원을 담당하는 주력 전투함.", tags: ["전투", "호위", "대형"] },
        { id: "reclaimer", name: "Reclaimer", manufacturer: "Aegis", role: "구난·인양", focus: "인양", size: "대형", crew: "5명", cargo: "5,280 SCU", description: "난파선 해체 및 자원 수거 전문 함선. 전리품 회수 활동에 활용.", tags: ["인양", "자원", "대형"] },

        // ===== Anvil =====
        { id: "carrack", name: "Carrack", manufacturer: "Anvil", role: "탐사", focus: "탐사", size: "대형", crew: "6명", cargo: "456 SCU", description: "장거리 탐사 및 정보 수집에 특화된 자급자족형 탐사선.", tags: ["탐사", "정보", "장거리"] }
    ],

    // ===== FAQ =====
    faq: [
        {
            q: "VOLT 함대에 가입하려면 어떻게 해야 하나요?",
            a: "홈페이지 '가입하기' 섹션에서 구글 폼 지원서를 제출하거나, 디스코드 서버에 참여 후 운영진에게 DM을 보내시면 됩니다. 게임 경험과 무관하게 누구나 지원 가능합니다."
        },
        {
            q: "디스코드 닉네임은 어떻게 설정해야 하나요?",
            a: "디스코드 닉네임(스타시티즌 핸들네임) 형식으로 설정해야 합니다. 예시: 롱만(VOLT_Longman). 미변경 시 운영진이 임의로 수정할 수 있습니다."
        },
        {
            q: "대표 ORG를 VOLT로 설정하는 방법은?",
            a: "RSI 공식 홈페이지(robertsspaceindustries.com) 로그인 → My RSI → Organizations → VOLT 검색 후 가입 → 내 조직 목록에서 VOLT를 대표 ORG로 설정하시면 됩니다."
        },
        {
            q: "운영정책 위반 시 어떻게 되나요?",
            a: "경고 누적에 따라 채팅 제한(1회), 활동 제한(2회), 영구 추방(3회)이 적용됩니다. 경고는 부과일 기준 30일간 유지됩니다. 중대한 위반은 경고 없이 즉시 처리될 수 있습니다."
        },
        {
            q: "오래 접속을 못 해도 되나요?",
            a: "비주기적으로 잠수 인원 조사가 진행됩니다. 응답하지 않으면 외부손님 권한으로 변경될 수 있습니다. 복귀를 원하실 경우 운영진에게 문의하시면 됩니다."
        },
        {
            q: "무역허브는 어떻게 이용하나요?",
            a: "디스코드 내 VOLT-무역허브 채널에서 지정 양식에 맞춰 아이템 거래 또는 임무 모집 글을 게시할 수 있습니다. 모든 거래는 인게임 화폐(aUEC)만 허용됩니다."
        },
        {
            q: "VOLT는 어떤 성향의 함대인가요?",
            a: "친(UEE) 성향의 질서 지향적 조직입니다. 물류·무역을 중심으로 전투, 탐사, 정보 수집 등 다양한 활동을 아우릅니다. 이유 없는 공격, 트롤링, 비매너 플레이는 지양합니다."
        },
        {
            q: "부서가 있나요?",
            a: "현재는 별도의 고정 부서 없이 VOLT 함대원으로 통합 운영되고 있습니다. 각자의 플레이 스타일에 맞게 물류·전투·탐사 등 자유롭게 활동하실 수 있습니다."
        }
    ],

    // ===== 무역 가이드 =====
    tradeGuide: [
        {
            icon: "📋",
            step: 1,
            title: "기본 무역 흐름",
            content: "저렴한 곳에서 구매 → 비싼 곳에서 판매. Trade Tools(sc-trade.tools, uexcorp.space)로 최적 루트를 미리 확인하세요."
        },
        {
            icon: "🛸",
            step: 2,
            title: "추천 입문 루트",
            content: "스탠턴 기준: Microtech ↔ ArcCorp 구간이 초보자에게 안정적입니다. 화물칸 용량에 맞는 고수익 상품을 선택하세요."
        },
        {
            icon: "📦",
            step: 3,
            title: "함선 선택 기준",
            content: "입문: Cutlass Black(46 SCU) / 중급: Freelancer MAX(122 SCU) / 고급: Hull C(4,608 SCU). 초기엔 소형 화물선으로 루트를 익히는 것을 권장합니다."
        },
        {
            icon: "⚠️",
            step: 4,
            title: "리스크 관리",
            content: "파이로 시스템은 무법 지대입니다. 고가치 화물 운송 시 호위를 요청하거나 VOLT-무역허브에서 경호 임무를 모집하세요."
        },
        {
            icon: "🤝",
            step: 5,
            title: "함대 내부 거래",
            content: "전리품·부품 판매 시 NPC보다 높은 가격에 함대원에게 판매 가능합니다. VOLT-무역허브 채널을 적극 활용하세요."
        },
        {
            icon: "💡",
            step: 6,
            title: "버그·규정 주의",
            content: "화물 복사 버그 등 게임 내 버그 악용은 CIG 제재(최대 계정 정지) 및 함대 제재 대상입니다. 발견 시 운영진에게 제보해 주세요."
        }
    ]
};

// 전역 객체로 노출 (향후 모듈 시스템 도입 시 export로 변경)
if (typeof window !== 'undefined') {
    window.VOLT_DATA = VOLT_DATA;
}
