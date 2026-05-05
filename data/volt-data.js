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
                    content: "· 올바른 질서와 정의 수호<br>· 탄탄한 스타시티즌 실력<br>· 우주 평화 지키기"
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
        },
        {
            id: "juikyeon",
            name: "주이켠",
            platform: "치지직",
            description: "경쟁과 FPS를 즐기는 종합게임 스트리머",
            image: "assets/images/streamers/juikyeon.png",
            iconBg: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
            channelUrl: "https://chzzk.naver.com/635c06515700592bdb116b3ad561ef94",
            sections: [
                {
                    title: "⚡ 도전 정신",
                    content: "남들이 말리던 슈일렌으로 입문해서 우주 탑건을 노리며 정진 중이고, 후엔 어엿한 캡틴이 목표입니다!"
                },
                {
                    title: "🎯 콘텐츠 스타일",
                    content: "· Star Citizen 경쟁 콘텐츠<br>· FPS 및 전투 중심 게임플레이<br>· 신규 유저 지원<br>· 다양한 종합게임"
                },
                {
                    title: "🤝 커뮤니티",
                    content: "필요하신 분이 있다면 힘 닿는 한 도와드립니다. 함께 재미있게 즐길 수 있도록 노력하고 있습니다."
                }
            ]
        }
    ],

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
    ]
};

// 전역 객체로 노출 (향후 모듈 시스템 도입 시 export로 변경)
if (typeof window !== 'undefined') {
    window.VOLT_DATA = VOLT_DATA;
}
