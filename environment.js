const Logger = require("./logger.js");

const awsSdk = require("aws-sdk");
const awsParamEnv = require("aws-param-env");

const ENVIRONMENT = process.env.ENVIRONMENT || fatalError("FATAL - ENVIRONMENT not defined on startup.");
const NODE_ENV = process.env.NODE_ENV || fatalError("FATAL - NODE_ENV not defined on startup.");

const PARAMS_MAP = {
  "COMMON": [
    "DOMAIN",
    "PG_HOST",
    "AES_EMAIL_KEY",
    "EMAIL_SALT",
    "CMS_BUCKET"
  ],
  "ADMIN": [
    "PG_ADMIN_PASSWORD",
    "ADMIN_SESSION_SECRET"
  ],
  "MAIN": [
    "PG_MAIN_PASSWORD",
    "USER_SESSION_SECRET"
  ],
  "DEBUG": [
    "PG_DEBUG_PASSWORD"
  ]
}

// Load the parameters from parameter store
function initializeEnvironment(paramPaths) {
  if (NODE_ENV === "production") {
    paramPaths.forEach((paramPath) => {
      awsParamEnv.load( "/" + ENVIRONMENT + "/" + paramPath);
    });
  }
  else if (ENVIRONMENT !== "LOCAL") {
    paramPaths.forEach((paramPath) => {
      awsParamEnv.load( "/" + ENVIRONMENT + "/TEST/" + paramPath);
    });
  }
  // Double check that all required environment variables are loaded
  paramPaths.forEach((paramPath) => {
    var keysToCheck = PARAMS_MAP[paramPath];
    if (keysToCheck == null || keysToCheck.length == 0) {
      fatalError("FATAL - Invalid param path: " + paramPath);
    }
    keysToCheck.forEach((key) => {
      if (!process.env[key]) {
        fatalError("FATAL - " + key + " not defined on startup.");
      }
    })
  })
}

function fatalError(message) {
  Logger.error(message);
  process.exit(1);
}

module.exports = initializeEnvironment;