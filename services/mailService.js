const nodemailer = require('nodemailer');
const conf = require('../conf');

const transporter = nodemailer.createTransport(conf.mail);

function sendMail(options) {
    return new Promise((resolve, reject) => {
        transporter.sendMail(options, (error, info) => {
            if (error) reject(error);
            else resolve(info);
        });
    });
}

module.exports = { sendMail };