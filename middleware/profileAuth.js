const jwt = require("jsonwebtoken");

/**
 * Authorise bearer token for profile route
 * @param req
 * @param res
 * @param next
 */
module.exports = function (req, res, next) {
  const auth_header = req.headers.authorization || "";
  const now = Math.floor(Date.now() / 1000);

  // get token
  const token = auth_header.replace(/^Bearer /, "");
  let token_data = {};
  try {
    // Set and validate token
    token_data = jwt.verify(token, process.env.JWT_SECRET);

    // TODO: This does not work and i have no idea why, the JWT error also does not throw
    if (token_data.exp - now < 0) {
      res.status(401);
      res.json({
        error: true,
        message: "JWT token has expired",
      });
      return;
    }
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      res.status(401).json({ error: true, message: "JWT token has expired" });
      return;
    } else if (err.message !== "jwt must be provided") {
      res.status(401).json({ error: true, message: "Invalid JWT token" });
      return;
    }
  }

  // Set token in res LS
  res.locals.profile_data = token_data;
  next();
};
