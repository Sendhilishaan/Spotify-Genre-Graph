const express = require("express");
const request = require("request");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const querystring = require("querystring");
require("dotenv").config();

const app = express();

app.use(cors()).use(cookieParser());

// Use 127.0.0.1 instead of localhost to comply with Spotify's new security requirements
const redirect_uri = process.env.REDIRECT_URI || "http://127.0.0.1:8888/callback";

// --- LOGIN ROUTE ---
// Redirect user to Spotify authorization page
app.get("/login", (req, res) => {
  const scope = [
    "user-top-read" // necessary scope for top artists
  ].join(" ");

  // Generate a random state parameter for CSRF protection
  const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  
  const authQueryParams = querystring.stringify({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: scope,
    redirect_uri: redirect_uri,
    state: state, // Add state parameter for security
  });

  // Store state in session/cookie for verification (optional but recommended)
  res.cookie('spotify_auth_state', state);

  res.redirect(`https://accounts.spotify.com/authorize?${authQueryParams}`);
});

// --- CALLBACK ROUTE ---
// Spotify redirects here after login; exchange code for tokens
app.get("/callback", (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedState = req.cookies ? req.cookies['spotify_auth_state'] : null;

  if (!code) {
    return res.status(400).json({ error: "Missing authorization code" });
  }

  // Verify state parameter to prevent CSRF attacks (optional but recommended)
  if (state === null || state !== storedState) {
    console.warn("State mismatch - possible CSRF attack");
  }

  // Clear the state cookie
  res.clearCookie('spotify_auth_state');

  const authOptions = {
    url: "https://accounts.spotify.com/api/token",
    form: {
      code: code,
      redirect_uri: redirect_uri,
      grant_type: "authorization_code",
    },
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
        ).toString("base64"),
    },
    json: true,
  };

  request.post(authOptions, (error, response, body) => {
    if (error) {
      console.error("Request error:", error);
      return res.status(500).json({ error: "Network error occurred" });
    }

    if (response.statusCode !== 200) {
      console.error("Spotify API error:", response.statusCode, body);
      return res.status(response.statusCode).json({
        error: body?.error_description || body?.error || "Failed to get access token",
      });
    }

    const access_token = body.access_token;
    const refresh_token = body.refresh_token;

    if (!access_token) {
      console.error("No access token received:", body);
      return res.status(500).json({ error: "No access token received" });
    }

    // Redirect back to frontend with tokens in URL hash fragment
    // Use 127.0.0.1 instead of localhost for consistency
    const frontendUrl = `http://127.0.0.1:3000/#access_token=${access_token}&refresh_token=${refresh_token}`;
    res.redirect(frontendUrl);
  });
});

// --- TOP ARTISTS GRAPH ROUTE ---
app.get("/top-artists-graph", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  const access_token = authHeader.split(" ")[1];

  const options = {
    url: "https://api.spotify.com/v1/me/top/artists?limit=50",
    headers: { Authorization: `Bearer ${access_token}` },
    json: true,
  };

  request.get(options, (error, response, body) => {
    if (error) {
      console.error("Request error:", error);
      return res.status(500).json({ error: "Network error occurred" });
    }

    if (response.statusCode !== 200) {
      console.error("Spotify API error:", response.statusCode, body);
      return res.status(response.statusCode).json({
        error: body?.error?.message || "Failed to fetch top artists",
      });
    }

    if (!body || !Array.isArray(body.items)) {
      console.error("Unexpected API response:", body);
      return res.status(500).json({ error: "Unexpected API response structure" });
    }

    const artists = body.items.map((artist) => ({
      id: artist.id,
      name: artist.name,
      popularity: artist.popularity,
      genres: artist.genres || [],
      img: artist.images?.[0]?.url || null,
    }));

    const genreFrequency = {};
    artists.forEach((artist) => {
      artist.genres.forEach((genre) => {
        genreFrequency[genre] = (genreFrequency[genre] || 0) + 1;
      });
    });

    const filteredArtists = artists.map((artist) => ({
      ...artist,
      genres: artist.genres.filter(
        (g) => genreFrequency[g] >= 1 && genreFrequency[g] <= 50
      ),
    }));

    let links = [];
    for (let i = 0; i < filteredArtists.length; i++) {
      for (let j = i + 1; j < filteredArtists.length; j++) {
        const sharedGenres = filteredArtists[i].genres.filter((g) =>
          filteredArtists[j].genres.includes(g)
        );
        if (sharedGenres.length > 0) {
          links.push({
            source: filteredArtists[i].id,
            target: filteredArtists[j].id,
            weight: sharedGenres.length,
          });
        }
      }
    }

    const maxLinksPerNode = 10;
    const linksBySource = {};
    links.forEach((link) => {
      if (!linksBySource[link.source]) linksBySource[link.source] = [];
      linksBySource[link.source].push(link);
    });

    const filteredLinks = [];
    Object.values(linksBySource).forEach((linkArray) => {
      linkArray
        .sort((a, b) => b.weight - a.weight)
        .slice(0, maxLinksPerNode)
        .forEach((link) => filteredLinks.push(link));
    });

    const nodes = filteredArtists.map((artist) => ({
      id: artist.id,
      name: artist.name,
      val: artist.popularity,
      img: artist.img,
    }));

    res.json({ nodes, links: filteredLinks });
  });
});

// Start server
app.listen(8888, () => {
  console.log("Server listening on port 8888");
});