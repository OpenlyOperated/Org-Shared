const NODE_ENV = process.env.NODE_ENV;

const winston = require("winston");

// Use pretty print for non-production for increased human-readability
var format = winston.format.json();
if (NODE_ENV !== "production") {
  format = winston.format.printf(function(info) {
    return `${JSON.stringify(info, null, 2)}`;
  });
}

const Logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      format: format,
      handleExceptions: true
    })
  ],
  exitOnError: false
});

module.exports = Logger;