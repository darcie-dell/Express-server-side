var express = require("express");
var router = express.Router();
const authorization = require("../middleware/authorization");
const profileAuth = require("../middleware/profileAuth");

/**
 * Movies Search route
 */
router.get("/search", function (req, res, next) {
  const title = req.query.title;
  const year = req.query.year;
  let page = req.query.page;

  // validate page param
  if (typeof page === "string") {
    if (/^[0-9]+$/.test(page) === false) {
      return res.status(400).json({
        error: true,
        message: "Invalid page format. page must be a number.",
      });
    } else Number(page);
  }

  if (req.query.page === undefined) {
    page = 1;
  }

  const perPage = 100;

  let query = req.db
    .from("basics")
    .select(
      "primaryTitle",
      "originalTitle",
      "year",
      "tconst",
      "imdbRating",
      "rottentomatoesrating",
      "metacriticRating",
      "rated"
    );

  // Get movie data
  if (title) {
    query = query.where(function () {
      this.where("originalTitle", "like", `%${title}%`).orWhere(
        "primaryTitle",
        "like",
        `%${title}%`
      );
    });
  }

  // validate year
  if (year) {
    const validYearRegex = /^\d{4}$/;
    if (!validYearRegex.test(year)) {
      return res.status(400).json({
        error: true,
        message: "Invalid year format. Format must be yyyy.",
      });
    }

    query = query.where("year", "=", year);
  }

  // Query db
  query
    .orderBy("tconst", "asc")
    .then((rows) => {
      const totalCount = rows.length;
      const lastPage = Math.ceil(totalCount / perPage);
      const currentPage = page !== undefined ? parseInt(page, 10) : 1;
      const from = (currentPage - 1) * perPage;
      const to = Math.min(from + perPage, totalCount);
      console.log(from + perPage);
      const nextPage = currentPage < lastPage ? currentPage + 1 : null;
      const prevPage = currentPage > 1 ? currentPage - 1 : null;

      const formattedRows = rows.slice(from, to).map((row) => ({
        title: row.primaryTitle,
        year: row.year,
        imdbID: row.tconst,
        imdbRating: Number(row.imdbRating),
        rottenTomatoesRating: Number(row.rottentomatoesrating),
        metacriticRating:
          Number(row.metacriticRating) === 0
            ? null
            : Number(row.metacriticRating),
        classification: row.rated,
      }));

      const pagination = {
        total: totalCount,
        lastPage: lastPage,
        prevPage: prevPage,
        nextPage: nextPage,
        perPage: perPage,
        currentPage: currentPage,
        from: from,
        to: to,
      };
      // Respond
      res.json({
        data: formattedRows,
        pagination: pagination,
      });
    })
    .catch((err) => {
      console.log(err);
      res.json({
        Error: true,
        Message: "Error occurred during data formatting",
      });
    });
});

/**
 * Getting individual movie data.
 */
router.get("/data/:imdbID", function (req, res, next) {
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
      "basics.originalTitle",
      "basics.year",
      "basics.runtimeMinutes",
      "basics.genres",
      "basics.country",
      "principals.id",
      "principals.tconst",
      "principals.nconst",
      "principals.name",
      "principals.category",
      "principals.characters",
      { source: "ratings.source", value: "ratings.value" },
      "basics.boxoffice",
      "basics.poster",
      "basics.plot"
    )
    .from("basics")
    .leftJoin("principals", "basics.tconst", "principals.tconst")
    .leftJoin("ratings", "basics.tconst", "ratings.tconst")
    .where("basics.tconst", "=", req.params.imdbID)
    .then((rows) => {
      if (rows.length === 0) {
        res.status(404).json({
          error: true,
          message: "No record exists of a movie with this ID",
        });
        return;
      }

      // Format data
      const genres = rows[0].genres ? rows[0].genres.split(",") : [];
      const uniquePrincipalIds = new Set();
      const principals = [];

      rows.forEach((row) => {
        if (row.id && !uniquePrincipalIds.has(row.id)) {
          uniquePrincipalIds.add(row.id);
          principals.push({
            id: row.nconst,
            category: row.category,
            name: row.name,
            characters: row.characters ? JSON.parse(row.characters) : [],
          });
        }
      });
      const uniqueRatings = new Set();
      const formattedRatings = rows
        .filter((row) => row.source && row.value)
        .reduce((ratings, row) => {
          if (!uniqueRatings.has(row.source)) {
            uniqueRatings.add(row.source);
            const parsedValue = parseRatingValue(row.value);
            if (parsedValue !== null) {
              ratings.push({
                source: row.source,
                value: parsedValue,
              });
            }
          }
          return ratings;
        }, []);
      // Respond
      res.json({
        title: rows[0].originalTitle,
        year: rows[0].year,
        runtime: rows[0].runtimeMinutes,
        genres: genres,
        country: rows[0].country,
        principals: principals,
        ratings: formattedRatings,
        boxoffice: rows[0].boxoffice,
        poster: rows[0].poster,
        plot: rows[0].plot,
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

/**
 * Helper function to parse rating values
 * @param value
 * @returns {number|null}
 */
function parseRatingValue(value) {
  const matchPercentage = value.match(/(\d+)%/);
  if (matchPercentage) {
    return parseInt(matchPercentage[1]);
  }

  const matchFraction = value.match(/(\d+(\.\d+)?)\/\d+/);
  if (matchFraction) {
    return parseFloat(matchFraction[1]);
  }

  return null;
}

module.exports = router;
