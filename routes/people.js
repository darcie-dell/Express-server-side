var express = require("express");
var router = express.Router();
const authorization = require("../middleware/authorization");
const profileAuth = require("../middleware/profileAuth");

/**
 * Get people id protected route
 */
router.get("/:id", authorization, function (req, res, next) {
  //Check query param exists
  if (Object.keys(req.query).length > 0) {
    res.status(400).json({
      error: true,
      message:
        "Invalid query parameters: aQueryParam. Query parameters are not permitted.",
    });
    return;
  }
  // Get data
  req.db
    .select(
      "names.primaryName",
      "names.birthYear",
      "names.deathYear",
      "principals.category",
      "principals.characters",
      "basics.originalTitle",
      "basics.tconst",
      "basics.imdbRating"
    )
    .from("names")
    .leftJoin("principals", "names.nconst", "principals.nconst")
    .leftJoin("basics", "principals.tconst", "basics.tconst")
    .where("names.nconst", "=", req.params.id)
    .then((rows) => {
      if (rows.length === 0) {
        res.status(404).json({
          error: true,
          message: "No record exists of a person with this ID",
        });
        return;
      }
      // Respond
      res.json({
        name: rows[0].primaryName,
        birthYear: rows[0].birthYear,
        deathYear: rows[0].deathYear,
        roles: rows.map((row) => ({
          movieName: row.originalTitle,
          movieId: row.tconst,
          category: row.category,
          characters: row.characters ? JSON.parse(row.characters) : [],
          imdbRating: Number(row.imdbRating),
        })),
      });
    })
    .catch((err) => {
      console.log(err);

      if (err instanceof Error && err.name === "InvalidQueryParametersError") {
        res.status(400).json({
          error: true,
          message:
            "Invalid query parameters: year. Query parameters are not permitted.",
        });
      } else if (
        err instanceof Error &&
        err.name === "RateLimitExceededError"
      ) {
        res.status(429).send("Too many requests, please try again later.");
      } else {
        res.status(500).json({ error: true, message: "Error in MySQL query" });
      }
    });
});

module.exports = router;
