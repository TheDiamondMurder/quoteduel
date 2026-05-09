const setupPanel = document.querySelector("#setup-panel");
const duelPanel = document.querySelector("#duel-panel");
const resultsPanel = document.querySelector("#results-panel");
const championPanel = document.querySelector("#champion-panel");
const setupForm = document.querySelector("#setup-form");
const playerCount = document.querySelector("#player-count");
const playersList = document.querySelector("#players-list");
const chatFile = document.querySelector("#chat-file");
const fileName = document.querySelector("#file-name");
const parseStatus = document.querySelector("#parse-status");
const roundLabel = document.querySelector("#round-label");
const matchLabel = document.querySelector("#match-label");
const turnLabel = document.querySelector("#turn-label");
const duelGrid = document.querySelector("#duel-grid");
const handoffScreen = document.querySelector("#handoff-screen");
const handoffTitle = document.querySelector("#handoff-title");
const readyButton = document.querySelector("#ready-button");
const resultReadyScreen = document.querySelector("#result-ready-screen");
const voteStatus = document.querySelector("#vote-status");
const showResults = document.querySelector("#show-results");
const winnerTitle = document.querySelector("#winner-title");
const winnerSubtitle = document.querySelector("#winner-subtitle");
const resultsCountdown = document.querySelector("#results-countdown");
const resultBars = document.querySelector("#result-bars");
const nextMatch = document.querySelector("#next-match");
const championQuote = document.querySelector("#champion-quote");
const championMeta = document.querySelector("#champion-meta");
const restart = document.querySelector("#restart");

const bracketSize = 32;
const roundNames = {
  32: "round of 32",
  16: "round of 16",
  8: "quarter final",
  4: "semi final",
  2: "final",
};

let chatTitleSender = "";
let players = [];
let currentRound = [];
let nextRound = [];
let matchIndex = 0;
let currentVotes = [];
let currentVoter = 0;
let currentWinner = null;
let suspenseTimer = null;
let finalTimers = [];

function renderPlayerInputs() {
  const count = Number(playerCount.value);
  playersList.replaceChildren(
    ...Array.from({ length: count }, (_, index) => {
      const label = document.createElement("label");
      label.innerHTML = `
        <span>player ${index + 1}</span>
        <input class="player-name" type="text" value="Player ${index + 1}" required />
      `;
      return label;
    }),
  );
}

function cleanText(text) {
  return text
    .replace(/\u200e/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseChatExport(text) {
  const entryRegex = /^[\u200e\s]*\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s+\d{1,2}:\d{2}(?::\d{2})?\]\s+([^:]+):\s*([\s\S]*)$/;
  const parsed = [];

  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trimEnd();
    const match = line.match(entryRegex);

    if (match) {
      const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
      parsed.push({
        date: new Date(year, Number(match[1]) - 1, Number(match[2])),
        sender: cleanText(match[4]),
        text: cleanText(match[5]),
      });
      return;
    }

    const last = parsed[parsed.length - 1];
    if (last && line.trim()) last.text = cleanText(`${last.text} ${line}`);
  });

  return parsed;
}

function isPseudoSender(sender) {
  const normalized = sender.toLowerCase().trim();
  const normalizedChatTitle = chatTitleSender.toLowerCase().trim();
  return (
    ["you", "meta ai", "whatsapp"].includes(normalized) ||
    normalized === normalizedChatTitle ||
    (normalized.length >= 3 && normalizedChatTitle.includes(normalized))
  );
}

function isSystemOrMediaMessage(message) {
  const text = message.text.toLowerCase();
  const sender = message.sender.toLowerCase();
  const banned = [
    "messages and calls are end-to-end encrypted",
    "this message was deleted",
    "image omitted",
    "video omitted",
    "audio omitted",
    "sticker omitted",
    "gif omitted",
    "document omitted",
    "contact card omitted",
    "poll omitted",
    "poll:",
    "ask question",
    "option:",
    "votes)",
    "vote)",
    "http://",
    "https://",
    "www.",
    ".com",
    ".co.uk",
    ".net",
    ".org",
    "created group",
    "created this group",
    "changed this group's icon",
    "changed the group description",
    "tap to change who can add other members",
    "added you",
    "you're now an admin",
    "now an admin",
    " added ",
    " left",
    " removed ",
  ];
  const senderActions = [`${sender} created`, `${sender} added`, `${sender} removed`, `${sender} changed`];
  return banned.some((phrase) => text.includes(phrase)) || senderActions.some((phrase) => text.includes(phrase));
}

function getWords(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hasEnoughContent(text) {
  const words = getWords(text);
  const letters = text.match(/\p{L}/gu) || [];
  const alphanumerics = text.match(/[\p{L}\p{N}]/gu) || [];
  const lower = text.toLowerCase();
  const looksLikePoll =
    lower.startsWith("poll:") ||
    (lower.includes("option:") && (lower.includes("vote)") || lower.includes("votes)")));
  const hasLink = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|co\.uk|net|org|gg|io|xyz)\b/i.test(text);
  return (
    !looksLikePoll &&
    !hasLink &&
    words.length >= 4 &&
    words.length <= 60 &&
    letters.length >= 10 &&
    alphanumerics.length >= 14
  );
}

function scoreQuote(message) {
  const text = message.text;
  const lower = text.toLowerCase();
  const dramaWords = ["bro", "nah", "what", "why", "mad", "insane", "crazy", "shut", "poor", "wrong", "explain"];
  return (
    Math.min(30, text.length / 5) +
    (text.match(/[?!]/g) || []).length * 4 +
    (text.match(/\p{Extended_Pictographic}/gu) || []).length * 3 +
    (text.match(/\b[A-Z]{4,}\b/g) || []).length * 5 +
    dramaWords.filter((word) => lower.includes(word)).length * 5
  );
}

function getPlayableQuotes(parsed) {
  return parsed
    .map((message, index) => ({ ...message, id: `quote-${index}` }))
    .filter((message) => !isPseudoSender(message.sender))
    .filter((message) => !isSystemOrMediaMessage(message))
    .filter((message) => hasEnoughContent(message.text));
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function pickBracketQuotes(messages) {
  const bySender = new Map();
  messages
    .sort((a, b) => scoreQuote(b) - scoreQuote(a))
    .forEach((message) => {
      bySender.set(message.sender, [...(bySender.get(message.sender) || []), message]);
    });

  const picked = [];
  while (picked.length < bracketSize && [...bySender.values()].some((items) => items.length)) {
    [...bySender.values()].forEach((items) => {
      if (picked.length < bracketSize && items.length) picked.push(items.shift());
    });
  }

  return shuffle(picked).slice(0, bracketSize);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function truncateQuote(text) {
  if (text.length <= 220) return text;
  return `${text.slice(0, 220).trim()}...`;
}

function showPanel(panel) {
  [setupPanel, duelPanel, resultsPanel, championPanel].forEach((item) => {
    item.hidden = item !== panel;
  });
}

function getMatch() {
  return [currentRound[matchIndex * 2], currentRound[matchIndex * 2 + 1]];
}

function renderDuel() {
  const [left, right] = getMatch();
  currentVotes = [];
  currentVoter = 0;
  currentWinner = null;

  roundLabel.textContent = roundNames[currentRound.length] || "duel";
  matchLabel.textContent = `match ${matchIndex + 1} of ${currentRound.length / 2}`;
  voteStatus.textContent = "";
  showResults.hidden = true;
  renderTurnLabel();
  handoffScreen.hidden = true;
  resultReadyScreen.hidden = true;
  duelGrid.hidden = false;

  duelGrid.replaceChildren(
    renderQuoteButton(left, "A"),
    renderQuoteButton(right, "B"),
  );

  showPanel(duelPanel);
}

function renderQuoteButton(quote, side) {
  const button = document.createElement("button");
  button.className = "quote-option";
  button.type = "button";
  button.dataset.quoteId = quote.id;
  button.innerHTML = `
    <span>quote ${side}</span>
    <blockquote>${escapeHtml(truncateQuote(quote.text))}</blockquote>
    <p>${escapeHtml(quote.sender)}</p>
  `;
  button.addEventListener("click", () => castVote(quote));
  return button;
}

function renderTurnLabel() {
  turnLabel.textContent = `${players[currentVoter].name} voting`;
}

function castVote(quote) {
  currentVotes.push({ player: players[currentVoter], quote });

  currentVoter += 1;
  if (currentVoter >= players.length) {
    duelGrid.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
      button.classList.remove("selected");
    });
    duelGrid.hidden = true;
    resultReadyScreen.hidden = false;
    showResults.hidden = false;
    voteStatus.textContent = "";
    turnLabel.textContent = "votes locked";
    return;
  }

  voteStatus.textContent = `${currentVotes[currentVotes.length - 1].player.name} voted.`;
  renderTurnLabel();
  showHandoff();
}

function showHandoff() {
  duelGrid.querySelectorAll(".quote-option").forEach((button) => button.classList.remove("selected"));
  duelGrid.hidden = true;
  handoffTitle.textContent = `${players[currentVoter].name}, are you ready to vote?`;
  handoffScreen.hidden = false;
}

function revealOptionsForNextVoter() {
  handoffScreen.hidden = true;
  duelGrid.hidden = false;
}

function getVoteCounts() {
  const [left, right] = getMatch();
  const counts = new Map([
    [left.id, { quote: left, votes: 0 }],
    [right.id, { quote: right, votes: 0 }],
  ]);
  currentVotes.forEach((vote) => {
    counts.get(vote.quote.id).votes += 1;
  });
  return [...counts.values()];
}

function revealResults() {
  clearFinalTimers();
  const counts = getVoteCounts();
  const maxVotes = Math.max(...counts.map((item) => item.votes));
  const tied = counts.filter((item) => item.votes === maxVotes);
  currentWinner = tied[Math.floor(Math.random() * tied.length)].quote;

  clearInterval(suspenseTimer);
  winnerTitle.textContent = "calculating...";
  winnerSubtitle.textContent = "the bracket committee is pretending this is scientific";
  resultsCountdown.textContent = "locking in soon";
  nextMatch.textContent = "Next Match";
  nextMatch.hidden = true;
  resultBars.classList.remove("locked", "final-mode");
  resultsPanel.classList.remove("final-results");

  resultBars.replaceChildren(
    ...counts.map((item) => {
      const row = document.createElement("article");
      row.className = "result-row";
      row.innerHTML = `
        <header>
          <span>${escapeHtml(item.quote.sender)}</span>
          <span class="vote-number" data-quote-id="${item.quote.id}">0/${players.length} votes / 0%</span>
        </header>
        <div class="bar-shell">
          <div class="bar-fill" data-quote-id="${item.quote.id}"></div>
        </div>
        <p>${escapeHtml(truncateQuote(item.quote.text))}</p>
      `;
      return row;
    }),
  );

  showPanel(resultsPanel);
  if (currentRound.length === 2) {
    runFinalReveal(counts, tied);
    return;
  }
  runSuspenseReveal(counts, tied);
}

function setResultVisuals(counts, useTrueValues) {
  counts.forEach((item) => {
    const percent = useTrueValues
      ? Math.round((item.votes / players.length) * 100)
      : Math.floor(8 + Math.random() * 84);
    const votes = useTrueValues ? item.votes : Math.min(players.length, Math.floor((percent / 100) * players.length));
    const bar = resultBars.querySelector(`.bar-fill[data-quote-id="${item.quote.id}"]`);
    const number = resultBars.querySelector(`.vote-number[data-quote-id="${item.quote.id}"]`);
    bar.style.width = `${percent}%`;
    number.textContent = `${votes}/${players.length} votes / ${percent}%`;
  });
}

function runSuspenseReveal(counts, tied) {
  resultBars.classList.remove("locked", "final-mode");
  let ticks = 0;
  suspenseTimer = setInterval(() => {
    ticks += 1;
    setResultVisuals(counts, false);
    resultsCountdown.textContent = ticks < 9 ? "still counting..." : "final check...";

    if (ticks >= 12) {
      clearInterval(suspenseTimer);
      resultBars.classList.add("locked");
      setResultVisuals(counts, true);
      winnerTitle.textContent = tied.length > 1 ? "tie broken by chaos" : "winner revealed";
      winnerSubtitle.textContent = `"${truncateQuote(currentWinner.text)}" moves on.`;
      resultsCountdown.textContent = "locked in";
      nextMatch.hidden = false;
    }
  }, 420);
}

function clearFinalTimers() {
  finalTimers.forEach((timer) => clearTimeout(timer));
  finalTimers = [];
}

function scheduleFinal(ms, callback) {
  const timer = setTimeout(callback, ms);
  finalTimers.push(timer);
}

function runFinalReveal(counts, tied) {
  resultBars.classList.remove("locked");
  resultBars.classList.add("final-mode");
  resultsPanel.classList.add("final-results");
  winnerTitle.textContent = "final result";
  winnerSubtitle.textContent = "do not refresh. do not blink.";
  resultsCountdown.textContent = "opening the envelope...";
  nextMatch.hidden = true;

  let ticks = 0;
  suspenseTimer = setInterval(() => {
    ticks += 1;
    setResultVisuals(counts, false);
    const lines = [
      "reviewing the tapes...",
      "checking the group chat archives...",
      "consulting the bracket council...",
      "detecting aura levels...",
      "this could change everything...",
      "final verification in progress...",
    ];
    resultsCountdown.textContent = lines[ticks % lines.length];
  }, 360);

  scheduleFinal(4000, () => {
    winnerTitle.textContent = "two quotes entered";
    winnerSubtitle.textContent = "only one can survive the final";
  });

  scheduleFinal(9000, () => {
    winnerTitle.textContent = "the vote is close";
    winnerSubtitle.textContent = "the room is silent";
  });

  scheduleFinal(15000, () => {
    winnerTitle.textContent = "final numbers loading";
    winnerSubtitle.textContent = "bars are no longer trustworthy";
  });

  scheduleFinal(22000, () => {
    winnerTitle.textContent = "winner incoming";
    winnerSubtitle.textContent = "prepare yourself";
    resultsCountdown.textContent = "locking final result...";
  });

  scheduleFinal(30000, () => {
    clearInterval(suspenseTimer);
    resultBars.classList.add("locked");
    setResultVisuals(counts, true);
    winnerTitle.textContent = tied.length > 1 ? "final tie broken by chaos" : "quote duel champion";
    winnerSubtitle.textContent = `"${truncateQuote(currentWinner.text)}" wins the whole thing.`;
    resultsCountdown.textContent = "final locked";
    nextMatch.hidden = false;
    nextMatch.textContent = "Crown Champion";
  });
}

function advanceBracket() {
  nextRound.push(currentWinner);
  matchIndex += 1;

  if (matchIndex < currentRound.length / 2) {
    renderDuel();
    return;
  }

  if (nextRound.length === 1) {
    renderChampion(nextRound[0]);
    return;
  }

  currentRound = nextRound;
  nextRound = [];
  matchIndex = 0;
  renderDuel();
}

function renderChampion(quote) {
  championQuote.textContent = quote.text;
  championMeta.textContent = `${quote.sender} wins Quote Duel`;
  showPanel(championPanel);
}

function startBracket(quotes) {
  currentRound = quotes;
  nextRound = [];
  matchIndex = 0;
  renderDuel();
}

chatFile.addEventListener("change", () => {
  fileName.textContent = chatFile.files[0]?.name || "No file selected";
});

playerCount.addEventListener("input", renderPlayerInputs);

setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const file = chatFile.files[0];
  if (!file) return;

  players = [...document.querySelectorAll(".player-name")].map((input, index) => ({
    id: index,
    name: input.value.trim() || `Player ${index + 1}`,
  }));

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const parsed = parseChatExport(String(reader.result || ""));
    chatTitleSender = parsed[0]?.sender || "";
    const quotes = getPlayableQuotes(parsed);

    if (quotes.length < bracketSize) {
      parseStatus.textContent = `Only found ${quotes.length} good quotes. Need 32.`;
      return;
    }

    parseStatus.textContent = `Found ${quotes.length.toLocaleString()} good quotes. Bracket locked.`;
    startBracket(pickBracketQuotes(quotes));
  });
  reader.readAsText(file);
});

showResults.addEventListener("click", revealResults);
readyButton.addEventListener("click", revealOptionsForNextVoter);
nextMatch.addEventListener("click", advanceBracket);
restart.addEventListener("click", () => window.location.reload());

renderPlayerInputs();

