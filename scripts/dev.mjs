import { spawn } from 'node:child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const children = [
  spawn(npmCmd, ['run', 'dev:server'], { stdio: 'inherit', shell: process.platform === 'win32' }),
  spawn(npmCmd, ['run', 'dev:web'], { stdio: 'inherit', shell: process.platform === 'win32' }),
];

let shuttingDown = false;

function stopAll(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
  process.exit(code);
}

for (const child of children) {
  child.on('exit', (code) => {
    if (!shuttingDown && code !== 0 && code !== null) {
      stopAll(code);
    }
  });
}

process.on('SIGINT', () => {
  stopAll(0);
});
process.on('SIGTERM', () => {
  stopAll(0);
});
