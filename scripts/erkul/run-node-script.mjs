import { spawn } from 'node:child_process';

// Erkul 재생성 단계를 실행하는 공용 러너.
//  · 출력을 버퍼링하지 않고 그대로 상속(기본 stdio: 'inherit')해 CI 로그에 실시간 노출한다.
//    execFile 계열은 출력을 캡처하므로 대형 생성 로그가 maxBuffer(기본 1MB)를 넘으면 ENOBUFS로 실패한다 —
//    spawn 스트리밍에는 그 경로 자체가 없다.
//  · shell을 사용하지 않는다(인자 주입 차단).
//  · 비정상 종료(exit code) · 시그널 종료 · spawn 실패를 각각 구분해 원인과 함께 실패시킨다.
export function runNodeScript(scriptPath, args = [], options = {}) {
    return new Promise((settle, fail) => {
        const child = spawn(process.execPath, [scriptPath, ...args], {
            cwd: options.cwd,
            stdio: options.stdio ?? 'inherit',
            shell: false
        });
        child.once('error', (error) => fail(new Error(`failed to start ${scriptPath}: ${error.message}`)));
        child.once('close', (code, signal) => {
            if (signal) return fail(new Error(`${scriptPath} was terminated by signal ${signal}`));
            if (code !== 0) return fail(new Error(`${scriptPath} exited with code ${code}`));
            return settle();
        });
    });
}
