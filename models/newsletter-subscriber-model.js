const AppError = require("../error.js");
const Logger = require("../logger.js");

// Utilities
const Database = require("../utilities/database.js");
const Secure = require("../utilities/secure.js");
const Email = require("../utilities/email.js");

// Constants
const EMAIL_SALT = process.env.EMAIL_SALT;
const AES_EMAIL_KEY = process.env.AES_EMAIL_KEY;
const SUBSCRIBERS_PER_EMAIL_BATCH = 50;

class NewsletterSubscriber {
  
  constructor(row, decryptEmail = false) {
    this.id = row.id;
    this.emailEncrypted = row.email_encrypted;
    this.emailHashed = row.email_hashed;
    this.emailConfirmed = row.email_confirmed;
    this.emailConfirmCode = row.email_confirm_code;
    this.doNotEmailCode = row.do_not_email_code;
    this.createDate = new Date(row.create_date);
    
    if (decryptEmail === true) {
      this.emailDecrypted = Secure.aesDecrypt(this.emailEncrypted, AES_EMAIL_KEY, true);
    }
  }
  
  static sendTemplateToAllSubscribers(templateName, batch = 0) {
    // Look up emails in batches
    return Database.query(
      `SELECT email_encrypted, do_not_email_code FROM newsletter_subscribers
        WHERE
          email_encrypted IS NOT NULL AND
          email_confirmed = true
        ORDER BY id
        LIMIT $1
        OFFSET CAST ($2 AS INTEGER) * CAST ($1 AS INTEGER)`,
      [SUBSCRIBERS_PER_EMAIL_BATCH, batch])
      .catch( error => {
        throw new AppError(500, 15, "Error getting newsletter subscribers.", error);
      })
      .then( result => {
        var numResults = result.rows.length;
        if (numResults == 0) {
          Logger.info(`No newsletter subscribers left to send post to. Completed.`);
          return true;
        }
        else {
          Logger.info(`Sending batch ${batch} with ${numResults} recipients. Estimated total sent: ${batch * SUBSCRIBERS_PER_EMAIL_BATCH}.`);
          var recipients = [];
          result.rows.forEach( row => {
            recipients.push(new NewsletterSubscriber(row, true));
          });
          return Email.sendNewsletterTemplate(templateName, recipients)
            .catch( error => {
              // Log error for this batch but continue.
              Logger.error(`Error sending template ${templateName} to newsletter on batch ${batch}: ${error}.`);
            })
            .then( result => {
              return module.exports.sendTemplateToAllSubscribers(templateName, batch + 1);
            });
        }
      });
  }
  
  static getNumberConfirmed() {
    return Database.query(
      `SELECT count(id) FROM newsletter_subscribers
        WHERE email_encrypted IS NOT NULL AND
        email_confirmed = true`,
      [])
      .catch( error => {
        throw new AppError(500, 15, "Error getting total confirmed newsletter subscribers.", error);
      })
      .then( result => {
        return result.rows[0].count;
      });
  }
  
  static getNumberUnconfirmed() {
    return Database.query(
      `SELECT count(id) FROM newsletter_subscribers
        WHERE email_encrypted IS NOT NULL AND
        email_confirmed = false`,
      [])
      .catch( error => {
        throw new AppError(500, 15, "Error getting total unconfirmed newsletter subscribers.", error);
      })
      .then( result => {
        return result.rows[0].count;
      });
  }
  
  static getNumberDoNotEmail() {
    return Database.query(
      `SELECT count(id) FROM newsletter_subscribers
        WHERE email_encrypted IS NULL`,
      [])
      .catch( error => {
        throw new AppError(500, 15, "Error getting total opted-out newsletter subscribers.", error);
      })
      .then( result => {
        return result.rows[0].count;
      });
  }
  
  static getByEmail(email) {
    const emailHashed = Secure.hashEmail(email, EMAIL_SALT);
    return Database.query(
      `SELECT * FROM newsletter_subscribers
      WHERE email_hashed = $1
      LIMIT 1`,
      [emailHashed])
      .catch( error => {
        throw new AppError(500, 15, "Error getting newsletter subscriber by email.", error);
      })
      .then( result => {
        if (result.rows.length !== 1) {
          return false;
        }
        else {
          return new NewsletterSubscriber(result.rows[0]);
        }
      });
  }
  
  static create(email) {
    // Check if this email already is in the database    
    return module.exports.getByEmail(email)
      .then( newsletterSubscriber => {
        if (newsletterSubscriber) {
          if (!newsletterSubscriber.emailConfirmed) {
    // Email already in database, but not confirmed. Resend confirmation and show error.
            return Email.sendNewsletterSubscribeConfirmation(email, newsletterSubscriber.emailConfirmCode, newsletterSubscriber.doNotEmailCode)
              .then(result => {
                throw new AppError(400, 14, "Last step - click the confirmation link in your email. If you don't see it, check your spam folder.");
              })
          }
    // Email in database and confirmed.
          else {
            throw new AppError(400, 13, "That email is already subscribed.");
          }
        }
    // Email not in database, add it and send confirmation email
        else {
          const id = Secure.randomString(32)
          const emailHashed = Secure.hashEmail(email, EMAIL_SALT);
          const emailEncrypted = Secure.aesEncrypt(email, AES_EMAIL_KEY);
          const emailConfirmCode = Secure.generateEmailConfirmCode();
          const doNotEmailCode = Secure.generateEmailConfirmCode();
          return Database.query(
            `INSERT INTO newsletter_subscribers(id, email_hashed, email_encrypted, email_confirm_code, do_not_email_code)
            VALUES($1, $2, $3, $4, $5)
            RETURNING *`,
            [id, emailHashed, emailEncrypted, emailConfirmCode, doNotEmailCode])
            .catch( error => {
              throw new AppError(500, 14, "Error adding newsletter subscriber", error);
            })
            .then( result => {
              return Email.sendNewsletterSubscribeConfirmation(email, emailConfirmCode, doNotEmailCode);
            });
        }
      });
  }
  
  static confirm(email, code) {
    const emailHashed = Secure.hashEmail(email, EMAIL_SALT);
    // Look up email
    return module.exports.getByEmail(email)
      .then( newsletterSubscriber => {
        if (newsletterSubscriber) {
    // Email already confirmed
          if (newsletterSubscriber.emailConfirmed) {
            return true;
          }
    // Email not confirmed, confirm it
          else {
            return Database.query(
              `UPDATE newsletter_subscribers 
              SET email_confirmed = true 
              WHERE email_confirm_code = $1 AND
                email_confirmed = false AND
                email_hashed = $2
              RETURNING *`,
              [code, emailHashed])
            .catch( error => {
              throw new AppError(500, 19, "Error accepting confirmation code.", error);
            })
            .then( result => {
              if (result.rowCount !== 1) {
                throw new AppError(400, 18, "No such confirmation code and email combination.");
              }
              return new NewsletterSubscriber(result.rows[0]);
            });
          }
        }
        else {
          throw new AppError(400, 18, "No such email and confirmation code.");
        }
      })
  }
  
  static setDoNotEmail(email, code, reason) {
    const emailHashed = Secure.hashEmail(email, EMAIL_SALT);
    return Database.query(
      `UPDATE newsletter_subscribers
      SET email_encrypted = NULL
      WHERE email_hashed = $1 AND do_not_email_code = $2
      RETURNING *`,
      [emailHashed, code])
      .catch( error => {
        throw new AppError(500, 7, "Error setting newsletter subscriber do not email.", error);
      })
      .then( result => {
        if (result.rowCount !== 1) {
          throw new AppError(400, 89, "Incorrect code and/or email for newsletter opt-out.");
        }
        Logger.info("Newsletter subscriber cancelled reason: " + reason);
        return true;
      });
  }
  
}

module.exports = NewsletterSubscriber;