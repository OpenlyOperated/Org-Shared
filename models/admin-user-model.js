const AppError = require("../error.js");
const Logger = require("../logger.js");

const Database = require("../utilities/database.js");
const Secure = require("../utilities/secure.js");
const Email = require("../utilities/email.js");

class AdminUser {
  
  constructor(userRow) {
    if (!userRow) {
      throw new AppError(500, 999, "Error creating user: Null user.");
    }
    this.email = userRow.email;
    this.passwordHashed = userRow.password;
    this.emailConfirmed = userRow.email_confirmed;
    this.emailConfirmCode = userRow.email_confirm_code;
    this.passwordResetCode = userRow.password_reset_code;
  }
  
  changePassword(currentPassword, newPassword) {
    return this.assertPassword(currentPassword)
      .then( passwordMatches => {
        return Secure.hashPassword(newPassword);
      })
      .then(newPasswordHashed => {
        return Database.query(
          `UPDATE admin_users 
          SET password = $1
          WHERE email = $2
          RETURNING *`,
          [newPasswordHashed, this.email])
        .catch( error => {
          throw new AppError(500, 70, "Error changing user password", error);
        })
        .then( result => {
          if (result.rowCount !== 1) {
            throw new AppError(500, 71, "Error changing user password: no user changed.");
          }
          return true;
        });
      });
  }

  assertPassword(password) {
    return Secure.assertPassword(this.passwordHashed, password);
  }

  static createWithEmailAndPassword(email, password) {
    return AdminUser.failIfEmailTaken(email)
      .then( success => {
        return Secure.hashPassword(password);
      })
      .then(passwordHashed => {
        const emailConfirmCode = Secure.generateEmailConfirmCode();
        return Database.query(
          `INSERT INTO admin_users(email, password, email_confirm_code)
          VALUES($1, $2, $3)
          RETURNING *`,
          [email, passwordHashed, emailConfirmCode])
        .catch( error => {
          throw new AppError(500, 14, "Error creating user", error);
        })
        .then( result => {
          var user = new AdminUser(result.rows[0]);
          return Email.sendConfirmationAdmin(email, user.emailConfirmCode)
          .then(result => {
            return user;
          });  
        });
      });
  }
  
  static getWithIdAndPassword(id, password) {
    return module.exports.getWithId(id)
      .then( user => {
        return user.assertPassword(password)
          .then( passwordMatch => {
            return user;
          });
      });
  }
  
  static getWithEmail(email) {
    return Database.query(
      `SELECT * FROM admin_users
      WHERE email = $1
      LIMIT 1`,
      [email])
      .catch( error => {
        throw new AppError(500, 7, "Database error getting user: ", error);
      })
      .then( result => {
        if (result.rows.length === 0) {
          throw new AppError(401, 2, "No such user.");
        }
        return new AdminUser(result.rows[0]);
      });
  }
  
  static getWithEmailAndPassword(email, password) {
    return Database.query(
      `SELECT * FROM admin_users
      WHERE email = $1
      ORDER BY email_confirmed DESC
      LIMIT 1`,
      [email])
      .catch( error => {
        throw new AppError(500, 7, "Error getting user by email", error);
      })
      .then( result => {
        if (result.rows.length === 0) {
          throw new AppError(401, 2, "No such user.");
        }
        var user = new AdminUser(result.rows[0]);
        return user.assertPassword(password)
          .then( passwordMatch => {
            return user;
          });
      });
  }

  static getWithConfirmCode(code) {
    return Database.query(
      `SELECT * FROM admin_users
      WHERE email_confirm_code = $1
      LIMIT 1`,
      [code])
      .catch( error => {
        throw new AppError(500, 19, "Error looking up confirmation code", error);
      })
      .then( result => {
        if (result.rows.length !== 1) {
          throw new AppError(500, 19, "Error looking up confirmation code - not found.");
        }
        return new AdminUser(result.rows[0]);
      });
  }
  
  static confirmEmail(code) {
    return Database.query(
      `UPDATE admin_users 
      SET email_confirmed = true
      WHERE email_confirm_code = $1 AND
        email_confirmed = false
      RETURNING *`,
      [code])
      .catch( error => {
        throw new AppError(500, 19, "Error accepting confirmation code", error);
      })
      .then( result => {
        if (result.rowCount !== 1) {
          throw new AppError(400, 18, "No such confirmation code");
        }
        return true;
      });
  }
  
  static failIfEmailTaken(email) {
    return Database.query(
      `SELECT * FROM admin_users
      WHERE email = $1
      LIMIT 1`,
      [email])
      .catch( error => {
        throw new AppError(500, 15, "Error checking if email already exists.", error);
      })
      .then( result => {
        if (result.rows.length === 1) {
          var user = new AdminUser(result.rows[0]);
          if (!user.emailConfirmed) {
            throw new AppError(200, 1, "Email registered, but not confirmed. Check email for the confirmation link.");
          }
          else {
            throw new AppError(400, 40, "That email is already registered. Please try signing in.");
          }
        }
        return email;
      });
  }
  
  static resendConfirmCode(email) {
    return Database.query(
      `SELECT *
      FROM admin_users
      WHERE email = $1
      LIMIT 1`,
      [email])
      .catch( error => {
        throw new AppError(500, 58, "Error looking up email for resending confirm code", error);
      })
      .then( result => {
        if (result.rows.length !== 1) {
          throw new AppError(400, 59, "No such email");
        }
        var user = new AdminUser(result.rows[0]);
        if (user.emailConfirmed) {
          throw new AppError(400, 60, "Email already confirmed. Try signing in.");
        }
        else {
          return Email.sendConfirmationAdmin(email, user.emailConfirmCode);
        }
      });
  }
  
  static generatePasswordReset(email) {
    var passwordResetCode = Secure.generatePasswordResetCode();
    return Database.query(
      `UPDATE admin_users
      SET password_reset_code = $1
      WHERE email = $2 AND
        email_confirmed = true
      RETURNING *`,
      [passwordResetCode, email])
      .catch( error => {
        throw new AppError(500, 72, "Error adding password reset code to database", error);
      })
      .then( result => {
        if (result.rowCount === 1) {
          return Email.sendResetPassword(email, passwordResetCode);
        }
        else {
          return true;
        }
      });
  }
  
  static resetPassword(code, newPassword) {
    return Secure.hashPassword(newPassword)
      .then(newPasswordHashed => {
        return Database.query(
          `UPDATE admin_users 
          SET password = $1,
            password_reset_code = NULL
          WHERE password_reset_code = $2
          RETURNING *`,
          [newPasswordHashed, code]);
      })
      .catch( error => {
        throw new AppError(500, 76, "Error setting new user password", error);
      })
      .then( result => {
        if (result.rowCount !== 1) {
          throw new AppError(400, 77, "Error setting new user password: Invalid reset code.");
        }
        return true;
      });
  }
  
}

module.exports = AdminUser;