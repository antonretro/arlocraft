const path = require('path');
const { spawn } = require('child_process');

const electronBinary = require('electron');
const projectRoot = path.join(__dirname, '..');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [projectRoot], {
    stdio: 'inherit',
    env
});

child.on('exit', (code) => {
    process.exit(code ?? 0);
});

child.on('error', (error) => {
    console.error('[ArloCraft] Desktop launch failed:', error);
    process.exit(1);
});
