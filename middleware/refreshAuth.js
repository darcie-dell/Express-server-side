const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  // Get token
  const token = req.body.refreshToken;
  let token_data = {};
  const now = Math.floor(Date.now() / 1000);

  try {
    // Validate and Set token
    token_data = jwt.verify(token, process.env.JWT_SECRET);

    // Check if token is provided
    if (!token_data) {
      res.status(400);
      res.json({
        error: true,
        message: "Request body incomplete, refresh token required",
      });
      return;
    }

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
    } else if (err.message === "jwt malformed") {
      res.status(401).json({
        error: true,
        message: "Invalid JWT token",
      });
    } else if (err.message === "jwt must be provided") {
      res.status(400);
      res.json({
        error: true,
        message: "Request body incomplete, refresh token required",
      });
    }
    return;
  }

  // Set token in res LS
  res.locals.refresh_data = token_data;
  next();
};
