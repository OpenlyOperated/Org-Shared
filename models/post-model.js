const AppError = require("../error.js");
const Logger = require("../logger.js");

const Tag = require("./tag-model.js");
const Database = require("../utilities/database.js");

const moment = require("moment");
const markdown = require("markdown-it")()
  .use(require("markdown-it-attrs"))
  .use(require("markdown-it-container"), "div");

const FRIENDLY_DATE_FORMAT = "MM/DD/YY h:mma";
const BLOG_DATE_FORMAT = "MMMM Do, YYYY";
const CMS_BUCKET = process.env.CMS_BUCKET;
const CMS_BUCKET_URL = "https://" + process.env.CMS_BUCKET + ".s3.amazonaws.com";
const ALPHANUMERIC_DASH_UNDERSCORE_PATTERN = /^$|^[a-z0-9-_]+$/;

class Post {
  
  constructor(row) {
    if (!row) {
      throw new AppError(500, 999, "Error creating model: Null row.");
    }
    this.id = row.id;
    this.title = row.title;
    this.author = row.author;
    this.alias = row.alias;
    this.body = row.body;
    this.createDate = row.create_date;
    this.updateDate = row.update_date;
    this.published = row.published;

    this.createDateFriendly = moment(this.createDate).format(FRIENDLY_DATE_FORMAT); 
    this.updateDateFriendly = this.updateDate ? moment(this.updateDate).format(FRIENDLY_DATE_FORMAT) : null;
    
    this.createDateBlog = moment(this.createDate).format(BLOG_DATE_FORMAT); 
    this.updateDateBlog = this.updateDate ? moment(this.updateDate).format(BLOG_DATE_FORMAT) : null;
    
    this.bodyWithBucketUrls = this.body.replace(/{{CMS_BUCKET_URL}}/g, CMS_BUCKET_URL);
    this.html = markdown.render(this.bodyWithBucketUrls);
    
    this.tags = [];
    this.tagsList = "";
    if (row.tag_titles) { // if we have the tags from a JOIN, use those. otherwise they need need to be fetched separately
      row.tag_titles.forEach((tagTitle, index) => {
        this.tags.push(new Tag({
          title: tagTitle,
          id: row.tag_ids[index],
          post_id: this.id
        }));
      });
      this.tagsList = row.tag_titles.join(",");
    }
  }
  
  static get aliasPattern() {
    return ALPHANUMERIC_DASH_UNDERSCORE_PATTERN;
  }
  
  addTags(tags) {
    let chain = Promise.resolve();
    for (const tag of tags) {
      chain = chain
        .then(() => {
          return Tag.create(tag, this.id);
        })
    }
    return chain;
  }
  
  setTags(tags) {
    let chain = Promise.resolve();
    // clear all tags first
    chain = chain.then(() => {
      return Tag.clearFromPost(this.id);
    })
    // then add tags
    for (const tag of tags) {
      chain = chain
        .then(() => {
          return Tag.create(tag, this.id);
        })
    }
    return chain;
  }
  
  loadTags() {
    return Database.query(
      `SELECT *
        FROM tags
        WHERE post_id = $1`,
      [this.id])
    .catch( error => {
      throw new AppError(500, 14, "Error getting tags for post", error);
    })
    .then( result => {
      var tags = [];
      result.rows.forEach(row => {
        tags.push(new Tag(row));
      });
      this.tags = tags;
      this.tagsList = this.tags.reduce(function(acc, key, index) {
        return acc + (index === 0 ? '' : ',') + tags[index].title;
      }, '');
      return this;
    });
  }

  static create(title, author, alias = null, body, tags, published) {
    var post;
    return Database.query(
      `INSERT INTO posts(title, author, alias, body, published)
      VALUES($1, $2, $3, $4, $5)
      RETURNING *`,
      [title, author, alias, body, published])
    .catch( error => {
      throw new AppError(500, 14, "Error creating Post", error);
    })
    .then( result => {
      post = new Post(result.rows[0]);
      return post.addTags(tags);
    })
    .then( result => {
      return post;
    });
  }
  
  static update(id, title, author, alias = null, body, tags, published) {
    var post;
    return Database.query(
      `UPDATE posts
        SET title = $2,
            author = $3,
            alias = $4,
            body = $5,
            published = $6,
            update_date = now()
        WHERE
          id = $1
        RETURNING *`,
      [id, title, author, alias, body, published])
    .catch( error => {
      throw new AppError(500, 14, "Error updating Post", error);
    })
    .then( result => {
      post = new Post(result.rows[0]);
      return post.setTags(tags);
    })
    .then( result => {
      return post;
    });
  }
  
  static deleteById(id) {
    return Database.query(
      `DELETE
        FROM posts
        WHERE id = $1
      RETURNING *`,
      [id])
    .catch( error => {
      throw new AppError(500, 14, "Error deleting post", error);
    })
    .then( result => {
      if (result.rows.length === 0) {
        throw new AppError(401, 2, "No posts deleted.");
      }
      return true;
    })
  }

  static getByAlias(alias, includeUnpublished = false) {
    var post;
    return Database.query(
      `SELECT *
        FROM posts
        WHERE alias = $1 ${includeUnpublished ? '' : ' AND published = true' }
        LIMIT 1`,
      [alias])
    .catch( error => {
      throw new AppError(500, 14, "Error getting post", error);
    })
    .then( result => {
      if (result.rows.length === 0) {
        throw new AppError(401, 2, "No such post.");
      }
      post = new Post(result.rows[0]);
      return post.loadTags();
    })
  }
  
  static getById(id, includeUnpublished = false) {
    var post;
    return Database.query(
      `SELECT *
        FROM posts
        WHERE id = $1 ${includeUnpublished ? '' : ' AND published = true' }
        LIMIT 1`,
      [id])
    .catch( error => {
      throw new AppError(500, 14, "Error getting post", error);
    })
    .then( result => {
      if (result.rows.length === 0) {
        throw new AppError(401, 2, "No such post.");
      }
      post = new Post(result.rows[0]);
      return post.loadTags();
    })
  }
  
  static list(tagTitle = null, includeUnpublished = false) {
    return Database.query(
      `SELECT posts.*, array_agg(tags.title) as tag_titles, array_agg(tags.id) as tag_ids
        FROM tags
        JOIN posts
          ON (posts.id = tags.post_id)
            ${tagTitle ? ' AND tags.title = $1' : '' }
        GROUP BY posts.id
        ORDER BY posts.update_date DESC NULLS LAST, posts.create_date DESC`,
      tagTitle ? [tagTitle] : [])
    .catch( error => {
      throw new AppError(500, 14, "Error listing posts", error);
    })
    .then( result => {
      var posts = [];
      result.rows.forEach(row => {
        var post = new Post(row);
        if (post.published == true) {
          posts.push(post);
        }
        else if (post.published == false) {
          if (includeUnpublished == true) {
            posts.push(post);
          }
        }
      });
      return posts;
    });
  }
  
}

module.exports = Post;