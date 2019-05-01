const Logger = require("../logger.js");

module.exports = {
  
  getTemplated: (mainPass, debugPass) => {
    return `
    SET statement_timeout = 0;
    SET lock_timeout = 0;
    SET idle_in_transaction_session_timeout = 0;
    SET client_encoding = 'UTF8';
    SET standard_conforming_strings = on;
    SET check_function_bodies = false;
    SET client_min_messages = warning;
    SET row_security = off;

    CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;

    SET search_path = public, pg_catalog;

    SET default_with_oids = false;
    
    /*****************************************************/
    /***************** BRUTE PREVENTION ******************/
    /*****************************************************/
    
    CREATE TABLE brute (
      id text PRIMARY KEY,
      count int,
      first_request timestamptz,
      last_request timestamptz,
      expires timestamptz
    );
    
    /*****************************************************/
    /************** ADMIN USERS & COOKIES ****************/
    /*****************************************************/

    CREATE TABLE admin_users (
      email text NOT NULL,
      password text NOT NULL,
      email_confirmed boolean DEFAULT false NOT NULL,
      email_confirm_code text NOT NULL,
      password_reset_code text
    );

    ALTER TABLE ONLY admin_users
      ADD CONSTRAINT admin_users_email_pkey PRIMARY KEY (email);
    
    CREATE TABLE "admin_sessions" (
      "sid" varchar NOT NULL COLLATE "default",
    	"sess" json NOT NULL,
    	"expire" timestamp(6) NOT NULL
    )
    WITH (OIDS=FALSE);
    ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

    /*****************************************************/
    /************************* CMS ***********************/
    /*****************************************************/

    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title text NOT NULL,
      author text NOT NULL,
      alias text UNIQUE,
      body text NOT NULL,
      published boolean NOT NULL DEFAULT false,
      create_date timestamp without time zone NOT NULL DEFAULT now(),
      update_date timestamp without time zone
    );

    CREATE TABLE tags (
      id SERIAL PRIMARY KEY,
      title text NOT NULL,
      post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE
    );

    ALTER TABLE tags ADD CONSTRAINT tags_title_post_id_unique UNIQUE (title, post_id);

    CREATE INDEX title_index ON tags USING btree (title);
    
    /*****************************************************/
    /*************** NEWSLETTER SUBSCRIBERS **************/
    /*****************************************************/
    
    CREATE TABLE newsletter_subscribers (
      id text NOT NULL,
      email_encrypted text,
      email_hashed text NOT NULL,
      email_confirmed boolean DEFAULT false NOT NULL,
      email_confirm_code text NOT NULL,
      do_not_email_code text NOT NULL,
      create_date timestamp with time zone DEFAULT now() NOT NULL
    );
    
    ALTER TABLE ONLY newsletter_subscribers
      ADD CONSTRAINT newsletter_subscribers_email_hashed_key UNIQUE (email_hashed);
      
    ALTER TABLE ONLY newsletter_subscribers
      ADD CONSTRAINT newsletter_subscribers_id_key UNIQUE (id);
      
    CREATE INDEX email_hashed_index ON newsletter_subscribers USING btree (email_hashed);

    /*****************************************************/
    /******************* USER COOKIES ********************/
    /*****************************************************/

    CREATE TABLE "user_sessions" (
      "sid" varchar NOT NULL COLLATE "default",
    	"sess" json NOT NULL,
    	"expire" timestamp(6) NOT NULL
    )
    WITH (OIDS=FALSE);
    ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

    /*****************************************************/
    /************************ ROLES **********************/
    /*****************************************************/

    CREATE USER main WITH ENCRYPTED PASSWORD '${mainPass}';
    GRANT SELECT, INSERT, UPDATE, DELETE ON brute TO main;
    GRANT SELECT, INSERT, UPDATE, DELETE ON user_sessions TO main;
    GRANT SELECT, INSERT, UPDATE ON newsletter_subscribers TO main;
    GRANT SELECT ON posts TO main;
    GRANT SELECT ON tags TO main;

    CREATE USER debug WITH ENCRYPTED PASSWORD '${debugPass}';
    GRANT SELECT ON admin_users TO debug;
    GRANT SELECT ON posts TO debug;
    GRANT SELECT ON tags TO debug;
    `;
  }
  
}