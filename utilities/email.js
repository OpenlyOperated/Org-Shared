const AppError = require("../error.js");
const Logger = require("../logger.js");

const DOMAIN = process.env.DOMAIN;
const NODE_ENV = process.env.NODE_ENV;
const EMAIL_SALT = process.env.EMAIL_SALT;

const Database = require("../utilities/database.js");
const Secure = require("../utilities/secure.js");

const fs = require("fs-extra");
const path = require("path");
const handlebars = require("handlebars");
const AWS = require("aws-sdk");
const awsSesClient = new AWS.SES({
  apiVersion: "2010-12-01",
  region: "us-east-1"
});

module.exports = {
  
  // === Admin/Support
  sendConfirmationAdmin: (toAddress, code) => {
    return send(
      `admin@${DOMAIN}`,
      toAddress,
      "Click to Confirm Email",
      "confirm-admin-email",
      {
        confirmemailurl: `https://admin.${DOMAIN}/confirm-email?code=${code}`
      }
    );
  },
  
  sendAdminAlert: (subject, body) => {
    Logger.info(`Sending Admin Email
      SUBJECT: ${subject}
      BODY: ${body}`);
    return sendPlain(
      `admin@${DOMAIN}`,
      `admin@${DOMAIN}`,
      `[ADMIN ALERT] ${subject}`,
      body
    );
  },
  
  createNewsletterTemplate: (post) => {
    const templateName = "newsletter_" + post.id + "_" + Secure.randomString(10);
    const subject = post.title;
    const parameters = {
      post: post,
      DOMAIN: DOMAIN
    };
    var html, text;
    return getCompiledEmail(`newsletter-template.html`, parameters)
    .then(result => {
      html = result;
      return getCompiledEmail(`newsletter-template.txt`, parameters);
    })
    .then(result => {
      text = result;
      return awsSesClient.createTemplate({ 
        Template: {
          TemplateName: templateName,
          SubjectPart: subject,
          HtmlPart: html,
          TextPart: text
        }
      }).promise();
    })
    .then(result => {
      return templateName;
    });
  },
  
  sendNewsletterTemplate: (templateName, newsletterSubscribers) => {
    const from = `Openly Operated <hi@${DOMAIN}>`;
    var destinations = [];
    for (const newsletterSubscriber of newsletterSubscribers) {
      destinations.push({
        Destination: {
          ToAddresses: [
            newsletterSubscriber.emailDecrypted
          ]
        },
        ReplacementTemplateData: JSON.stringify({
          doNotEmailUrl: `https://${DOMAIN}/newsletter-do-not-email?email=${newsletterSubscriber.emailDecrypted}&code=${newsletterSubscriber.doNotEmailCode}`
        })
      });
    }
    if (NODE_ENV === "test") {
      Logger.info(`Test env - not sending templated email, would have sent:
        From: ${fromAddress}
        Emails/Parameters: ${emailToParameter}`);
      return Promise.resolve("testSuccess");
    }
    else {
      return awsSesClient.sendBulkTemplatedEmail({ 
        Source: from, 
        Template: templateName,
        Destinations: destinations,
        DefaultTemplateData: JSON.stringify({
          doNotEmailUrl: "invalid"
        })
      }).promise()
    }
  },
  
  deleteNewsletterTemplate: (templateName) => {
    return awsSesClient.deleteTemplate({ 
      TemplateName: templateName
    }).promise();
  },
  
  // === Main - Newsletter
  sendNewsletterSubscribeConfirmation: (toAddress, confirmCode, doNotEmailCode) => {
    return send(
      `hi@${DOMAIN}`,
      toAddress,
      "[Action Required] Confirm subscription to Openly Operated newsletter",
      "newsletter-subscribe-confirmation",
      {
        confirmUrl: `https://${DOMAIN}/newsletter-confirm?email=${toAddress}&code=${confirmCode}`,
        doNotEmailUrl: `https://${DOMAIN}/newsletter-do-not-email?email=${toAddress}&code=${doNotEmailCode}`
      }
    );
  },
  
};

function send(fromAddress, toAddress, subject, templateName, parameters) {
  var html, text;
  return getCompiledEmail(`${templateName}.html`, parameters)
  .then(result => {
    html = result;
    return getCompiledEmail(`${templateName}.txt`, parameters);
  })
  .then(result => {
    text = result;
    if (NODE_ENV === "test") {
      Logger.info(`Test env - not sending email, would have sent:
        From: ${fromAddress}
        To: ${toAddress}
        Subject: ${subject}
        Html: ${html}
        Text: ${text}`);
      return Promise.resolve("testSuccess");
    }
    else {
      return awsSesClient.sendEmail({ 
        Source: `Openly Operated <${fromAddress}>`, 
        Destination: {
          ToAddresses: [ toAddress ]
        },
        Message: {
          Subject: {
            Data: subject
          },
          Body: {
            Html: {
              Charset: "UTF-8",
              Data: html
            },
            Text: {
              Charset: "UTF-8",
              Data: text
            }
          }
        }
      }).promise()
    }
  })
  .catch(error => {
    throw new AppError(500, 56, `Error sending ${subject} email from ${fromAddress}`, error);
  });
}

function sendPlain(fromAddress, toAddress, subject, body) {
  if (NODE_ENV === "test") {
    Logger.info(`Test env - not sending email, would have sent:
      From: ${fromAddress}
      To: ${toAddress}
      Subject: ${subject}
      Text: ${body}`);
    return Promise.resolve("testSuccess");
  }
  else {
    return awsSesClient.sendEmail({ 
      Source: `Confirmed Team <${fromAddress}>`, 
      Destination: {
        ToAddresses: [ toAddress ]
      },
      Message: {
        Subject: {
          Data: subject
        },
        Body: {
          Text: {
            Charset: "UTF-8",
            Data: body
          }
        }
      }
    }).promise()
    .catch(error => {
      throw new AppError(500, 56, `Error sending ${subject} email from ${fromAddress}`, error);
    });
  }
}

function getCompiledEmail(filename, parameters) {
  return fs.readFile(path.join(__dirname, "..", "emails", filename), "utf-8")
    .then(conf => {
      var template = handlebars.compile(conf);
      return template(parameters);
    })
    .catch(error => {
      throw new AppError(500, 56, "Error getting file", error);
    });
}