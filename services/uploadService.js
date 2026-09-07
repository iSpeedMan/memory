'use strict';

const fs = require('fs');
const path = require('path');

const publicRoot = path.resolve(__dirname, '../public');
const uploadsRoot = path.resolve(publicRoot, 'uploads');

function assertInsideUploadRoot(candidate) {
    const resolved = path.resolve(candidate);
    if (resolved !== uploadsRoot && !resolved.startsWith(`${uploadsRoot}${path.sep}`)) {
        throw new Error('upload_path_outside_root');
    }
    return resolved;
}

function resolveUploadPath(publicUrl) {
    if (typeof publicUrl !== 'string' || !publicUrl.startsWith('/uploads/')) {
        throw new Error('invalid_upload_path');
    }
    return assertInsideUploadRoot(path.join(publicRoot, publicUrl));
}

function safeDeleteUpload(publicUrl) {
    try {
        const resolved = resolveUploadPath(publicUrl);
        const stat = fs.lstatSync(resolved);
        if (stat.isSymbolicLink() || !stat.isFile()) return false;
        fs.unlinkSync(resolved);
        return true;
    } catch (_) {
        return false;
    }
}

function cleanupFiles(files) {
    for (const file of files || []) {
        if (file?.path) safeDeleteUpload('/' + path.relative(publicRoot, file.path).replace(/\\/g, '/'));
    }
}

function publicUrlForFile(file) {
    const resolved = assertInsideUploadRoot(file.path);
    return '/' + path.relative(publicRoot, resolved).replace(/\\/g, '/');
}

module.exports = {
    publicRoot,
    uploadsRoot,
    assertInsideUploadRoot,
    resolveUploadPath,
    safeDeleteUpload,
    cleanupFiles,
    publicUrlForFile
};