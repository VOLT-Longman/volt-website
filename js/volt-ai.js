// VOLT AI — 준비 중(coming soon) 상태 전용 스크립트.
// 실제 어시스턴트 구현 시 이 파일을 교체한다. (main.js에 추가하지 말 것 — README 참조)
(function () {
    'use strict';

    function setupVoltAiComingSoon() {
        const form = document.getElementById('volt-ai-form');
        if (!form) return;

        // 마크업의 disabled 속성이 1차 방어, 여기는 2차 방어.
        form.addEventListener('submit', function (event) {
            event.preventDefault();
        });

        const controls = [
            document.getElementById('volt-ai-input'),
            document.getElementById('volt-ai-send'),
            document.getElementById('volt-ai-image-button'),
            document.getElementById('volt-ai-voice-button'),
            document.getElementById('volt-ai-file'),
            document.getElementById('volt-ai-new-chat'),
            document.getElementById('volt-ai-history-button'),
            document.getElementById('volt-ai-settings-button'),
        ];
        controls.forEach((el) => {
            if (el) el.disabled = true;
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupVoltAiComingSoon);
    } else {
        setupVoltAiComingSoon();
    }
})();
