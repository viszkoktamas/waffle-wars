
const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const pool = new Pool({
  host: process.env.POSTGRESQL_ADDON_HOST,
  port: Number(process.env.POSTGRESQL_ADDON_PORT || 5432),
  database: process.env.POSTGRESQL_ADDON_DB,
  user: process.env.POSTGRESQL_ADDON_USER,
  password: process.env.POSTGRESQL_ADDON_PASSWORD
});

let ready;
function init() {
  return ready ||= pool.query(`
    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      waffle TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(err => {
    ready = null;
    throw err;
  });
}

app.get("/api/results", async (req, res) => {
  try {
    await init();
    const { rows } = await pool.query(
      "SELECT waffle, COUNT(*)::int AS votes FROM votes GROUP BY waffle"
    );
    const result = { Brussels: 0, Liege: 0 };
    for (const row of rows) result[row.waffle] = row.votes;
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Database unavailable" });
  }
});

app.post("/api/vote", async (req, res) => {
  if (!["Brussels", "Liege"].includes(req.body.waffle)) {
    return res.status(400).json({ error: "Invalid waffle" });
  }
  try {
    await init();
    await pool.query(
      "INSERT INTO votes (waffle) VALUES ($1)",
      [req.body.waffle]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Vote failed" });
  }
});

app.get("/", (req, res) => {
  res.type("html").send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Waffle Wars Belgium</title>
<style>
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh;
  background: #fff8e9; color: #35251a;
  font-family: system-ui, sans-serif;
  text-align: center; padding: 36px 16px;
}
h1 { font-size: 2.7rem; margin: 12px 0; }
.subtitle { color: #856b51; }
.card {
  background: white; border-radius: 22px;
  padding: 25px 15px; margin: 16px auto;
  max-width: 440px;
  box-shadow: 0 5px 22px #b88b4930;
}
.waffle { font-size: 65px; }
button {
  background: #e8a33e; border: none;
  border-radius: 14px; padding: 15px 28px;
  font-size: 18px; font-weight: bold;
  cursor: pointer; width: 100%;
}
button:disabled { opacity: .5; }
.bar {
  background: #f0e5d3; border-radius: 12px;
  height: 26px; overflow: hidden;
  margin: 12px 0;
}
.fill { background: #e8a33e; height: 100%; transition: width .3s; }
#status { min-height: 24px; }
footer { margin-top: 32px; color: #856b51; }
</style>
</head>
<body>
<h1>🧇 Waffle Wars</h1>
<p class="subtitle">Brussels vs. Liège — Belgium decides!</p>

<div class="card">
  <div class="waffle">🧇</div>
  <h2>Brussels Waffle</h2>
  <p>Light, crispy, legendary.</p>
  <button onclick="vote('Brussels')">Vote Brussels</button>
  <div class="bar"><div class="fill" id="barBrussels"></div></div>
  <strong id="Brussels">0 votes</strong>
</div>

<div class="card">
  <div class="waffle">🧇</div>
  <h2>Liège Waffle</h2>
  <p>Sweet, dense, caramelized.</p>
  <button onclick="vote('Liege')">Vote Liège</button>
  <div class="bar"><div class="fill" id="barLiege"></div></div>
  <strong id="Liege">0 votes</strong>
</div>

<p id="status"></p>
<h2 id="total">Loading votes...</h2>
<footer>Made for Devoxx Belgium 🇧🇪<br>Powered by Clever Cloud</footer>

<script>
async function refresh() {
  try {
    const r = await fetch('/api/results');
    if (!r.ok) throw Error('Database error');
    const data = await r.json();
    const total = data.Brussels + data.Liege;
    for (const key of ['Brussels', 'Liege']) {
      document.getElementById(key).textContent =
        data[key] + ' votes';
      document.getElementById('bar' + key).style.width =
        (total ? data[key] / total * 100 : 0) + '%';
    }
    document.getElementById('total').textContent =
      total + ' total votes';
    document.getElementById('status').textContent = '';
  } catch (e) {
    document.getElementById('status').textContent =
      'Could not load votes.';
  }
}
async function vote(waffle) {
  const buttons = document.querySelectorAll('button');
  buttons.forEach(b => b.disabled = true);
  try {
    const r = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waffle })
    });
    if (!r.ok) throw Error('Vote failed');
    await refresh();
  } catch (e) {
    document.getElementById('status').textContent =
      'Vote failed. Try again.';
  } finally {
    buttons.forEach(b => b.disabled = false);
  }
}
refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>
  `);
});

app.listen(process.env.PORT || 8080, "0.0.0.0", () => {
  console.log("Waffle Wars is running");
});
