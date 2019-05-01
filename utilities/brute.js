const AppError = require("../error.js");
const Logger = require("../logger.js");

const Database = require("./database.js");

const expressBrute = require('express-brute');
const expressBrutePg = require('express-brute-pg');
const moment = require("moment");

const ONE_SECOND = 1 * 1000;
const ONE_MINUTE = 1 * 60 * 1000;

const expressBrutePgStore = new expressBrutePg({
	pool: Database
});

const failCallback = function (request, response, next, nextValidRequestDate) {
  const humanTime = moment(nextValidRequestDate).fromNow();
  return response.format({
    json: () => {
      response.status(429).json({
        code: 999,
        message: "Too many requests in this time frame.",
        nextValidRequestDate: nextValidRequestDate,
        nextValidRequestDateHuman: humanTime
      });
    },
    html: () => {
      request.flashRedirect("error", "Too many requests in this time frame. Try again " + humanTime + "." , "notification");
    }
  });
};

const handleStoreError = function (error) {
  throw new AppError(500, -1, "Error with Express Brute", error);
};

function makeBruteForce(freeRetries = 500, minWaitMillis = 0.5 * ONE_SECOND, maxWaitMillis = 15 * ONE_MINUTE) {
  return new expressBrute(
    expressBrutePgStore,
    {
      freeRetries: freeRetries,
      minWait: minWaitMillis,
      maxWait: maxWaitMillis,
      failCallback: failCallback,
      handleStoreError: handleStoreError
    }
  );
}

module.exports = makeBruteForce;