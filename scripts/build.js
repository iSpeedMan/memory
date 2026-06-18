#!/usr/bin/env node
'use strict';
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root       = path.resolve(__dirname, '..');
const publicDir  = path.join(root, 'public');
const distDir    = path.join(root, 'dist');
const jsDir      = path.join(publicDir, 'js');
const localesDir = path.join(publicDir, 'locales');
const cssDir     = path.join(publicDir, 'css');

// Полный порядок файлов — locales + все JS (ни один не пропущен)
const JS_ENTRIES = [
    { dir: localesDir, file: 'ru.js' },
    { dir: localesDir, file: 'en.js' },
    { dir: jsDir, file: 'utils.js' },
    { dir: jsDir, file: 'i18n.js' },
    { dir: jsDir, file: 'file-picker.js' },
    { dir: jsDir, file: 'audio.js' },
    { dir: jsDir, file: 'auth.js' },
    { dir: jsDir, file: 'lobby-friends.js' },
    { dir: jsDir, file: 'lobby-rooms.js' },
    { dir: jsDir, file: 'lobby-profile.js' },
    { dir: jsDir, file: 'lobby-leaderboard.js' },
    { dir: jsDir, file: 'lobby-chat.js' },
    { dir: jsDir, file: 'lobby-bot.js' },
    { dir: jsDir, file: 'lobby-suggest.js' },
    { dir: jsDir, file: 'admin-stats.js' },
    { dir: jsDir, file: 'admin-categories.js' },
    { dir: jsDir, file: 'admin-users.js' },
    { dir: jsDir, file: 'admin-custom-cats.js' },
    { dir: jsDir, file: 'admin.js' },
    { dir: jsDir, file: 'game.js' },
    { dir: jsDir, file: 'hints.js' },
    { dir: jsDir, file: 'local-game.js' },
];

const STATIC_FILES = ['sw.js', 'manifest.json', 'offline.html'];
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

    // ── 1. JS bundle ──────────────────────────────────────────────────────────
    const originalJsSize = JS_ENTRIES.reduce(
        (sum, { dir, file }) => sum + fs.statSync(path.join(dir, file)).size, 0
    );

    const combined = JS_ENTRIES.map(({ dir, file }) => {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        return `/* === ${file} === */\n${content}`;
    }).join('\n\n');

    const tmpFile = path.join(distDir, '_tmp.js');
    fs.writeFileSync(tmpFile, combined);

    await esbuild.build({
        entryPoints: [tmpFile],
        outfile: path.join(distDir, '_bundle.js'),
        minify: true,
        bundle: false,
        target: ['es2018'],
        logLevel: 'silent',
    });
    fs.unlinkSync(tmpFile);

    const minifiedJs   = fs.readFileSync(path.join(distDir, '_bundle.js'));
    const jsHash       = crypto.createHash('md5').update(minifiedJs).digest('hex').slice(0, 8);
    const bundleName   = `app.${jsHash}.min.js`;
    fs.renameSync(path.join(distDir, '_bundle.js'), path.join(distDir, bundleName));

    // ── 2. CSS minification ───────────────────────────────────────────────────
    const originalCss  = fs.readFileSync(path.join(cssDir, 'style.css'), 'utf8');
    const { code: minCss } = await esbuild.transform(originalCss, {
        loader: 'css',
        minify: true,
    });
    const cssHash      = crypto.createHash('md5').update(minCss).digest('hex').slice(0, 8);
    const cssName      = `style.${cssHash}.min.css`;
    fs.writeFileSync(path.join(distDir, cssName), minCss);

    // ── 3. Static files ───────────────────────────────────────────────────────
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

    // ── 4. HTML: inject hashed bundle & CSS, remove all old script/style tags ─
    let html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

    // Заменяем <link rel="stylesheet" href="css/style.css"> на хэшированный CSS
    html = html.replace(
        /<link rel="stylesheet" href="css\/style\.css">/,
        `<link rel="stylesheet" href="/${cssName}">`
    );

    // Заменяем ВСЕ script-теги (от socket.io до local-game.js) на 2: socket.io + бандл
    html = html.replace(
        /<script src="\/socket\.io\/socket\.io\.js"><\/script>[\s\S]*?<script src="js\/local-game\.js"><\/script>/,
        `<script src="/socket.io/socket.io.js"></script>\n    <script src="/${bundleName}" defer></script>`
    );

    fs.writeFileSync(path.join(distDir, 'index.html'), html);

    // ── 5. Stats ──────────────────────────────────────────────────────────────
    const bundleSize = fs.statSync(path.join(distDir, bundleName)).size;
    const jsPct      = Math.round((1 - bundleSize / originalJsSize) * 100);
    const cssPct     = Math.round((1 - minCss.length / originalCss.length) * 100);
    const fileCount  = JS_ENTRIES.length;
    console.log(`✅  ${bundleName}`);
    console.log(`    JS:  ${(originalJsSize / 1024).toFixed(1)} KB → ${(bundleSize / 1024).toFixed(1)} KB  (${jsPct}% меньше, ${fileCount} файлов → 1)`);
    console.log(`✅  ${cssName}`);
    console.log(`    CSS: ${(originalCss.length / 1024).toFixed(1)} KB → ${(minCss.length / 1024).toFixed(1)} KB  (${cssPct}% меньше)`);
    console.log(`    Готово за ${Date.now() - t0} мс`);
}

build().catch(err => { console.error('Build failed:', err.message); process.exit(1); });
