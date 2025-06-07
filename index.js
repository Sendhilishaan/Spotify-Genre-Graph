const express = require("express"); 
const request = require("request");
const cors = require("cors");
const querystring = require("querystring");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
app.use(cors()).use(cookieParser());

const redirect_uri = "http://127.0.0.1:8888/callback";

const client_uri = "http://127.0.0.1:3000";

const generateRandomString = length => {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

app.get("/login", (req, res) => {
  const state = generateRandomString(16);
  res.cookie("spotify_auth_state", state);
  const scope = "user-top-read";
  res.redirect(
    "https://accounts.spotify.com/authorize?" +
      querystring.stringify({
        response_type: "code",
        client_id: process.env.SPOTIFY_CLIENT_ID,
        scope: scope,
        redirect_uri: redirect_uri,
        state: state,
      })
  );
});

app.get("/callback", (req, res) => {
  const code = req.query.code || null;
  const authOptions = {
    url: "https://accounts.spotify.com/api/token",
    form: {
      code: code,
      redirect_uri: redirect_uri,
      grant_type: "authorization_code",
    },
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
        ).toString("base64"),
    },
    json: true,
  };

  request.post(authOptions, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      const access_token = body.access_token;
      res.redirect(client_uri + "?access_token=" + access_token);
    } else {
      res.redirect(client_uri + "?error=invalid_token");
    }
  });
});

app.get("/top-genres", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  const access_token = authHeader.split(" ")[1];

  // Call Spotify API to get user's top artists
  const options = {
    url: "https://api.spotify.com/v1/me/top/artists?limit=50",
    headers: { Authorization: `Bearer ${access_token}` },
    json: true,
  };

  request.get(options, (error, response, body) => {
    if (error || response.statusCode !== 200) {
      return res.status(response ? response.statusCode : 500).json({
        error: error || body.error || "Failed to fetch top artists",
      });
    }

    // Extract genres from artists
    const genreCounts = {};

    body.items.forEach((artist) => {
      artist.genres.forEach((genre) => {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      });
    });

    // Convert to array sorted by count desc
    const genres = Object.entries(genreCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    res.json(genres);
  });
});


app.listen(8888);
