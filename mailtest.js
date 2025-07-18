const nodemailer = require('nodemailer');
const { google } = require('googleapis');
require('dotenv').config();

const OAuth2 = google.auth.OAuth2;

const oauth2Client = new OAuth2(
    process.env.GMAIL_CLIENT_ID, // ClientID
    process.env.GMAIL_CLIENT_SECRET, // Client Secret
    "https://developers.google.com/oauthplayground" // Redirect URL
);

oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
});

async function sendMail() {
    try {
        const accessToken = await oauth2Client.getAccessToken();

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: process.env.GMAIL_USER,
                clientId: process.env.GMAIL_CLIENT_ID,
                clientSecret: process.env.GMAIL_CLIENT_SECRET,
                refreshToken: process.env.GMAIL_REFRESH_TOKEN,
                accessToken: accessToken.token
            }
        });

        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: 'motokinakajima0912@gmail.com',
            subject: 'Test Email',
            text: 'Hello, this is a test email!',
            html: '<b>Hello, this is a test email!</b>'
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('Email sent:', result);
    } catch (error) {
        console.log('Error:', error);
    }
}

sendMail();
