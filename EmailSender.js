const nodemailer = require('nodemailer');
const { google } = require('googleapis');

class EmailSender {
  constructor(user, clientId, clientSecret, refreshToken) {
    this.user = user;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;

    this.oAuth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      'https://developers.google.com/oauthplayground'
    );
    this.oAuth2Client.setCredentials({ refresh_token: this.refreshToken });
  }

  async sendEmail(to, subject, text, html) {
    try {
      const accessToken = await this.oAuth2Client.getAccessToken();

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: this.user,
          clientId: this.clientId,
          clientSecret: this.clientSecret,
          refreshToken: this.refreshToken,
          accessToken: accessToken.token,
        },
      });

      const mailOptions = {
        from: this.user,
        to,
        subject,
        text,
        html,
      };

      const result = await transporter.sendMail(mailOptions);
      console.log('Email sent:', result);
      return result;
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }
}

module.exports = EmailSender;