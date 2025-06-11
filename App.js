import React, { useState, useEffect, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import * as d3Force from "d3-force";
import { interpolateBlues } from "d3-scale-chromatic";


export default function App() {
  const [accessToken, setAccessToken] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const fgRef = useRef();
  const imageCache = useRef({});

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.slice(1));
      const token = params.get("access_token");
      if (token) {
        setAccessToken(token);
        window.history.replaceState({}, document.title, "/");
      }
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    fetch("http://127.0.0.1:8888/top-artists-graph", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setGraphData({
          nodes: data.nodes || [],
          links: data.links || [],
        });
      })
      .catch((err) => console.error("Error fetching graph data:", err));
  }, [accessToken]);

  useEffect(() => {
    if (!graphData || !fgRef.current) return;

    const fg = fgRef.current;

    fg.d3Force("collide", d3Force.forceCollide(50));
    fg.d3Force("link").distance(120).strength(0.5);
    fg.d3Force("charge").strength(-50);
    fg.d3Force(
      "center",
      d3Force.forceCenter(
        (window.innerWidth - 300) / 2 + 300,
        (window.innerHeight - 100) / 2
      )
    );
    fg.d3ReheatSimulation();

    const timeout = setTimeout(() => {
      fg.zoomToFit(400);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [graphData]);

  if (!accessToken) {
    return (
      <div style={{ textAlign: "center", marginTop: 50 }}>
        <a href="http://127.0.0.1:8888/login">
          <button>Login with Spotify</button>
        </a>
      </div>
    );
  }

  if (!graphData) {
    return (
      <p style={{ textAlign: "center", marginTop: 50 }}>
        Loading your artist graph...
      </p>
    );
  }

  const safeGraphData = {
    nodes: graphData.nodes || [],
    links: graphData.links || [],
  };

  // Count genres 
  const genreCounts = {};
  for (const node of safeGraphData.nodes) {
    const genres = node.genres || ["Other"];
    genres.forEach((genre) => {
      genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    });
  }


  const genreEntries = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);

  const barWidth = 280;
  const barHeight = 20;
  const chartHeight = genreEntries.length * (barHeight + 5);
  const maxCount = Math.max(...genreEntries.map(([, count]) => count));

  return (
    <div style={{ display: "flex", flexDirection: "row" }}>
      {/* Sidebar Bar Chart */}
      <div
        style={{
          width: 300,
          padding: 10,
          backgroundColor: "#111",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <h3 style={{ textAlign: "center" }}>Top Genres</h3>
        <svg width={barWidth} height={chartHeight}>
          {genreEntries.map(([genre, count], i) => {
            const barLen = (count / maxCount) * (barWidth - 100);
            return (
              <g key={genre} transform={`translate(0, ${i * (barHeight + 5)})`}>
                <text
                  x={0}
                  y={barHeight / 2 + 4}
                  fill="white"
                  style={{ fontSize: 12 }}
                >
                  {genre}
                </text>
                <rect
                  x={100}
                  y={0}
                  width={barLen}
                  height={barHeight}
                  fill={interpolateBlues(count / maxCount)}
                />
                <text
                  x={100 + barLen + 5}
                  y={barHeight / 2 + 4}
                  fill="white"
                  style={{ fontSize: 12 }}
                >
                  {count}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Main Graph */}
      <div>
        <h1 style={{ textAlign: "center" }}>Your Top Artists Graph</h1>
        <ForceGraph2D
          ref={fgRef}
          graphData={safeGraphData}
          nodeAutoColorBy="genre"
          nodeRelSize={6}
          width={window.innerWidth - 300}
          height={window.innerHeight - 100}
          linkWidth={(link) => Math.min(8, (link.weight || 1) * 2)}
          linkDirectionalParticles={1}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleWidth={1}
          linkColor={(link) => {
            const weight = link.weight || 1;
            const intensity = Math.min(weight / 5, 1);
            return interpolateBlues(intensity);
          }}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const imgSize = 50;
            const fontSize = 12 / globalScale;
            const label = node.name;

            if (node.img) {
              if (!imageCache.current[node.id]) {
                const img = new Image();
                img.src = node.img;
                img.crossOrigin = "anonymous";
                img.onload = () => {
                  imageCache.current[node.id] = img;
                  setGraphData((data) => ({ ...data }));
                };
              } else {
                const img = imageCache.current[node.id];
                ctx.save();
                ctx.beginPath();
                ctx.arc(node.x, node.y, imgSize / 2, 0, 2 * Math.PI);
                ctx.clip();
                ctx.drawImage(
                  img,
                  node.x - imgSize / 2,
                  node.y - imgSize / 2,
                  imgSize,
                  imgSize
                );
                ctx.restore();
              }
            } else {
              ctx.beginPath();
              ctx.arc(node.x, node.y, imgSize / 2, 0, 2 * Math.PI);
              ctx.fillStyle = node.color || "#ccc";
              ctx.fill();
              ctx.strokeStyle = "#444";
              ctx.stroke();
            }

            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillStyle = "white";
            ctx.fillText(label, node.x, node.y - imgSize / 2 - 5);
          }}
        />
      </div>
    </div>
  );
}
