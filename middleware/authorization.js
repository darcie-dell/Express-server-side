const jwt = require("jsonwebtoken");

/**
 * Authorise bearer token
 * @param req
 * @param res
 * @param next
 */
module.exports = function (req, res, next) {
  let token_data = {};
  const now = Math.floor(Date.now() / 1000);

  // Check for token
  if (
    !("authorization" in req.headers) ||
    !req.headers.authorization.match(/^Bearer /)
  ) {
    res.status(401).json({
      error: true,
      message: "Authorization header ('Bearer token') not found",
    });
    return;
  }
  // Set token
  const token = req.headers.authorization.replace(/^Bearer /, "");

  // Validate token
  try {
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
    if (err.message === "jwt expired") {
      res.status(401).json({
        error: true,
        message: "JWT token has expired",
      });
    } else {
      res.status(401).json({
        error: true,
        message: "Invalid JWT token",
      });
    }
    return;
  }

  // Set token in res LS
  res.locals.token_data = token_data;
  next();
};
