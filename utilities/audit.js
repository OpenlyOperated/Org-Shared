const AppError = require("../error");
const Logger = require("../logger");

const AWS = require("aws-sdk");
const cloudwatchlogs = new AWS.CloudWatchLogs();
const s3 = new AWS.S3();

// Constants
const ENVIRONMENT = process.env.ENVIRONMENT;
const LOGGROUP_NAME = ENVIRONMENT + "-AdminAudit";
const ADMIN_AUDIT_BUCKET = process.env.ADMIN_AUDIT_BUCKET;

module.exports = {
  
  logToCloudWatch: (logStream, message, logGroup = LOGGROUP_NAME) => {
    // Get the latest sequence token
    return cloudwatchlogs.describeLogStreams( {
      logGroupName: logGroup,
      logStreamNamePrefix: logStream
    }).promise()
    .catch( error => {
      throw new AppError(400, 9999, "Error getting Log Streams: " + error); 
    })
    .then( data => {
    // Write to Cloudwatch Logs
      return cloudwatchlogs.putLogEvents( {
        logEvents: [ {
          message: message,
          timestamp: (new Date()).getTime()
        } ],
        logGroupName: logGroup,
        logStreamName: logStream,
        sequenceToken: data.logStreams[0].uploadSequenceToken
      }).promise();
    })
    .catch( error => {
      throw new AppError(400, 9999, "Error logging audit message to Cloudwatch Logs: " + error); 
    });
  },
  
  logToS3: (prefix, message, bucket = ADMIN_AUDIT_BUCKET) => {
    return s3.putObject({
      Bucket: ADMIN_AUDIT_BUCKET,
      Key: prefix + "-" + (new Date).getTime().toString() + ".txt",
      Body: message,
      ACL: "public-read"
    }).promise()
    .catch( error => {
      throw new AppError(400, 9999, "Error logging audit message to S3 Bucket: " + error); 
    });
  }
  
}