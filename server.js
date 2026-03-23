const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Fixed voter lists ───────────────────────────────────────────────────────

const ROOM_1_VOTERS = [
  'Grimes', 'Justin West', 'James West', 'Halsey', 'Hailee Steinfeld',
  'Post Malone', 'Jodie Comer', 'Camila Cabello', 'Sofia Cabello',
  'Sydney Sweeney', 'Shawn Mendes', 'Dominic Fike', 'Charli xcx',
  'Machine Gun Kelly', 'Anya Taylor Joy', 'Clairo', 'Troye Sivan',
  'Renee', 'Rhian', 'Ayo', 'Ruby', 'Emma Corrin', 'Lisa', 'Sebastian',
  'Garance', 'Gracie', 'Steven', 'St Vincent', 'Aaron Pierre',
  'Pedro Pascal', 'Sadie'
];

const ROOM_2_VOTERS = [
  'Billie Eilish', 'Hunter Schafer', 'Alexa Campbell',
  'Timothee Chalamet', 'Lil Nas X', 'Olivia Rodrigo', 'Harry Styles',
  'Claudia Sulewski', 'Finneas O\'Connell', 'Michael B Jordan',
  'Kid Cudi', 'Tony Stark', 'Simu Liu', 'Jenna Ortega',
  'Rachel Sennott', 'Sabrina Carpenter', 'Dafne Keen', 'Barry Keoghan',
  'Omar Apollo', 'Chapelle Roan', 'Madelyn Cline', 'Doja Cat',
  'Mila King', 'Jasmine-Rivera King', 'Bella Hadid', 'Odessa A\'zion',
  'Glen Powell', 'Colman Domingo', 'Adriana Young', 'Florence Pugh',
  'Mikey Madison', 'Alex Consani', 'Tate McRae'
];

// ─── State ───────────────────────────────────────────────────────────────────

let poll = null;
let currentVoterStatus = {
  1: { currentVoter: null, done: false },
  2: { currentVoter: null, done: false }
};

// ─── API ─────────────────────────────────────────────────────────────────────

// Host creates a poll
app.post('/api/poll', (req, res) => {
  const { question, options, freeText, rankedChoice, secondWeight, slider, sliderMin, sliderMax, sliderStep } = req.body;
  if (!question) return res.status(400).json({ error: 'Missing question' });
  poll = {
    question,
    options: options || [],
    freeText: !!freeText,
    rankedChoice: !!rankedChoice,
    secondWeight: typeof secondWeight === 'number' ? secondWeight : 0.5,
    slider: !!slider,
    sliderMin: typeof sliderMin === 'number' ? sliderMin : 0,
    sliderMax: typeof sliderMax === 'number' ? sliderMax : 5,
    sliderStep: typeof sliderStep === 'number' ? sliderStep : 1,
    votes: { 1: {}, 2: {} }
  };
  currentVoterStatus = {
    1: { currentVoter: null, done: false },
    2: { currentVoter: null, done: false }
  };
  res.json({ ok: true, room1Count: ROOM_1_VOTERS.length, room2Count: ROOM_2_VOTERS.length });
});

// Get poll state
app.get('/api/poll', (req, res) => {
  if (!poll) return res.json({ active: false });
  res.json({ active: true, question: poll.question, options: poll.options, freeText: poll.freeText, rankedChoice: poll.rankedChoice, secondWeight: poll.secondWeight, slider: poll.slider, sliderMin: poll.sliderMin, sliderMax: poll.sliderMax, sliderStep: poll.sliderStep });
});

// Get shuffled voter list for a room
app.get('/api/poll/voters/:room', (req, res) => {
  const room = parseInt(req.params.room);
  if (!poll) return res.status(404).json({ error: 'No active poll' });
  const source = room === 1 ? ROOM_1_VOTERS : room === 2 ? ROOM_2_VOTERS : null;
  if (!source) return res.status(400).json({ error: 'Invalid room' });
  const voters = [...source];
  for (let i = voters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [voters[i], voters[j]] = [voters[j], voters[i]];
  }
  res.json({ voters });
});

// Submit a vote
app.post('/api/poll/vote', (req, res) => {
  const { room, name, answer } = req.body;
  const r = parseInt(room);
  if (!poll) return res.status(400).json({ error: 'No active poll' });
  const source = r === 1 ? ROOM_1_VOTERS : r === 2 ? ROOM_2_VOTERS : null;
  if (!source) return res.status(400).json({ error: 'Invalid room' });
  if (!source.includes(name)) return res.status(400).json({ error: 'Voter not in room' });
  poll.votes[r][name] = answer;
  res.json({ ok: true });
});

// Current voter status
app.post('/api/poll/current/:room', (req, res) => {
  const room = parseInt(req.params.room);
  if (![1, 2].includes(room)) return res.status(400).json({ error: 'Invalid room' });
  const { currentVoter, done } = req.body;
  currentVoterStatus[room] = { currentVoter: currentVoter || null, done: !!done };
  res.json({ ok: true });
});

app.get('/api/poll/current/:room', (req, res) => {
  const room = parseInt(req.params.room);
  if (![1, 2].includes(room)) return res.status(400).json({ error: 'Invalid room' });
  res.json(currentVoterStatus[room]);
});

// Combined results for host (no names)
app.get('/api/poll/results', (req, res) => {
  if (!poll) return res.status(404).json({ error: 'No active poll' });
  // Filter out skipped (null) votes — they don't count at all
  function filterVotes(votes) {
    const filtered = {};
    for (const [name, answer] of Object.entries(votes)) {
      if (answer !== null) filtered[name] = answer;
    }
    return filtered;
  }

  const room1Active = filterVotes(poll.votes[1]);
  const room2Active = filterVotes(poll.votes[2]);
  const allVotes = { ...room1Active, ...room2Active };

  const w2 = poll.secondWeight || 0.5;

  function tallyVotes(votes) {
    const t = {};
    for (const answer of Object.values(votes)) {
      if (poll.rankedChoice && typeof answer === 'object') {
        t[answer.first] = (t[answer.first] || 0) + 1;
        if (answer.second) t[answer.second] = (t[answer.second] || 0) + w2;
      } else {
        t[answer] = (t[answer] || 0) + 1;
      }
    }
    return t;
  }

  const tally = tallyVotes(allVotes);
  const room1Tally = { tally: tallyVotes(room1Active) };
  const room2Tally = { tally: tallyVotes(room2Active) };

  // Raw votes list (de-identified, shuffled) — skipped excluded
  const rawVotes = Object.values(allVotes).map(v => {
    if (poll.rankedChoice && typeof v === 'object') return `1st: ${v.first}` + (v.second ? ` | 2nd: ${v.second}` : '');
    return v;
  });
  for (let i = rawVotes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rawVotes[i], rawVotes[j]] = [rawVotes[j], rawVotes[i]];
  }

  const totalVoters = Object.keys(room1Active).length + Object.keys(room2Active).length;

  // Slider stats
  let sliderStats = null;
  if (poll.slider) {
    const nums = Object.values(allVotes).filter(v => typeof v === 'number');
    if (nums.length > 0) {
      const sum = nums.reduce((a, b) => a + b, 0);
      sliderStats = {
        average: Math.round(sum / nums.length * 100) / 100,
        min: Math.min(...nums),
        max: Math.max(...nums),
        count: nums.length
      };
    }
  }

  res.json({
    question: poll.question, options: poll.options, freeText: poll.freeText,
    rankedChoice: poll.rankedChoice, secondWeight: w2,
    slider: poll.slider, sliderMin: poll.sliderMin, sliderMax: poll.sliderMax, sliderStep: poll.sliderStep,
    sliderStats,
    tally, totalVoters,
    totalVoted: Object.keys(allVotes).length,
    rawVotes,
    rooms: {
      1: { total: Object.keys(room1Active).length, voted: Object.keys(room1Active).length, ...room1Tally },
      2: { total: Object.keys(room2Active).length, voted: Object.keys(room2Active).length, ...room2Tally }
    }
  });
});

// Per-person results for a room
app.get('/api/poll/results/:room', (req, res) => {
  const room = parseInt(req.params.room);
  if (!poll) return res.status(404).json({ error: 'No active poll' });
  const source = room === 1 ? ROOM_1_VOTERS : room === 2 ? ROOM_2_VOTERS : null;
  if (!source) return res.status(400).json({ error: 'Invalid room' });
  // Exclude skipped and non-voters — they don't exist in results
  const results = source
    .filter(name => poll.votes[room][name] !== undefined && poll.votes[room][name] !== null)
    .map(name => {
      const v = poll.votes[room][name];
      if (poll.rankedChoice && typeof v === 'object') {
        return { name, answer: v.first + (v.second ? ` (2nd: ${v.second})` : '') };
      }
      return { name, answer: v };
    });
  results.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ question: poll.question, rankedChoice: poll.rankedChoice, results });
});

// Reset poll
app.post('/api/poll/reset', (req, res) => {
  poll = null;
  currentVoterStatus = { 1: { currentVoter: null, done: false }, 2: { currentVoter: null, done: false } };
  res.json({ ok: true });
});

// Network URL for QR code
app.get('/api/network-url', (req, res) => {
  const mdns = `http://dragonpolls.local:${PORT}`;
  const nets = require('os').networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return res.json({ url: `http://${addr.address}:${PORT}`, mdns });
      }
    }
  }
  res.json({ url: `http://localhost:${PORT}`, mdns });
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dragon Polls running at http://localhost:${PORT}`);
  const nets = require('os').networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log(`   Network: http://${addr.address}:${PORT}`);
      }
    }
  }

  // Advertise via Bonjour/mDNS (local only)
  try {
    const { Bonjour } = require('bonjour-service');
    const bonjour = new Bonjour();
    bonjour.publish({ name: 'Dragon Polls', type: 'http', port: PORT, host: 'dragonpolls.local' });
    console.log(`   mDNS:    http://dragonpolls.local:${PORT}`);
  } catch (e) { /* skip mDNS on hosted environments */ }
});
