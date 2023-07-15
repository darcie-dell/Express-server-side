var express = require("express");
var router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const JWT_SECRET = process.env.JWT_SECRET;
const authorization = require("../middleware/authorization");
const profileAuth = require("../middleware/profileAuth");
const refreshAuth = require("../middleware/refreshAuth");

/* GET users listing. */
router.get("/", function (req, res, next) {
  res.send("respond with a resource");
});

const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many requests, please try again later.",
});

/**
 * Login Route
 */
router.post("/login", function (req, res, next) {
  const email = req.body.email;
  const password = req.body.password;
  const expires_in = 60 * 10;
  const refresh_expires_in = 60 * 60 * 24;
  const exp = Math.floor(Date.now() / 1000) + expires_in;
  const refresh_exp = Math.floor(Date.now() / 1000) + refresh_expires_in;
  const bearerToken = jwt.sign(
    { email: email, exp: exp },
    process.env.JWT_SECRET
  );
  const refreshToken = jwt.sign(
    { email: email, exp: refresh_exp },
    process.env.JWT_SECRET
  );

  // Verify req body
  if (!email || !password) {
    res.status(400).json({
      error: true,
      message: "Request body incomplete - email and password needed",
    });
    return;
  }

  // Check if user exists
  const queryUsers = req.db
    .from("users")
    .select("*")
    .where("email", "=", email);
  queryUsers
    .then((users) => {
      if (users.length === 0) {
        throw new Error("User does not exist");
      }

      // Compare password hashes
      const user = users[0];
      return bcrypt.compare(password, user.hash).then((match) => {
        if (!match) {
          throw new Error("Passwords do not match");
        }
      });
    })
    //Response
    .then(() => {
      res.status(200).json({
        bearerToken: {
          token: bearerToken,
          token_type: "Bearer",
          expires_in: expires_in,
        },
        refreshToken: {
          token: refreshToken,
          token_type: "Refresh",
          expires_in: refresh_expires_in,
        },
      });
    })
    .catch((err) => {
      console.error(err);
      res.status(401).json({
        error: true,
        message: "Incorrect email or password",
      });
    });
});

/**
 * Register route
 */
router.post("/register", function (req, res, next) {
  const email = req.body.email;
  const password = req.body.password;

  // Verify req body
  if (!email || !password) {
    res.status(400).json({
      error: true,
      message: "Request body incomplete - email and password needed",
    });
    return;
  }

  // Determine if user already exists in table
  const queryUsers = req.db
    .from("users")
    .select("*")
    .where("email", "=", email);
  queryUsers
    .then((users) => {
      if (users.length > 0) {
        throw new Error("User already exists");
      }

      // Insert user into DB
      const saltRounds = 10;
      const hash = bcrypt.hashSync(password, saltRounds);
      return req.db.from("users").insert({ email, hash });
    })
    //Respond
    .then(() => {
      res.status(201).json({ success: true, message: "User created" });
    })
    .catch((e) => {
      res.status(500).json({ success: false, message: e.message });
    });
});

/**
 * refresh route
 */
router.post("/refresh", refreshAuth, function (req, res, next) {
  let token_data = res.locals.refresh_data;
  let email = token_data.email;
  const expires_in = 60 * 10;
  const refresh_expires_in = 60 * 60 * 24;
  const exp = Math.floor(Date.now() / 1000) + expires_in;
  const refresh_exp = Math.floor(Date.now() / 1000) + refresh_expires_in;

  //Refresh tokens
  const bearerToken = jwt.sign(
    { email: email, exp: exp },
    process.env.JWT_SECRET
  );
  const refreshToken = jwt.sign(
    { email: email, exp: refresh_exp },
    process.env.JWT_SECRET
  );

  // Respond
  res.status(200).json({
    bearerToken: {
      token: bearerToken,
      token_type: "Bearer",
      expires_in: expires_in,
    },
    refreshToken: {
      token: refreshToken,
      token_type: "Refresh",
      expires_in: refresh_expires_in,
    },
  });
});

/**
 * Logout route
 * TODO: implement database storage
 */
router.post("/logout", refreshAuth, (req, res) => {
  res.status(200);
  res.json({ error: false, message: "Token successfully invalidated" });
});

/**
 * Profile Route with email
 */
router.get("/:email/profile", profileAuth, (req, res) => {
  let email = req.params.email;
  let token_data = res.locals.profile_data;

  // Get user data
  req
    .db("users")
    .select("firstName", "lastName", "dob", "address")
    .where("email", "=", email)
    .then((rows) => {
      let userData = rows[0];

      // User not found
      if (!userData) {
        res.status(404);
        res.json({ error: true, message: "User not found" });
        return;
      }

      // Check request account, low verbosity
      if (token_data.email !== email) {
        res.status(200);
        res.json({
          email: email,
          firstName: userData.firstName,
          lastName: userData.lastName,
        });
        return;
      }

      // Else high verbosity
      res.status(200);
      res.json({
        email: email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        dob: userData.dob,
        address: userData.address,
      });
    })
    .catch((err) => {
      console.log(err);
      res.json({ error: true, message: "Error in MySQL query" });
    });
});

/**
 * Update profile Route
 */
router.put("/:email/profile", authorization, (req, res) => {
  let email = req.params.email;
  let newData = req.body;
  let token_data = res.locals.token_data;

  //Check user exists in DB
  const user_check = req.db("users").select("*").where("email", "=", email);
  if (
    !user_check.then((rows) => {
      if (rows.length === 0) {
        return false;
      }

      return true;
    })
  ) {
    res.status(404);
    res.json({ error: true, message: "User not found" });
    return;
  }

  // Compare profile and current emails
  if (token_data.email !== email) {
    res.status(403);
    res.json({ error: true, message: "Forbidden" });
    return;
  }

  // Check req body
  if (
    !newData.firstName ||
    !newData.lastName ||
    !newData.dob ||
    !newData.address
  ) {
    res.status(400);
    res.json({
      error: true,
      message:
        "Request body incomplete: firstName, lastName, dob and address are required.",
    });
    return;
  }

  // Check input data is string
  let paramCheck = false;
  for (let field in newData) {
    if (typeof newData[field] !== "string") {
      paramCheck = true;
    }
  }
  if (paramCheck) {
    res.status(400);
    res.json({
      error: true,
      message:
        "Request body invalid: firstName, lastName and address must be strings only.",
    });
    return;
  }

  // Validate DOB
  const dobRegex =
    /(?:[1-9]\d{3}\-(?:(?:0[1-9]|1[0-2])\-(?:0[1-9]|1\d|2[0-8])|(?:0[13-9]|1[0-2])\-(?:29|30)|(?:0[13578]|1[02])\-31)|(?:[1-9]\d(?:0[48]|[2468][048]|[13579][26])|(?:[2468][048]|[13579][26])00)\-02\-29)/g;

  let dobResult = dobRegex.exec(newData.dob);
  if (!dobResult || dobResult[0] !== dobResult.input) {
    res.status(400).json({
      error: true,
      message: "Invalid input: dob must be a real date in format YYYY-MM-DD.",
    });
    return;
  }

  let dobRaw = dobResult[0];
  let dobYMD = dobRaw.split("-").map((x) => parseInt(x));
  let dob = new Date(dobYMD[0], dobYMD[1] - 1, dobYMD[2]);

  if (dob > Date.now()) {
    res.status(400);
    res.json({
      error: true,
      message: "Invalid input: dob must be a date in the past.",
    });
    return;
  }
  req
    .db("users")
    .where("email", "=", email)
    .update({
      firstName: newData.firstName,
      lastName: newData.lastName,
      dob: newData.dob,
      address: newData.address,
    })
    .then(() => {
      // Respond
      req
        .db("users")
        .select("email", "firstName", "lastName", "dob", "address")
        .where("email", "=", email)
        .then((rows) => {
          let data = rows[0];
          res.status(200);
          res.json({
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            dob: data.dob,
            address: data.address,
          });
          return;
        })
        .catch((err) => {
          console.log(err);
          res.json({ error: true, message: "Error in MySQL query" });
        });
    })
    .catch((err) => {
      console.log(err);
      res.json({ error: true, message: "Error in MySQL query" });
    });
});

module.exports = router;
