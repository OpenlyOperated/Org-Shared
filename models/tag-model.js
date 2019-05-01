const AppError = require("../error.js");
const Logger = require("../logger.js");

const Database = require("../utilities/database.js");

class Tag {
  
  constructor(row) {
    if (!row) {
      throw new AppError(500, 999, "Error creating model: Null row.");
    }
    this.id = row.id;
    this.title = row.title;
    this.postId = row.post_id;
  }
  
  static create(title, postId) {
    return Database.query(
      `INSERT INTO tags(title, post_id)
      VALUES($1, $2)
      ON CONFLICT ON CONSTRAINT tags_title_post_id_unique
        DO UPDATE SET title = $1, post_id = $2
      RETURNING *`,
      [title, postId])
    .catch( error => {
      throw new AppError(500, 14, "Error creating Tag", error);
    })
    .then( result => {
      var tag = new Tag(result.rows[0]);
      return tag;
    });
  }
  
  static clearFromPost(postId) {
    return Database.query(
      `DELETE
        FROM tags
        WHERE post_id = $1
      RETURNING *`,
      [postId])
    .catch( error => {
      throw new AppError(500, 14, "Error clearing Tags for Post", error);
    })
    .then( result => {
      var clearedTags = [];
      result.rows.forEach(row => {
        clearedTags.push(new Tag(row));
      });
      return clearedTags;
    });
  }
  
}

module.exports = Tag;