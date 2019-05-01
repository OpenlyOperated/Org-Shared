const AppError = require("../error.js");
const Logger = require("../logger.js");

const crypto = require("crypto");
const bcrypt = require("bcrypt");

const BCRYPT_SALT_ROUNDS = 10;
const AES_IV_PREFIX_LENGTH = 16;

module.exports = {
  
  hashEmail: (toHash, salt) => {
    var hash = crypto.createHmac("sha512", salt);
    hash.update(toHash);
    return hash.digest("hex");
  },
  
  hashPassword: (toHash) => {
    return bcrypt.hash(toHash, BCRYPT_SALT_ROUNDS)
      .then( hash => {
        return hash;
      });
  },
  
  assertPassword: (correctPasswordHashed, providedPassword) => {
    return bcrypt.compare(providedPassword, correctPasswordHashed)
      .then( isCorrectPassword => {
        if (isCorrectPassword !== true) {
          throw new AppError(401, 2, "Incorrect Login.");
        }
        else {
          return true;
        }
      });
  },
  
  generatePassword: () => {
    return generateRandomString(16);
  },
  
  generateSalt: () => {
    return generateRandomString(16);
  },
  
  generateEmailConfirmCode: () => {
    return generateRandomString(32);
  },
  
  generatePasswordResetCode: () => {
    return generateRandomString(32);
  },
  
  aesEncrypt: (toCrypt, key) => {
    // Convert to base64 and encrypt it into hex, then prepend initialization vector
    var base64 = Buffer.from(toCrypt).toString("base64");
    var iv = generateRandomString(AES_IV_PREFIX_LENGTH);
    var cipher = crypto.createCipheriv("aes-256-ctr", key, iv);
    var crypted = cipher.update(base64, "utf8", "hex");
    var ivAndCrypted = iv + crypted + cipher.final("hex");
    return ivAndCrypted;
  },
  
  aesDecrypt: (ivAndCrypted, key, string = true) => {
    // Split initialization vector and crypted hex, then decrypt into base64, and decode base64
    var iv = ivAndCrypted.substr(0, AES_IV_PREFIX_LENGTH);
    var crypted = ivAndCrypted.substr(AES_IV_PREFIX_LENGTH, ivAndCrypted.length - 1);
    var decipher = crypto.createDecipheriv("aes-256-ctr", key, iv);
    var decrypted = decipher.update(crypted, "hex", "utf8");
    decrypted = decrypted + decipher.final("utf8");
    if (string) {
      return Buffer.from(decrypted, "base64").toString();
    }
    else {
      return Buffer.from(decrypted, "base64");
    }
  },
  
  randomString(length) {
    return generateRandomString(length);
  }
  
};

function generateRandomString(length) {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}