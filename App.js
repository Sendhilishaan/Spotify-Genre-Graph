import React, { useState, useEffect } from "react";

export default function App() {
  const [accessToken, setAccessToken] = useState(null);
  const [genres, setGenres] = useState([]);

  // On mount, parse tokens from URL if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("access_token");
    if (token) {
      setAccessToken(token);
      // Remove tokens from URL for cleanliness
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  // Fetch genres once token is set
  useEffect(() => {
    if (!accessToken) return;

    fetch("http://127.0.0.1:8888/top-genres", {
  headers: { Authorization: `Bearer ${accessToken}` },
})

      .then((res) => res.json())
      .then(setGenres)
      .catch(console.error);
  }, [accessToken]);

  if (!accessToken) {
    return (
      <div style={{ textAlign: "center", marginTop: "50px" }}>
        <a href="http://127.0.0.1:8888/login">
          <button>Login with Spotify</button>
        </a>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>Your Top Genres</h1>
      {genres.length === 0 && <p>Loading genres...</p>}
      <ul>
        {genres.map(({ name, count }) => (
          <li key={name}>
            {name}: {count}
          </li>
        ))}
      </ul>
    </div>
  );
}
