module.exports = class AppError extends Error {
  constructor (statusCode, appCode, message, error) {
    super(message);
    this.statusCode = statusCode || 500;
    this.appCode = appCode || -1;
    this.message = message || "";
    if (error && error.stack) {
      this.stack = error.stack;
    }
    else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
};