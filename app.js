const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const { open } = require("sqlite");
const dbdriver = require("sqlite3");
const format = require("date-fns/format");
const path = require("path");
const jwt = require("jsonwebtoken");
const dbpath = path.join(__dirname, "twitterClone.db");
let db = null;
app.use(express.json());
const intialize = async () => {
  try {
    db = await open({ filename: dbpath, driver: dbdriver.Database });
    app.listen(3000, () => {
      console.log("server is Running");
    });
  } catch (e) {
    console.log(`error message:${e.message}`);
  }
};
intialize();

const reg = async (request, response, next) => {
  const { username, password } = request.body;
  const checkQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';`;
  const result = await db.get(checkQuery);

  if (result === undefined) {
    if (password.length >= 6) {
      next();
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
};
const login = async (request, response, next) => {
  const { username, password } = request.body;
  const checkQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';`;
  const result = await db.get(checkQuery);
  if (result === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const checkPassword = bcrypt.compare(password, result.password);
    if (checkPassword) {
      next();
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
};
const tweetCheck = async (request, response, next) => {
  const { username } = request;
  const { tweetId } = request.params;
  const sqlQuery = `
  SELECT user_id FROM tweet 
  WHERE tweet_id = ${tweetId};`;
  const result = await db.get(sqlQuery);
  const sqlQuery2 = `SELECT user.user_id
  FROM user INNER JOIN follower ON user.user_id= follower.follower_user_id
  WHERE user.username = '${username}' AND follower.following_user_id = ${result.user_id}`;
  const result2 = await db.get(sqlQuery2);

  if (result2 === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};
const AuthenticationToken = async (request, response, next) => {
  let jwtToken;
  const tokenKey = request.headers["authorization"];

  if (tokenKey === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = tokenKey.split(" ")[1];
    jwt.verify(jwtToken, "Dinesh123", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};
app.post("/register/", reg, async (request, response) => {
  const { username, password, name, gender } = request.body;
  console.log(username);
  const newPassword = await bcrypt.hash(password, 10);
  const sqlQuery = `
    INSERT INTO
    user(name,username,password,gender)
    VALUES
    ('${name}', '${username}','${newPassword}','${gender}');`;
  await db.run(sqlQuery);
  response.send("User created successfully");
});

app.post("/login/", login, async (request, response) => {
  const { username, password } = request.body;
  const payload = { username };
  const jwtToken = jwt.sign(payload, "Dinesh123");
  response.send({ jwtToken });
});

app.get(
  "/user/tweets/feed/",
  AuthenticationToken,
  async (request, response) => {
    const { username } = request;
    const sqlQuery = `
      SELECT user.username, tweet.tweet,tweet.date_time as dateTime
      FROM (user INNER JOIN follower ON user.user_id=follower_user_id)
      INNER JOIN tweet ON user.user_id = tweet.user_id
      WHERE user.user_id IN (SELECT following_user_id 
        FROM follower INNER JOIN user ON follower_user_id = user.user_id
        WHERE user.username='${username}')
      GROUP BY tweet.tweet_id
      LIMIT 4;`;
    const result = await db.all(sqlQuery);
    response.send(result);
  }
);

app.get("/user/following/", AuthenticationToken, async (request, response) => {
  const { username } = request;
  const sqlQuery = `
    SELECT name
    FROM user 
    WHERE user_id IN (SELECT follower.following_user_id FROM 
        user INNER JOIN follower ON user.user_id = follower.follower_user_id
        WHERE user.username='${username}');`;
  const result = await db.all(sqlQuery);
  response.send(result);
});

app.get("/user/followers/", AuthenticationToken, async (request, response) => {
  const { username } = request;
  const sqlQuery = `
    SELECT name
    FROM user
    WHERE user_id IN (SELECT follower.follower_user_id
        FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
        WHERE user.username = '${username}');`;
  const result = await db.all(sqlQuery);
  response.send(result);
});

app.get(
  "/tweets/:tweetId/",
  AuthenticationToken,
  tweetCheck,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const sqlQuery = `
    SELECT tweet.tweet ,COUNT(DISTINCT like.like_id) as likes, 
    COUNT(DISTINCT reply.reply_id) as replies, tweet.date_time as dateTime
    FROM (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) INNER JOIN
    like ON tweet.tweet_id = like.tweet_id
    WHERE tweet.tweet_id = ${tweetId};`;
    const result = await db.all(sqlQuery);
    response.send(result);
  }
);

app.get(
  "/tweets/:tweetId/likes/",
  AuthenticationToken,
  tweetCheck,
  async (request, response) => {
    const { tweetId } = request.params;
    const sqlQuery = `
    SELECT user.name FROM user INNER JOIN like ON user.user_id = like.user_id 
    WHERE like.tweet_id = ${tweetId}`;
    const result = await db.all(sqlQuery);
    let likes = result.map((each) => each.name);
    response.send({ likes });
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  AuthenticationToken,
  tweetCheck,
  async (request, response) => {
    const { tweetId } = request.params;
    const sqlQuery = `
    SELECT user.name , reply.reply 
    FROM user INNER JOIN reply ON user.user_id = reply.user_id
    WHERE tweet_id = ${tweetId};`;
    const result = await db.all(sqlQuery);
    response.send({ replies: result });
  }
);

app.get("/user/tweets/", AuthenticationToken, async (request, response) => {
  const { username } = request;
  const sqlQuery = `
    SELECT tweet.tweet , COUNT(DISTINCT like.like_id) as likes ,COUNT(DISTINCT reply.reply_id)  as replies ,tweet.date_time as dateTime
    FROM ((user INNER JOIN tweet ON user.user_id = tweet.user_id) INNER JOIN like ON tweet.tweet_id = like.tweet_id)
    INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE user.username = '${username}'
    GROUP BY tweet.tweet_id;`;
  const result = await db.all(sqlQuery);
  response.send(result);
});

app.post("/user/tweets/", AuthenticationToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const userIdQuery = `
    SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(userIdQuery);
  const date = new Date();
  const dateformat = format(date, "yyyy-MM-dd HH:mm:ss");
  const sqlQuery = `
    INSERT INTO tweet(tweet , user_id, date_time)
    VALUES (
        '${tweet}',${userId.user_id},'${dateformat}'
    )
    `;
  const result = await db.run(sqlQuery);
  response.send("Created a Tweet");
});
const deleteCheck = async (request, response, next) => {
  const { tweetId } = request.params;
  const { username } = request;
  const sqlQuery = `
    SELECT user.username
    FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE user.username = '${username}' AND tweet.tweet_id=${tweetId};`;
  const result = await db.get(sqlQuery);
  if (result === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};
app.delete(
  "/tweets/:tweetId/",
  AuthenticationToken,
  deleteCheck,
  async (request, response) => {
    const { tweetId } = request.params;
    const sqlQuery = `
      DELETE FROM tweet
      WHERE tweet_id = ${tweetId};`;
    const result = await db.run(sqlQuery);
    response.send("Tweet Removed");
  }
);

module.exports = app;
