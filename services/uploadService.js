'use strict';

const fs = require('fs');
const path = require('path');
const conf = require('../conf');

const publicRoot = path.resolve(__dirname, '../public');
const uploadsRoot = path.resolve(conf.storage.uploadsDir);

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
    return assertInsideUploadRoot(path.join(uploadsRoot, publicUrl.slice('/uploads/'.length)));
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

const IMAGE_SIGNATURES = {
    'image/png': (header, bytesRead) =>
        bytesRead >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/jpeg': (header, bytesRead) =>
        bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff,
    'image/gif': (header, bytesRead) =>
        bytesRead >= 6 && (header.subarray(0, 6).toString('ascii') === 'GIF87a' || header.subarray(0, 6).toString('ascii') === 'GIF89a'),
    'image/webp': (header, bytesRead) =>
        bytesRead >= 12 && header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP'
};

function validateImageFile(file, allowedMimeTypes = Object.keys(IMAGE_SIGNATURES)) {
    if (!file?.path || !allowedMimeTypes.includes(file.mimetype)) return false;
    const signatureCheck = IMAGE_SIGNATURES[file.mimetype];
    if (!signatureCheck) return false;

    let fd;
    try {
        fd = fs.openSync(file.path, 'r');
        const header = Buffer.alloc(12);
        const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
        return signatureCheck(header, bytesRead);
    } catch (_) {
        return false;
    } finally {
        if (fd !== undefined) {
            try { fs.closeSync(fd); } catch (_) {}
        }
    }
}

function publicUrlForFile(file) {
    const resolved = assertInsideUploadRoot(file.path);
    return '/uploads/' + path.relative(uploadsRoot, resolved).replace(/\\/g, '/');
}

module.exports = {
    publicRoot,
    uploadsRoot,
    assertInsideUploadRoot,
    resolveUploadPath,
    safeDeleteUpload,
    cleanupFiles,
    validateImageFile,
    publicUrlForFile
};