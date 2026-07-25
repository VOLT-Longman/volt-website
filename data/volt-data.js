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
    memberCount: 100,
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
        memberCount: 100,
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
            role_en: "CEO · Fleet Commander",
            avatar: "L",
            avatarUrl: "",
            avatarStyle: "ceo", // 특별 스타일
            discord: "@haru801314",
            description: "VOLT의 모든 운영을 총괄하며, 함대의 전략적 방향성과 조직 구조를 설계합니다. 체계적 사고와 구조화 역량을 바탕으로 함대를 기업형 운영 시스템으로 발전시키는 데 핵심적인 역할을 수행합니다.",
            description_en: "Oversees all of VOLT\u2019s operations and designs the fleet\u2019s strategic direction and structure. With systematic thinking and strong structuring skills, plays a key role in evolving the fleet into a corporate-style operating system.",
            details: [
                {
                    title: "리더십 철학",
                    title_en: "Leadership Philosophy",
                    content: "강압적인 접근보다 구조적 리더십을 선호합니다. \"자율적으로 참여하되, 기준은 명확하다\"는 원칙을 통해 구성원들이 예측 가능한 규칙 내에서 안정적으로 협업할 수 있는 시스템을 강조합니다.",
                    content_en: "Prefers structural leadership over coercion. Through the principle of \"participate voluntarily, but with clear standards,\" emphasizes a system where members collaborate reliably within predictable rules."
                },
                {
                    title: "VOLT 기여",
                    title_en: "Contribution to VOLT",
                    content: "전투, 물류, 전략, 정보, 커뮤니티 영역을 하나의 통합 구조로 설계. 문서화, 절차, 역할 분담 구조를 직접 구축하여 VOLT를 한국에서 가장 체계화된 함대 중 하나로 성장시켰습니다.",
                    content_en: "Designed combat, logistics, strategy, intel, and community into one integrated structure. Built the documentation, procedures, and role-division firsthand, growing VOLT into one of the most systematized fleets in Korea."
                }
            ],
            competencies: [
                "조직 구조 설계 및 체계화",
                "데이터 기반 전략 수립",
                "장기 비전 수립 및 지속가능성 관리",
                "대규모 협력 콘텐츠 기획 및 실행"
            ],
            competencies_en: [
                "Organizational design & systematization",
                "Data-driven strategy",
                "Long-term vision & sustainability",
                "Planning & running large-scale co-op content"
            ]
        },
        {
            id: "coo",
            name: "가스펠",
            role: "COO · 운영총괄이사",
            role_en: "COO · Head of Operations",
            avatar: "G",
            avatarUrl: "",
            avatarGradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
            discord: "@gospel0927",
            description: "조직 운영 표준을 수립하고 전체 운영 구조를 관리하며, 인력 배치, 관리, 평가를 포함한 인사 시스템을 감독합니다.",
            description_en: "Establishes operating standards and manages the overall operations structure, overseeing HR systems including staffing, management, and evaluation.",
            duties: "운영 시스템 개선 및 표준 수립 · 인사 관리 및 종합 역할 시스템 정리 · 내부 운영 표준화 및 안정적인 운영 환경 구축",
            duties_en: "Improving operating systems & setting standards · HR management & consolidating the role system · Standardizing internal operations for a stable environment",
            responsibilities: ["운영 시스템 개선 및 표준 수립 · 인사 관리 및 종합 역할 시스템 정리 · 내부 운영 표준화 및 안정적인 운영 환경 구축"]
        },
        {
            id: "cio",
            name: "탄소",
            role: "CIO · 최고정보책임자",
            role_en: "CIO · Chief Information Officer",
            avatar: "T",
            avatarUrl: "",
            avatarGradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            discord: "@carbon_tanso",
            description: "함대의 운송 자원을 감독하고, 물자와 자원 흐름을 분석하며, 게임 내 핵심 정보를 수집하고 분류합니다.",
            description_en: "Oversees the fleet\u2019s transport resources, analyzes the flow of goods, and collects and classifies key in-game information.",
            duties: "함대 운송 관련 지원 및 운영 시스템 연구 · 무역 루트 최적화 및 위험 분석 · 신규 콘텐츠 및 시스템 정보 브리핑",
            duties_en: "Research on fleet transport support & operating systems · Trade route optimization & risk analysis · Briefings on new content and systems",
            responsibilities: ["함대 운송 관련 지원 및 운영 시스템 연구 · 무역 루트 최적화 및 위험 분석 · 신규 콘텐츠 및 시스템 정보 브리핑"]
        },
        {
            id: "cso",
            name: "리퍼",
            role: "CSO · 최고전략책임자",
            role_en: "CSO · Chief Strategy Officer",
            avatar: "R",
            avatarUrl: "",
            avatarGradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
            discord: "@reapers9999",
            description: "전략적 고가 운송 보호 시스템을 감독하고, 함선 무장 구성을 연구 및 표준화하며, 인적 자원 및 전투 부문 지원을 관리합니다.",
            description_en: "Oversees strategic high-value transport protection, researches and standardizes ship loadouts, and manages personnel and combat-division support.",
            duties: "함대 전략 자원 배분 및 자산 관리 · 상황별 함선 무장 및 역할 최적화 · 전략적 전투 지원 및 임무 브리핑",
            duties_en: "Strategic resource allocation & asset management · Situational loadout & role optimization · Strategic combat support & mission briefings",
            responsibilities: ["함대 전략 자원 배분 및 자산 관리 · 상황별 함선 무장 및 역할 최적화 · 전략적 전투 지원 및 임무 브리핑"]
        },
        {
            id: "hr",
            name: "아마그란데",
            role: "인사·재무 이사",
            role_en: "Director of HR & Finance",
            avatar: "A",
            avatarUrl: "",
            avatarGradient: "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
            discord: "@amagrande",
            description: "함대원 모집 및 관리, 인사 시스템과 함대 재무 운영을 총괄합니다. VOLT AI 봇 개발을 통해 함대원의 게임 정보 활용을 지원하고 있습니다.",
            description_en: "Leads member recruitment and management, HR systems, and fleet finance. Supports members\u2019 use of game information by developing the VOLT AI bot.",
            duties: "신규 함대원 모집 및 온보딩 · 함대 재무 관리 및 자산 운영 · VOLT AI 시스템 개발 및 운영 · 함대원 데이터베이스 관리",
            duties_en: "New member recruitment & onboarding · Fleet finance & asset management · VOLT AI development & operation · Member database management",
            responsibilities: ["신규 함대원 모집 및 온보딩 · 함대 재무 관리 및 자산 운영 · VOLT AI 시스템 개발 및 운영 · 함대원 데이터베이스 관리"]
        }
    ],

    // ===== 공식 스트리머 =====
    streamers: [
        {
            id: "rudy",
            name: "루디",
            platform: "치지직",
            platform_en: "Chzzk",
            description: "토크 중심 방송과 종합게임을 함께 즐기는 스타시티즌 뉴비",
            description_en: "A Star Citizen newbie who enjoys talk-focused streams alongside a variety of games",
            image: "assets/images/streamers/rudy.webp",
            imagePosition: "center 18%",
            iconBg: "linear-gradient(135deg, #9ae6b4 0%, #38b2ac 100%)",
            channelUrl: "https://chzzk.naver.com/05c6daaae355aeae2f1843b9edc426b3",
            sections: [
                {
                    title: "대표 스트리머",
                    title_en: "Featured Streamer",
                    content: "스타시티즌 패치나 대규모 함대전 이벤트를 방송과 유튜브에 송출·업로드할 예정입니다.",
                    content_en: "Plans to stream and upload Star Citizen patches and large-scale fleet battles on stream and YouTube."
                },
                {
                    title: "콘텐츠 특징",
                    title_en: "Content Style",
                    content: "· 스타시티즌은 매우 뉴비\n· 토크 콘텐츠 위주의 방송 스타일\n· 종합게임도 함께 진행",
                    content_en: "· Very new to Star Citizen\n· Talk-focused streaming style\n· Also plays a variety of games"
                },
                {
                    title: "스트리머 특징",
                    title_en: "About the Streamer",
                    content: "VOLT 함대를 통해 스타시티즌을 함께 즐기고, 아름다운 행성 경관을 관광하거나 다양한 콘텐츠를 즐겨나갈 예정입니다!",
                    content_en: "Plans to enjoy Star Citizen together with VOLT \u2014 touring beautiful planetary vistas and exploring all kinds of content!"
                }
            ]
        },
        {
            id: "perma",
            name: "페르마",
            platform: "치지직",
            platform_en: "Chzzk",
            description: "순수함·청순함·순백함의 상징",
            description_en: "A symbol of purity, innocence, and pure white",
            image: "assets/images/streamers/perma.png",
            iconBg: "linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%)",
            channelUrl: "https://chzzk.naver.com/420728e601f2f4bbcb9cad159f071cec",
            sections: [
                {
                    title: "대표 스트리머",
                    title_en: "Featured Streamer",
                    content: "볼트함대 공식 대표 스트리머로, 다수의 대형 이벤트를 성공적으로 진행했습니다.",
                    content_en: "As VOLT\u2019s official featured streamer, has successfully hosted many large events."
                },
                {
                    title: "콘텐츠 특징",
                    title_en: "Content Style",
                    content: "· 올바른 질서와 정의 수호\n· 탄탄한 스타시티즌 실력\n· 우주 평화 지키기",
                    content_en: "· Upholding order and justice\n· Solid Star Citizen skills\n· Keeping the peace in space"
                },
                {
                    title: "스트리머 특징",
                    title_en: "About the Streamer",
                    content: "순백함을 상징하지만 정의를 위해서는 누구보다 단호한 존재. 볼트함대와 함께 많은 유저들에게 즐거움과 활력을 전달할 예정입니다.",
                    content_en: "A symbol of purity, yet more resolute than anyone for justice. Will bring joy and energy to many players alongside VOLT."
                }
            ]
        },
        {
            id: "kookbap",
            name: "쿠욱밥",
            platform: "치지직",
            platform_en: "Chzzk",
            description: "탐험과 전투를 사랑하는 우주 개척자",
            description_en: "A space pioneer who loves exploration and combat",
            image: "assets/images/streamers/kookbap.png",
            iconBg: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            channelUrl: "https://chzzk.naver.com/b61999886b91fb3fa362cf17fef0fd31",
            sections: [
                {
                    title: "활동 분야",
                    title_en: "Focus Areas",
                    content: "탐험 및 전투 임무 중심으로 우주 곳곳을 누비며 새로운 길을 개척합니다.",
                    content_en: "Roams across space on exploration and combat missions, pioneering new routes."
                },
                {
                    title: "멘토링",
                    title_en: "Mentoring",
                    content: "신규 유저들에게 장비, 임무, 초반 루트를 안내하며 함께 성장하는 걸 즐깁니다.",
                    content_en: "Enjoys guiding new users on gear, missions, and early routes, and growing together."
                },
                {
                    title: "특별한 이력",
                    title_en: "Notable History",
                    content: "890 점프의 전설을 가진 조금 기묘한 친구. 함께라면 좋든 나쁘든 항상 사건이 일어나죠!",
                    content_en: "A quirky friend with the legend of the 890 Jump. With them around, something always happens \u2014 for better or worse!"
                }
            ]
        }
    ],

    // ===== 활동 갤러리 =====
    gallery: [],

    // ===== 협력 함대 =====
    partnerFleets: [
        {
            id: "mjo",
            name: "MJO",
            region: "한국",
            region_en: "Korea",
            game: "Star Citizen",
            focus: "합동 작전",
            focus_en: "Joint Operations",
            description: "VOLT와 합동 작전 및 교류를 진행하는 협력 함대입니다.",
            description_en: "A partner fleet that runs joint operations and exchanges with VOLT.",
            memberCount: null,
            discordUrl: "",
            websiteUrl: "",
            photoUrl: "",
            logoUrl: "",
            established: "",
            sortOrder: 1,
            published: true
        }
    ],

    // ===== 함대 연혁 =====
    timeline: [
        {
            date: "2953.06.18",
            title: "VOLT 함대 창설",
            title_en: "VOLT Fleet Founded",
            description: "한국 커뮤니티 기반 Star Citizen 물류·무역 함대 출범.",
            description_en: "Launch of a Korean-community Star Citizen logistics and trade fleet."
        },
        {
            date: "2955.02",
            title: "운영 체계 정비",
            title_en: "Operations Restructured",
            description: "부서 운영 체계를 정비하고 부서별 정기 활동 도입. 분기별 이벤트 시스템 구축.",
            description_en: "Reorganized the departmental operating system, introduced regular departmental activities, and built a quarterly event system."
        },
        {
            date: "2955.02",
            title: "전략자원부 신설 · 전리품 장터 개설",
            title_en: "Strategic Resources Dept. & Loot Market",
            description: "기존 보안부서를 전략자원부로 개편. 함대 내부 경제 시스템인 전리품 장터 운영 시작.",
            description_en: "Reorganized the former security department into Strategic Resources, and launched the Loot Market — the fleet's internal economy."
        },
        {
            date: "2955.04",
            title: "디스코드 시스템 전면 개편 · 홍보부 신설",
            title_en: "Discord Overhaul & Outreach Dept.",
            description: "카테고리 및 채널 구조 전면 개편, 역할 체계 재정비. 스트리머 중심의 홍보부 신설.",
            description_en: "Fully reworked the category and channel structure, reorganized the role system, and created a streamer-focused Outreach department."
        },
        {
            date: "2955.06",
            title: "디스코드 서버 부스터 레벨 3 달성",
            title_en: "Discord Server Boost Level 3",
            description: "함대원들의 적극적인 참여로 서버 기능 확장.",
            description_en: "Active member participation unlocked expanded server features."
        },
        {
            date: "2955.08",
            title: "Lazarus Complex 레이드",
            title_en: "Lazarus Complex Raid",
            description: "하반기 첫 공식 단체 작전. Pyro 시스템 기반 중형 협동 콘텐츠 진행.",
            description_en: "Our first official group operation of the second half — a mid-size co-op event in the Pyro system."
        },
        {
            date: "2955.11",
            title: "VOLT-무역허브 공식 개설",
            title_en: "VOLT Trade Hub Launched",
            description: "통합 교역 시스템 구축. 인게임 아이템 거래 및 단기 임무 모집을 지원하는 전용 플랫폼.",
            description_en: "Built an integrated trading system — a dedicated platform for in-game item trades and short-term mission listings."
        },
        {
            date: "2956.01",
            title: "VOLT AI 봇 도입",
            title_en: "VOLT AI Bot Introduced",
            description: "Google Gemini 기반 함선 정보 AI 시스템 오픈. 함대원 전용 정보 분석 도구.",
            description_en: "Opened a Google Gemini–based ship-info AI system, a members-only analysis tool."
        },
        {
            date: "2956.02",
            title: "VOLT × MJO 합동 교류 작전",
            title_en: "VOLT × MJO Joint Operation",
            description: "외부 함대와의 친선 협력 강화. 향후 정기 연합 작전의 기반 마련.",
            description_en: "Strengthened friendly cooperation with an outside fleet, laying the groundwork for regular joint operations."
        },
        {
            date: "2956.05",
            title: "함대 홈페이지 리뉴얼",
            title_en: "Fleet Website Renewal",
            description: "함대 정체성과 방향성을 명확히 보여주기 위한 공식 홈페이지 개편.",
            description_en: "Renewed the official website to clearly present the fleet's identity and direction."
        }
    ],

    // ===== 함대 부서 / 활동 영역 =====
    departments: [
        {
            name: "물류 & 무역",
            name_en: "Logistics & Trade",
            description: "안정적인 운송망 구축과 고가치 화물 운송. 시장 분석과 무역 루트 연구를 통해 함대의 경제 기반을 만듭니다.",
            description_en: "Building reliable supply lines and moving high-value cargo. We study markets and trade routes to fund the fleet's economy."
        },
        {
            name: "전략 자원",
            name_en: "Strategic Resources",
            description: "바운티 미션 수행을 통한 전략 자원 확보. 함선 부품 및 무장을 확보하여 함대 내부에 공급합니다.",
            description_en: "Securing strategic resources through bounty contracts, then sourcing ship components and weaponry for the fleet."
        },
        {
            name: "정보 & 정찰",
            name_en: "Intel & Recon",
            description: "패치 업데이트, 신규 시스템 분석, 무역 루트 정보 수집. 데이터 기반의 의사결정을 지원합니다.",
            description_en: "Tracking patch updates, analyzing new systems, and gathering trade-route intel to support data-driven decisions."
        },
        {
            name: "홍보 & 미디어",
            name_en: "Outreach & Media",
            description: "스트리머 네트워크와 공식 콘텐츠 제작. 함대의 브랜드 가치 관리 및 신규 인원의 체계적인 온보딩을 지원합니다.",
            description_en: "Running our streamer network and official content, managing the fleet's brand, and onboarding new members in a structured way."
        }
    ],

    // ===== 핵심 가치 =====
    coreValues: [
        {
            title: "자율성 & 책임감",
            title_en: "Autonomy & Accountability",
            description: "각 구성원에게 자율적인 활동 권리를 부여하되, 책임감 있는 행동을 기대합니다. 참여는 강제하지 않지만, 기준은 명확합니다.",
            description_en: "Every member is free to take part on their own terms, but is expected to act responsibly. Participation isn't forced — the standards are."
        },
        {
            title: "체계적 운영",
            title_en: "Systematic Operations",
            description: "문서화, 절차, 역할 분담을 통해 안정적인 임무 수행을 가능하게 합니다. 예측 가능한 규칙으로 혼란을 최소화합니다.",
            description_en: "Documentation, processes, and clear roles keep missions stable. Predictable rules keep confusion to a minimum."
        },
        {
            title: "지속적 성장",
            title_en: "Continuous Growth",
            description: "전략적 계획과 데이터 기반 의사결정을 통해 장기적 성장을 지원합니다. 모든 함대원이 함께 발전하는 환경을 조성합니다.",
            description_en: "Strategic planning and data-driven decisions drive long-term growth, in an environment where every member advances together."
        },
        {
            title: "친(UEE) 질서 지향",
            title_en: "Pro-Law (UEE) Conduct",
            description: "VOLT는 UEE의 법과 질서를 존중하는 조직입니다. 트롤링, 비매너 플레이, 불필요한 외부 분쟁을 지양합니다.",
            description_en: "VOLT respects UEE law and order. We avoid trolling, poor sportsmanship, and unnecessary outside conflict."
        }
    ],

    // ===== VOLT 무역허브 =====
    hub: {
        title: "VOLT 무역허브",
        subtitle: "함대 전용 통합 교역 시스템",
        description: "함대 내 자산과 인력의 흐름을 보다 체계적으로 관리하기 위해 운영되는 VOLT 함대 전용 공식 플랫폼입니다. 인게임 아이템 거래와 단기 임무 모집을 동시에 지원하며, 함대 내부의 안정적인 거래 및 인력 매칭 환경을 제공합니다.",
        features: [
            {
                title: "아이템 거래",
                title_en: "Item Trading",
                items: ["무기, 장비, 방어구", "모듈, 부품", "희귀 전리품", "수집 아이템", "판매 / 교환 / 나눔"],
                items_en: ["Weapons, gear, armor", "Modules & components", "Rare loot", "Collectibles", "Sell / trade / give away"]
            },
            {
                title: "단기 임무 모집",
                title_en: "Short-term Contracts",
                items: ["운송 보조", "경호 임무", "채굴 동행", "레이드 지원", "기타 임시 인력 수요"],
                items_en: ["Hauling support", "Escort duty", "Mining companions", "Raid backup", "Other temporary crew needs"]
            },
            {
                title: "운영 방식",
                title_en: "How It Works",
                items: ["디스코드 채널 기반", "지정 양식 준수", "운영진 중재 가능", "인게임 화폐(aUEC)만 허용"],
                items_en: ["Runs on Discord channels", "Uses designated post formats", "Staff mediation available", "In-game currency (aUEC) only"]
            }
        ],
        notice: "모든 거래는 인게임 화폐(aUEC)만 허용되며, 현금·계좌이체·실물 등 현금성 거래는 전면 금지됩니다. 시세 교란, 허위 매물, 분쟁 유발 행위 또한 금지되며, 반복 위반 시 이용 제한 조치가 적용됩니다."
    },

    // ===== 가입 절차 =====
    joinSteps: [
        {
            number: 1,
            title: "지원서 제출",
            title_en: "Submit Application",
            description: "구글 폼을 통해 간단한 지원서를 작성합니다. 게임 경험과 무관하게 누구나 환영합니다.",
            description_en: "Fill out a short application via Google Form. Everyone is welcome, regardless of game experience."
        },
        {
            number: 2,
            title: "안내 & 검토",
            title_en: "Guidance & Review",
            description: "제출 내용을 검토한 후, Discord를 통해 간단한 안내 절차를 진행합니다.",
            description_en: "After reviewing your submission, we run a brief onboarding via Discord."
        },
        {
            number: 3,
            title: "함대 합류",
            title_en: "Join the Fleet",
            description: "승인 후 공식 VOLT 함대원이 되어 다양한 활동에 참여하게 됩니다.",
            description_en: "Once approved, you become an official VOLT member and join our activities."
        }
    ],
    joinChecklist: [
        {
            title: "뉴비도 환영",
            title_en: "Newcomers Welcome",
            description: "Star Citizen 경험이 적어도 괜찮습니다. 필요한 기본 안내를 함께 제공합니다.",
            description_en: "Little Star Citizen experience is fine. We provide the basics to get you started."
        },
        {
            title: "활동 강제 없음",
            title_en: "No Mandatory Activity",
            description: "상시 의무 활동보다 자율 참여를 우선합니다. 가능한 때에 함께하면 됩니다.",
            description_en: "Voluntary participation comes first. Join whenever your schedule allows."
        },
        {
            title: "Discord 선참여 가능",
            title_en: "Join Discord First",
            description: "지원 전 Discord에 먼저 들어와 분위기와 공지를 확인할 수 있습니다.",
            description_en: "Feel free to join our Discord before applying to check the vibe and announcements."
        },
        {
            title: "다양한 플레이 허용",
            title_en: "All Playstyles Welcome",
            description: "물류·무역 중심이지만 전투, 탐사, 정보 수집 등 다양한 활동을 함께합니다.",
            description_en: "Logistics and trade are our core, but we also run combat, exploration, and intel ops."
        },
        {
            title: "대표 ORG 안내",
            title_en: "Main-ORG Guidance",
            description: "가입 후 대표 ORG 설정 방법을 안내하며, 필요한 절차를 차근히 도와드립니다.",
            description_en: "After joining, we walk you through setting VOLT as your main ORG step by step."
        },
        {
            title: "닉네임 기준 명확",
            title_en: "Clear Nickname Rules",
            description: "디코닉(핸들네임) 형식만 맞추면 운영진과 함대원이 서로를 쉽게 찾을 수 있습니다.",
            description_en: "Match the Discord-nick (handle) format so staff and members can find each other easily."
        }
    ],

    // ===== 운영정책 =====
    policy: {
        lastUpdated: "2026.05.15",
        sections: [
            {
                title: "1조 · 운영진의 역할",
                title_en: "Article 1 · Role of the Staff",
                items: [
                    { num: "1조 1항", num_en: "Art. 1.1", text: "조직장, 임원, 관리자를 포함한 모든 운영진은 질서 있고 쾌적한 조직 운영을 위해 본 정책에 위반되는 사항에 대해 사전 통보 없이 채팅·게시글을 삭제·편집할 수 있으며, 운영정책에 따라 활동을 제한할 수 있습니다.", text_en: "To keep the community orderly and pleasant, all staff — including the organization head, officers, and managers — may delete or edit chats and posts that violate this policy without prior notice, and may restrict activity in accordance with the operating policy." },
                    { num: "1조 2항", num_en: "Art. 1.2", text: "운영진은 구성원 간 분쟁에 중립을 원칙으로 하나, 다수의 피해 발생 시 중재 및 부분 개입이 가능합니다.", text_en: "Staff remain neutral in disputes between members as a rule, but may mediate or partially intervene when harm affects many members." },
                    { num: "1조 3항", num_en: "Art. 1.3", text: "운영정책에 명시되지 않은 사항은 운영진의 판단하에 제재할 수 있습니다.", text_en: "Matters not specified in the operating policy may be sanctioned at the staff's discretion." },
                    { num: "1조 4항", num_en: "Art. 1.4", text: "운영진은 원활한 관리를 위해 일부 정책에 적용받지 않을 수 있으나 이를 악용해서는 안 됩니다.", text_en: "Staff may be exempt from some policies for smooth administration, but must not abuse this." },
                    { num: "1조 5항", num_en: "Art. 1.5", text: "사회적으로 문제가 있거나 관계 법령에 위반되는 경우 본 정책에 명시되지 않더라도 재량으로 제재할 수 있습니다.", text_en: "Conduct that is socially problematic or violates applicable law may be sanctioned at our discretion, even if not specified in this policy." },
                    { num: "1조 6항", num_en: "Art. 1.6", text: "모든 최종 결정은 조직장의 판단에 의해 변경될 수 있습니다.", text_en: "All final decisions may be overridden by the organization head's judgment." }
                ]
            },
            {
                title: "2조 · 구성원의 권리와 의무",
                title_en: "Article 2 · Member Rights & Duties",
                items: [
                    { num: "2조 1항", num_en: "Art. 2.1", text: "구성원은 조직에서 제공하는 콘텐츠, 행사, 복지에 참여할 권리가 있습니다.", text_en: "Members have the right to take part in the content, events, and benefits the organization provides." },
                    { num: "2조 2항", num_en: "Art. 2.2", text: "사회적 통념에 어긋나는 행동으로 타인에게 손해를 끼친 경우 본인이 책임을 집니다.", text_en: "Members are personally responsible for harm caused to others through conduct that violates common social norms." },
                    { num: "2조 3항", num_en: "Art. 2.3", text: "운영진에게 부당한 대우를 받았다고 판단되는 경우 별도 문의 채널을 통해 이의를 제기할 수 있습니다.", text_en: "Members who believe they were treated unfairly by staff may raise an objection through the dedicated inquiry channel." },
                    { num: "2조 4항", num_en: "Art. 2.4", text: "계정 보호의 책임은 본인에게 있으며, 도용으로 발생한 위반 행위 또한 본인 책임입니다.", text_en: "Account security is each member's own responsibility, including any violations that result from account theft." },
                    { num: "2조 5항", num_en: "Art. 2.5", text: "시스템 허점·문제 발견 시 운영진에게 통지해야 하며, 악용·유포는 금지됩니다.", text_en: "Members must report any system flaws or issues they discover to staff; exploiting or spreading them is prohibited." }
                ]
            },
            {
                title: "3조 · 닉네임 규정",
                title_en: "Article 3 · Nickname Rules",
                notice: "디스코드 이름은 인게임 핸들 닉네임과 통일해야 합니다. 예시: 롱만(VOLT_Longman)",
                notice_en: "Your Discord name must match your in-game handle. Example: Longman(VOLT_Longman).",
                items: [
                    { num: "금지", num_en: "Prohibited", text: "운영진을 사칭하거나 오해를 유발하는 닉네임", text_en: "Nicknames that impersonate staff or cause confusion" },
                    { num: "금지", num_en: "Prohibited", text: "선정적이거나 비속어가 포함된 닉네임", text_en: "Nicknames containing explicit or profane language" },
                    { num: "금지", num_en: "Prohibited", text: "반사회적이거나 관계 법령에 위반되는 닉네임", text_en: "Antisocial nicknames, or ones that violate applicable law" },
                    { num: "금지", num_en: "Prohibited", text: "공백·특수문자를 남용하여 가독성을 해치는 닉네임", text_en: "Nicknames that overuse spaces or special characters and hurt readability" }
                ]
            },
            {
                title: "4조 · 위반 항목",
                title_en: "Article 4 · Violations",
                items: [
                    { num: "4조 1항", num_en: "Art. 4.1", text: "공공질서 및 미풍양속 위반 — 욕설·비속어, 성적 수치심 유발 표현, 신체적 비하 발언, 타인 비방, 정치·종교·성별·지역·인종 비하·옹호.", text_en: "Public order & decency — profanity, sexually demeaning expressions, body-shaming, slander, or disparagement/advocacy based on politics, religion, gender, region, or race." },
                    { num: "4조 2항", num_en: "Art. 4.2", text: "부적절한 콘텐츠 게시 — 음란 이미지·링크, 시스템 허점 및 버그 악용 방법 유포, 비인가 프로그램 자료 게시.", text_en: "Inappropriate content — obscene images or links, sharing methods to exploit system flaws and bugs, or posting unauthorized program material." },
                    { num: "4조 3항", num_en: "Art. 4.3", text: "도배 및 홍보 — 동일·무의미한 채팅 반복, 무분별한 광고·홍보, aUEC 구걸, 초대코드 요청.", text_en: "Spam & promotion — repeating identical or meaningless chat, indiscriminate advertising, begging for aUEC, or requesting invite codes." },
                    { num: "4조 4항", num_en: "Art. 4.4", text: "분쟁 및 선동 — 유언비어 유포 및 고의적 잘못된 정보 전파(서버 추방 사유), 편 가르기 및 갈등 고조 행위.", text_en: "Conflict & incitement — spreading rumors or deliberately false information (grounds for server removal), and taking sides or escalating conflict." },
                    { num: "4조 5항", num_en: "Art. 4.5", text: "사칭 및 사기 — 다른 구성원 닉네임 고의 모방, 운영진 사칭, 거래 사기.", text_en: "Impersonation & fraud — deliberately copying another member's nickname, impersonating staff, or trade scams." },
                    { num: "4조 6항", num_en: "Art. 4.6", text: "친목 및 개인정보 — 개인정보 공개, 신규·특정 구성원 배척 행위.", text_en: "Cliques & privacy — disclosing personal information, or excluding new or specific members." },
                    { num: "4조 7항", num_en: "Art. 4.7", text: "인게임 활동 — 트롤링·그리핑 금지, CIG EULA 위반(aUEC 현물 거래 등) 금지.", text_en: "In-game conduct — no trolling or griefing, and no violations of the CIG EULA (such as trading aUEC for real money)." }
                ]
            },
            {
                title: "5조 · 조직 운영 관련 의무사항",
                title_en: "Article 5 · Organizational Obligations",
                items: [
                    { num: "5조 1항", num_en: "Art. 5.1", text: "대표 ORG 설정 — 사전 승낙 없이 VOLT를 대표 ORG로 설정해야 합니다. 1.0 업데이트 이후 모든 콘텐츠 혜택·평판은 대표 조직을 통해 적용됩니다.", text_en: "Main Org setting — set VOLT as your Main Org (no prior approval needed). After the 1.0 update, all content benefits and reputation are applied through your Main Org." },
                    { num: "5조 2항", num_en: "Art. 5.2", text: "조직 활동 참여 의무 — 정식오픈 이후 분기 단위로 최소 1회 참가 이력이 없을 시 미활동 인원으로 분류됩니다.", text_en: "Activity requirement — after official launch, members with no participation record for at least one quarter are classified as inactive." },
                    { num: "5조 3항", num_en: "Art. 5.3", text: "미활동 인원 정리 — 비주기적으로 미활동 인원에 대한 무통보 해임·퇴출이 있을 수 있습니다.", text_en: "Inactive cleanup — inactive members may be dismissed or removed without notice on an irregular basis." }
                ]
            },
            {
                title: "6조 · 누적 경고에 따른 제재",
                title_en: "Article 6 · Penalties for Accumulated Warnings",
                notice: "경고는 부과일 기준 30일간 유지되며, 운영진 재량에 따라 제재 수위가 조정될 수 있습니다.",
                notice_en: "Warnings remain in effect for 30 days from the date issued, and penalty levels may be adjusted at the staff's discretion.",
                items: [
                    { num: "경고 1회", num_en: "1st Warning", text: "7일간 채팅 제한", text_en: "7-day chat restriction" },
                    { num: "경고 2회", num_en: "2nd Warning", text: "30일간 활동 제한", text_en: "30-day activity restriction" },
                    { num: "경고 3회", num_en: "3rd Warning", text: "영구 추방", text_en: "Permanent removal" }
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
            dateLabel_en: "Aug 2026 (planned)",
            title: "TSG 미션 (4.8 업데이트 후)",
            title_en: "TSG Mission (after 4.8 update)",
            description: "4.8 업데이트 이후 진행 예정. 우주팀(함대 기동·제공권 확보)과 스테이션 진입팀(FPS 교전)으로 나뉘어 수행.",
            description_en: "Planned after the 4.8 update. Split into a space team (fleet maneuvers, air superiority) and a station-entry team (FPS combat).",
            type: "작전",
            type_en: "Operation",
            status: "예정",
            status_en: "Upcoming"
        },
        {
            id: "cal-002",
            date: "2026.Q3",
            dateLabel: "2026년 3분기",
            dateLabel_en: "Q3 2026",
            title: "분기 정기 이벤트",
            title_en: "Quarterly Fleet Event",
            description: "함대원 전원이 참여하는 분기별 공식 이벤트. 세부 일정은 디스코드 공지 채널에서 확인.",
            description_en: "An official quarterly event for the whole fleet. Check the Discord announcements channel for details.",
            type: "이벤트",
            type_en: "Event",
            status: "예정",
            status_en: "Upcoming"
        },
        {
            id: "cal-003",
            date: "2026.TBD",
            dateLabel: "일정 미정",
            dateLabel_en: "Date TBD",
            title: "유저 거래소 프로젝트 재개",
            title_en: "User Marketplace Project Restart",
            description: "버그 수정 및 시장 경쟁력 확보 후 샤타곤 유저 거래소 프로젝트 재개 예정.",
            description_en: "The Shatagon user-marketplace project will resume after bug fixes and securing market competitiveness.",
            type: "프로젝트",
            type_en: "Project",
            status: "대기",
            status_en: "On hold"
        },
        {
            id: "cal-004",
            date: "2026.TBD",
            dateLabel: "1.0 출시 후",
            dateLabel_en: "After 1.0 launch",
            title: "세금 제도 도입",
            title_en: "Tax System Introduction",
            description: "스테이션·전초기지·함대 복지 운영을 위한 세금 제도 도입 예정. 정식오픈 초기 세율 높게 책정 후 안정화 이후 재조정.",
            description_en: "A tax system is planned to fund stations, outposts, and fleet welfare. Rates will start high at launch and be re-tuned once things stabilize.",
            type: "정책",
            type_en: "Policy",
            status: "계획",
            status_en: "Planned"
        }
    ],

    // ===== 함선 데이터베이스 =====
    // ===== FAQ =====
    faq: [
        {
            q: "VOLT 함대에 가입하려면 어떻게 해야 하나요?",
            q_en: "How do I join the VOLT fleet?",
            a: "홈페이지 '가입하기' 섹션에서 구글 폼 지원서를 제출하거나, 디스코드 서버에 참여 후 운영진에게 DM을 보내시면 됩니다. 게임 경험과 무관하게 누구나 지원 가능합니다.",
            a_en: "Submit the Google Form application in the 'Join' section of the site, or join our Discord and DM the staff. Anyone can apply, regardless of game experience."
        },
        {
            q: "디스코드 닉네임은 어떻게 설정해야 하나요?",
            q_en: "How should I set my Discord nickname?",
            a: "디스코드 닉네임(스타시티즌 핸들네임) 형식으로 설정해야 합니다. 예시: 롱만(VOLT_Longman). 미변경 시 운영진이 임의로 수정할 수 있습니다.",
            a_en: "Use the format Discord nickname (Star Citizen handle). Example: Longman(VOLT_Longman). If left unchanged, staff may adjust it."
        },
        {
            q: "대표 ORG를 VOLT로 설정하는 방법은?",
            q_en: "How do I set VOLT as my Main Org?",
            a: "RSI 공식 홈페이지(robertsspaceindustries.com) 로그인 → My RSI → Organizations → VOLT 검색 후 가입 → 내 조직 목록에서 VOLT를 대표 ORG로 설정하시면 됩니다.",
            a_en: "On the official RSI site (robertsspaceindustries.com): log in → My RSI → Organizations → search for VOLT and join → then set VOLT as your Main Org in your organization list."
        },
        {
            q: "운영정책 위반 시 어떻게 되나요?",
            q_en: "What happens if I break the operating policy?",
            a: "경고 누적에 따라 채팅 제한(1회), 활동 제한(2회), 영구 추방(3회)이 적용됩니다. 경고는 부과일 기준 30일간 유지됩니다. 중대한 위반은 경고 없이 즉시 처리될 수 있습니다.",
            a_en: "Warnings escalate to a chat restriction (1st), an activity restriction (2nd), and permanent removal (3rd). Warnings stay in effect for 30 days from the date issued. Serious violations may be handled immediately, without warning."
        },
        {
            q: "오래 접속을 못 해도 되나요?",
            q_en: "Is it okay if I can't log in for a while?",
            a: "비주기적으로 잠수 인원 조사가 진행됩니다. 응답하지 않으면 외부손님 권한으로 변경될 수 있습니다. 복귀를 원하실 경우 운영진에게 문의하시면 됩니다.",
            a_en: "We review inactive members from time to time. If you don't respond, your role may be changed to guest. If you'd like to return, just reach out to the staff."
        },
        {
            q: "무역허브는 어떻게 이용하나요?",
            q_en: "How do I use the Trade Hub?",
            a: "디스코드 내 VOLT-무역허브 채널에서 지정 양식에 맞춰 아이템 거래 또는 임무 모집 글을 게시할 수 있습니다. 모든 거래는 인게임 화폐(aUEC)만 허용됩니다.",
            a_en: "In the VOLT Trade Hub channel on Discord, you can post item trades or mission listings using the designated template. All trades are limited to in-game currency (aUEC) only."
        },
        {
            q: "VOLT는 어떤 성향의 함대인가요?",
            q_en: "What kind of fleet is VOLT?",
            a: "친(UEE) 성향의 질서 지향적 조직입니다. 물류·무역을 중심으로 전투, 탐사, 정보 수집 등 다양한 활동을 아우릅니다. 이유 없는 공격, 트롤링, 비매너 플레이는 지양합니다.",
            a_en: "A pro-UEE, order-oriented organization. Centered on logistics and trade, we span combat, exploration, intel gathering, and more. We avoid unprovoked attacks, trolling, and poor sportsmanship."
        },
        {
            q: "부서가 있나요?",
            q_en: "Are there departments?",
            a: "현재는 별도의 고정 부서 없이 VOLT 함대원으로 통합 운영되고 있습니다. 각자의 플레이 스타일에 맞게 물류·전투·탐사 등 자유롭게 활동하실 수 있습니다.",
            a_en: "Right now we operate as one unified VOLT crew, without fixed departments. You're free to focus on logistics, combat, exploration, and more — whatever fits your play style."
        }
    ],

    // ===== 무역 가이드 =====
    tradeGuide: [
        {
            step: 1,
            title: "기본 무역 흐름",
            title_en: "Basic Trade Flow",
            content: "저렴한 곳에서 구매 → 비싼 곳에서 판매. Trade Tools(sc-trade.tools, uexcorp.space)로 최적 루트를 미리 확인하세요.",
            content_en: "Buy low, sell high. Use Trade Tools (sc-trade.tools, uexcorp.space) to plan the optimal route in advance."
        },
        {
            step: 2,
            title: "추천 입문 루트",
            title_en: "Recommended Starter Route",
            content: "스탠턴 기준: Microtech ↔ ArcCorp 구간이 초보자에게 안정적입니다. 화물칸 용량에 맞는 고수익 상품을 선택하세요.",
            content_en: "In Stanton, the Microtech \u2194 ArcCorp leg is stable for beginners. Pick a high-yield commodity that fits your cargo capacity."
        },
        {
            step: 3,
            title: "함선 선택 기준",
            title_en: "Choosing a Ship",
            content: "입문: Cutlass Black(46 SCU) / 중급: Freelancer MAX(122 SCU) / 고급: Hull C(4,608 SCU). 초기엔 소형 화물선으로 루트를 익히는 것을 권장합니다.",
            content_en: "Starter: Cutlass Black (46 SCU) / Mid: Freelancer MAX (122 SCU) / Advanced: Hull C (4,608 SCU). Early on, learn routes with a small freighter."
        },
        {
            step: 4,
            title: "리스크 관리",
            title_en: "Risk Management",
            content: "파이로 시스템은 무법 지대입니다. 고가치 화물 운송 시 호위를 요청하거나 VOLT-무역허브에서 경호 임무를 모집하세요.",
            content_en: "The Pyro system is lawless. When hauling high-value cargo, request an escort or recruit security runs in the VOLT Trade Hub."
        },
        {
            step: 5,
            title: "함대 내부 거래",
            title_en: "In-Fleet Trading",
            content: "전리품·부품 판매 시 NPC보다 높은 가격에 함대원에게 판매 가능합니다. VOLT-무역허브 채널을 적극 활용하세요.",
            content_en: "You can sell loot and parts to fleet members above NPC prices. Make active use of the VOLT Trade Hub channels."
        },
        {
            step: 6,
            title: "버그·규정 주의",
            title_en: "Bugs & Rules",
            content: "화물 복사 버그 등 게임 내 버그 악용은 CIG 제재(최대 계정 정지) 및 함대 제재 대상입니다. 발견 시 운영진에게 제보해 주세요.",
            content_en: "Exploiting in-game bugs such as cargo duplication is subject to CIG penalties (up to account suspension) and fleet sanctions. Report any you find to the staff."
        }
    ]
};

// 전역 객체로 노출 (향후 모듈 시스템 도입 시 export로 변경)
if (typeof window !== 'undefined') {
    window.VOLT_DATA = VOLT_DATA;
}
