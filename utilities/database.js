const AppError = require("../error.js");
const Logger = require("../logger.js");

const PG_HOST = process.env.PG_HOST;
const PG_DATABASE = "master";
const PG_USER = process.env.PG_USER;
const PG_PASSWORD = process.env.PG_PASSWORD;

const { Pool } = require("pg");

const pool = new Pool({
  host: PG_HOST,
  database: PG_DATABASE,
  user: PG_USER,
  password: PG_PASSWORD,
  port: 5432,
  ssl: process.env.ENVIRONMENT === "LOCAL" ? false : { rejectUnauthorized: false },
  max: 20,
  min: 4,
  idleTimeoutMillis: 1000,
  connectionTimeoutMillis: 10000,
  rejectUnauthorized: false
});

pool.on('error', (error, c) => {
  Logger.error("Postgres error: " + error);
})

module.exports = pool;