const AppError = require("../error.js");
const Logger = require("../logger.js");

// Utilities
const aws = require("aws-sdk");
const s3 = new aws.S3({ apiVersion: "2006-03-01" });
const fs = require("fs-extra");
const moment = require("moment");

const CMS_BUCKET = process.env.CMS_BUCKET;

class CmsFile {
  
  constructor(key, modifiedDate = new Date(), size = 0) {
    this.key = key;
    this.modifiedDate = modifiedDate;
    this.modifiedDateFriendly = moment(this.modifiedDate).format("MM/DD/YY h:mma"); 
    this.size = size;
    this.url = "https://" + CMS_BUCKET + ".s3.amazonaws.com/" + this.key;
  }

  static fromS3Object(object) {
    return new CmsFile(object.Key, object.LastModified, object.Size);
  }
  
  static uploadToS3(file, filename) {
    return fs.readFile(file.path)
    .then(data => {
      return s3.putObject({
        Body: data, 
        Bucket: CMS_BUCKET,
        Key: filename,
        ACL: "public-read"
      }).promise();
    });
  }
  
  static list() {
    var cmsFiles = [];
    return s3.listObjectsV2({ Bucket: CMS_BUCKET }).promise()
    .then(result => {
      result.Contents.forEach( (object) => {
        cmsFiles.push(CmsFile.fromS3Object(object));
      });
      return cmsFiles;
    });
  }
  
}

module.exports = CmsFile;