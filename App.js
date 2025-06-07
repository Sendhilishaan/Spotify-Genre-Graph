import React, { useState, useEffect, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import * as d3 from "d3-force";
import { interpolateBlues } from "d3-scale-chromatic";

export default function App() {
  const [accessToken, setAccessToken] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const fgRef = useRef();

  const imageCache = useRef({}); // cache loaded images

  useEffect(() => {
    const hash = window.location.hash;
    console.log("URL hash:", hash);
    if (hash) {
      const params = new URLSearchParams(hash.slice(1)); // remove '#'
      const token = params.get("access_token");
      console.log("Access token from hash:", token);
      if (token) {
        setAccessToken(token);
        // Clean up the URL to remove token details
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
      .then(setGraphData)
      .catch((err) => {
        console.error("Error fetching graph data:", err);
      });
  }, [accessToken]);

  useEffect(() => {
    if (!graphData || !fgRef.current) return;

    const fg = fgRef.current;

    fg.d3Force("collide", d3.forceCollide(50));
    fg.d3Force("link").distance(120).strength(0.5);
    fg.d3Force("charge").strength(-50);
    fg.d3Force(
      "center",
      d3.forceCenter(window.innerWidth / 2, (window.innerHeight - 100) / 2)
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
    return <p style={{ textAlign: "center", marginTop: 50 }}>Loading your artist graph...</p>;
  }

  return (
    <div>
      <h1 style={{ textAlign: "center" }}>Your Top Artists Graph</h1>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeAutoColorBy="id"
        nodeRelSize={6}
        width={window.innerWidth}
        height={window.innerHeight - 100}
        linkWidth={(link) => Math.min(8, (link.weight || 1) * 2)}
        linkDirectionalParticles={1}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleWidth={1}
        linkColor={(link) => {
          const weight = link.weight || 1;
          const maxWeight = 5;
          const intensity = Math.min(weight / maxWeight, 1);
          return interpolateBlues(intensity);
        }}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const imgSize = 50;
          const fontSize = 12 / globalScale;
          const label = node.name;

          // Use cache to avoid reloading
          if (node.img) {
            if (!imageCache.current[node.id]) {
              const img = new Image();
              img.src = node.img;
              img.crossOrigin = "anonymous";
              img.onload = () => {
                imageCache.current[node.id] = img;
                setGraphData((data) => ({ ...data })); // trigger re-render
              };

            } else {
              const img = imageCache.current[node.id];
              ctx.save();
              ctx.beginPath();
              ctx.arc(node.x, node.y, imgSize / 2, 0, 2 * Math.PI);
              ctx.clip();
              ctx.drawImage(img, node.x - imgSize / 2, node.y - imgSize / 2, imgSize, imgSize);
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

          // Draw label
          ctx.font = `${fontSize}px Sans-Serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillStyle = "white";
          ctx.fillText(label, node.x, node.y - imgSize / 2 - 5);
        }}
      />
    </div>
  );
}
