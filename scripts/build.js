#!/usr/bin/env node
'use strict';
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');

const JS_ORDER = [
    'utils.js', 'i18n.js', 'file-picker.js', 'audio.js', 'auth.js',
    'lobby-rooms.js', 'lobby-profile.js', 'lobby-leaderboard.js',
    'lobby-chat.js', 'lobby-bot.js', 'lobby-suggest.js', 'admin.js', 'game.js'
];

const STATIC_FILES = ['style.css', 'sw.js', 'manifest.json', 'offline.html'];
const STATIC_DIRS  = ['icons', 'sounds'];

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
        const s = path.join(src, file);
        const d = path.join(dest, file);
        if (fs.statSync(s).isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

async function build() {
    console.log('🔨  Metro Memory — production build');
    const t0 = Date.now();

    if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
    fs.mkdirSync(distDir, { recursive: true });

    const originalSize = JS_ORDER.reduce((sum, f) => sum + fs.statSync(path.join(publicDir, f)).size, 0);

    const combined = JS_ORDER.map(f => {
        const content = fs.readFileSync(path.join(publicDir, f), 'utf8');
        return `/* === ${f} === */\n${content}`;
    }).join('\n\n');

    const tmpFile = path.join(distDir, '_tmp.js');
    fs.writeFileSync(tmpFile, combined);

    await esbuild.build({
        entryPoints: [tmpFile],
        outfile: path.join(distDir, '_bundle.js'),
        minify: true,
        bundle: false,
        target: ['es2018'],
        logLevel: 'silent'
    });
    fs.unlinkSync(tmpFile);

    const minified = fs.readFileSync(path.join(distDir, '_bundle.js'));
    const hash = crypto.createHash('md5').update(minified).digest('hex').slice(0, 8);
    const bundleName = `app.${hash}.min.js`;
    fs.renameSync(path.join(distDir, '_bundle.js'), path.join(distDir, bundleName));

    for (const file of STATIC_FILES) {
        const src = path.join(publicDir, file);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(distDir, file));
    }
    for (const dir of STATIC_DIRS) {
        const src = path.join(publicDir, dir);
        if (fs.existsSync(src)) copyDir(src, path.join(distDir, dir));
    }

    const uploadsDir = path.join(root, 'uploads');
    if (fs.existsSync(uploadsDir)) copyDir(uploadsDir, path.join(distDir, 'uploads'));

    let html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    html = html.replace(
        /<script src="\/socket\.io\/socket\.io\.js"><\/script>[\s\S]*?<script src="game\.js"><\/script>/,
        `<script src="/socket.io/socket.io.js"></script>\n    <script src="/${bundleName}"></script>`
    );
    fs.writeFileSync(path.join(distDir, 'index.html'), html);

    const bundleSize = fs.statSync(path.join(distDir, bundleName)).size;
    const pct = Math.round((1 - bundleSize / originalSize) * 100);
    console.log(`✅  ${bundleName}`);
    console.log(`    JS: ${(originalSize / 1024).toFixed(1)} KB → ${(bundleSize / 1024).toFixed(1)} KB  (${pct}% smaller, ${JS_ORDER.length} files → 1)`);
    console.log(`    Done in ${Date.now() - t0} ms`);
}

build().catch(err => { console.error('Build failed:', err.message); process.exit(1); });
