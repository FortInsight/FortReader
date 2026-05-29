const fileNameEl = document.getElementById("fileName");
const wordCountEl = document.getElementById("wordCount");
const statusText = document.getElementById("statusText");
const textViewer = document.getElementById("textViewer");
const rewindBtn = document.getElementById("rewindBtn");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const stopBtn = document.getElementById("stopBtn");
const forwardBtn = document.getElementById("forwardBtn");
const speedRange = document.getElementById("speedRange");
const speedValue = document.getElementById("speedValue");
const progressValue = document.getElementById("progressValue");
const chunkValue = document.getElementById("chunkValue");
const totalTimeValue = document.getElementById("totalTimeValue");
const doneTimeValue = document.getElementById("doneTimeValue");
const leftTimeValue = document.getElementById("leftTimeValue");
const meterFill = document.getElementById("meterFill");
const progressRange = document.getElementById("progressRange");
const themeToggle = document.getElementById("themeToggle");
const themeLabel = document.getElementById("themeLabel");
const pasteInput = document.getElementById("pasteInput");
const pasteBtn = document.getElementById("pasteBtn");
const explainPasteBtn = document.getElementById("explainPasteBtn");
const summarizePasteBtn = document.getElementById("summarizePasteBtn");
const savePasteBtn = document.getElementById("savePasteBtn");
const pasteTitleInput = document.getElementById("pasteTitleInput");
const deleteBtn = document.getElementById("deleteBtn");
const savedList = document.getElementById("savedList");
const readerToolbar = document.getElementById("readerToolbar");
const voiceSelect = document.getElementById("voiceSelect");
const fontSelect = document.getElementById("fontSelect");
const fontSizeRange = document.getElementById("fontSizeRange");
const fontSizeValue = document.getElementById("fontSizeValue");
const toggleToolbarBtn = document.getElementById("toggleToolbarBtn");
const focusModeBtn = document.getElementById("focusModeBtn");
const recenterBtn = document.getElementById("recenterBtn");

const SAVED_TEXTS_KEY = "echo-reader-saved-texts";
const READER_PREFERENCES_KEY = "echo-reader-preferences";

let currentText = "";
let chunks = [];
let isPaused = false;
let currentSourceType = "";
let activeWordIndex = -1;
let availableVoices = [];
let playbackChunkIndex = 0;
let playbackWordIndex = 0;
let isReading = false;
let lastVisibleChunkIndex = -1;
let isToolbarCollapsed = false;
let wasReadingBeforeSeek = false;
let currentSavedDocumentId = "";
let savedTexts = loadSavedTexts();
let readerPreferences = loadReaderPreferences();
let scrollAnimationFrame = 0;
let targetViewerScrollTop = 0;

applySavedPreferences();
populateVoices();
applyReaderStyle();
renderSavedTexts();

if ("onvoiceschanged" in speechSynthesis) {
  speechSynthesis.onvoiceschanged = () => {
    populateVoices();
  };
}

playBtn.addEventListener("click", () => {
  if (!chunks.length) {
    updateStatus("Paste some text before starting playback.");
    return;
  }

  speechSynthesis.cancel();
  isPaused = false;
  isReading = true;
  speakFromPosition(playbackChunkIndex, playbackWordIndex);
});

pauseBtn.addEventListener("click", () => {
  if (speechSynthesis.speaking && !speechSynthesis.paused) {
    speechSynthesis.pause();
    isPaused = true;
    persistSavedProgress();
    updateStatus("Reading paused.");
  }
});

resumeBtn.addEventListener("click", () => {
  if (speechSynthesis.paused) {
    speechSynthesis.resume();
    isPaused = false;
    updateStatus("Reading resumed.");
  }
});

stopBtn.addEventListener("click", () => {
  stopReading();
  updateStatus("Reading stopped.");
});

rewindBtn.addEventListener("click", () => {
  shiftReadingPosition(-1);
});

forwardBtn.addEventListener("click", () => {
  shiftReadingPosition(1);
});

deleteBtn.addEventListener("click", () => {
  resetDocument();
  updateStatus("Document deleted.");
});

pasteBtn.addEventListener("click", () => {
  loadPastedContent("read");
});

explainPasteBtn.addEventListener("click", () => {
  loadPastedContent("explain");
});

summarizePasteBtn.addEventListener("click", () => {
  loadPastedContent("summarize");
});

savePasteBtn.addEventListener("click", () => {
  const raw = pasteInput.value.trim();
  if (!raw) {
    updateStatus("Paste text first, then save it to your library.");
    return;
  }

  const savedItem = savePastedText(raw, pasteTitleInput.value.trim());
  renderSavedTexts();

  stopReading();
  setDocumentText(getPlainTextForSavedItem(savedItem), {
    sourceType: savedItem.mode,
    sourceLabel: savedItem.title,
    savedDocumentId: savedItem.id,
    savedProgress: savedItem.progress
  });
  updateStatus("Pasted text saved. You can reopen it later and keep your place.");
});

speedRange.addEventListener("input", () => {
  speedValue.textContent = `${Number(speedRange.value).toFixed(1)}x`;
  saveReaderPreference("speed", speedRange.value);
  updateTimeEstimates();
});

progressRange.addEventListener("input", () => {
  previewSeekToPercent(Number(progressRange.value));
});

progressRange.addEventListener("change", () => {
  seekToPercent(Number(progressRange.value), true);
});

progressRange.addEventListener("pointerdown", () => {
  wasReadingBeforeSeek = speechSynthesis.speaking || speechSynthesis.paused || isReading;
});

fontSelect.addEventListener("change", () => {
  saveReaderPreference("font", fontSelect.value);
  applyReaderStyle();
});

fontSizeRange.addEventListener("input", () => {
  fontSizeValue.textContent = `${fontSizeRange.value}px`;
  saveReaderPreference("fontSize", fontSizeRange.value);
  applyReaderStyle();
});

toggleToolbarBtn.addEventListener("click", () => {
  isToolbarCollapsed = !isToolbarCollapsed;
  readerToolbar.classList.toggle("is-collapsed", isToolbarCollapsed);
  toggleToolbarBtn.textContent = isToolbarCollapsed ? "Show controls" : "Hide controls";
});

focusModeBtn.addEventListener("click", () => {
  document.body.classList.toggle("focus-reader");
  focusModeBtn.textContent = document.body.classList.contains("focus-reader")
    ? "Exit focus"
    : "Focus mode";
});

recenterBtn.addEventListener("click", () => {
  recenterHighlight();
});

themeToggle.addEventListener("click", () => {
  const body = document.body;
  const nextTheme = body.classList.contains("theme-dark") ? "theme-light" : "theme-dark";
  body.classList.remove("theme-dark", "theme-light");
  body.classList.add(nextTheme);
  themeLabel.textContent = nextTheme === "theme-dark" ? "Dark Mode" : "Light Mode";
  saveReaderPreference("theme", nextTheme);
});

voiceSelect.addEventListener("change", () => {
  saveReaderPreference("voice", voiceSelect.value);
});

savedList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const { action, id } = button.dataset;
  if (!id) {
    return;
  }

  if (action === "open") {
    openSavedText(id);
    return;
  }

  if (action === "delete") {
    deleteSavedText(id);
  }
});

function updateStatus(message) {
  statusText.textContent = message;
}

function loadPastedContent(mode) {
  const raw = pasteInput.value.trim();
  if (!raw) {
    updateStatus("Paste text into the box first.");
    return;
  }

  stopReading();
  const plainText = cleanText(raw);
  const transformed = transformPastedText(plainText, mode);
  const labelMap = {
    read: "Pasted Text",
    explain: "Explanation",
    summarize: "Summary"
  };
  const statusMap = {
    read: "Plain text loaded for reading.",
    explain: "Pasted text explained in simpler language.",
    summarize: "Pasted text summarized."
  };

  setDocumentText(transformed, {
    sourceType: "text",
    sourceLabel: labelMap[mode] || "Pasted Text",
    savedDocumentId: ""
  });
  updateStatus(statusMap[mode] || "Pasted text loaded.");
}

function loadReaderPreferences() {
  try {
    const raw = window.localStorage.getItem(READER_PREFERENCES_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("Reader preferences could not be loaded.", error);
    return {};
  }
}

function persistReaderPreferences() {
  window.localStorage.setItem(READER_PREFERENCES_KEY, JSON.stringify(readerPreferences));
}

function saveReaderPreference(key, value) {
  readerPreferences[key] = value;
  persistReaderPreferences();
}

function applySavedPreferences() {
  const theme = readerPreferences.theme;
  if (theme === "theme-light" || theme === "theme-dark") {
    document.body.classList.remove("theme-dark", "theme-light");
    document.body.classList.add(theme);
    themeLabel.textContent = theme === "theme-dark" ? "Dark Mode" : "Light Mode";
  }

  if (readerPreferences.speed) {
    speedRange.value = String(readerPreferences.speed);
    speedValue.textContent = `${Number(speedRange.value).toFixed(1)}x`;
  }

  if (readerPreferences.fontSize) {
    fontSizeRange.value = String(readerPreferences.fontSize);
    fontSizeValue.textContent = `${fontSizeRange.value}px`;
  }

  if (readerPreferences.font) {
    fontSelect.value = readerPreferences.font;
  }

}

function setDocumentText(text, options = {}) {
  currentText = cleanText(text);
  currentSourceType = options.sourceType || "";
  currentSavedDocumentId = options.savedDocumentId || "";
  fileNameEl.textContent = options.sourceLabel || "Loaded document";
  const words = currentText.trim() ? currentText.trim().split(/\s+/).length : 0;
  wordCountEl.textContent = words.toLocaleString();

  if (!currentText) {
    clearReader();
    return;
  }

  chunks = createChunks(currentText);
  renderChunks();
  const savedProgress = normalizeSavedProgress(options.savedProgress, chunks);
  playbackChunkIndex = savedProgress.chunkIndex;
  playbackWordIndex = savedProgress.wordIndex;
  lastVisibleChunkIndex = -1;
  highlightChunk(playbackChunkIndex, playbackWordIndex, true);
  updateProgress(calculateProgressFromPosition(playbackChunkIndex, playbackWordIndex));
  chunkValue.textContent = `${Math.min(playbackChunkIndex + 1, chunks.length)} / ${chunks.length}`;
  updateTimeEstimates();
  persistSavedProgress();
}

function cleanText(text) {
  return text
    .replace(/([A-Za-z])-\s+([A-Za-z])/g, "$1$2")
    .replace(/^[ \t]*[*-][ \t]+/gm, "• ")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function createChunks(text) {
  const sentences =
    text.match(/[^.!?\n]+[.!?]?|\n+/g)?.map((part) => part.trim()).filter(Boolean) || [];
  const built = [];
  let bucket = "";

  for (const sentence of sentences) {
    const next = `${bucket} ${sentence}`.trim();
    if (next.length > 170 && bucket) {
      built.push(bucket);
      bucket = sentence;
    } else {
      bucket = next;
    }
  }

  if (bucket) {
    built.push(bucket);
  }

  return built;
}

function renderChunks() {
  textViewer.innerHTML = "";

  chunks.forEach((chunk, index) => {
    const span = document.createElement("span");
    span.className = "viewer-line";
    span.dataset.index = String(index);
    renderChunkWords(span, chunk, index);
    textViewer.appendChild(span);
    textViewer.appendChild(document.createTextNode(" "));
  });
}

function speakFromPosition(chunkIndex, wordIndex) {
  if (chunkIndex >= chunks.length) {
    isReading = false;
    updateProgress(100);
    chunkValue.textContent = `${chunks.length} / ${chunks.length}`;
    updateStatus("Finished reading.");
    setActiveWord(-1);
    persistSavedProgress();
    return;
  }

  const words = getChunkWords(chunks[chunkIndex]);
  const safeWordIndex = Math.min(Math.max(wordIndex, 0), Math.max(words.length - 1, 0));
  const segment = words.slice(safeWordIndex).join("");

  if (!segment.trim()) {
    playbackChunkIndex = chunkIndex + 1;
    playbackWordIndex = 0;
    speakFromPosition(playbackChunkIndex, playbackWordIndex);
    return;
  }

  playbackChunkIndex = chunkIndex;
  playbackWordIndex = safeWordIndex;
  highlightChunk(chunkIndex, safeWordIndex, true);
  updateProgress(calculateProgressFromPosition(chunkIndex, safeWordIndex));
  chunkValue.textContent = `${chunkIndex + 1} / ${chunks.length}`;
  persistSavedProgress();

  const utterance = new SpeechSynthesisUtterance(normalizeSpeechText(segment));
  utterance.rate = Number(speedRange.value);
  utterance.pitch = 1;
  const selectedVoice = getSelectedVoice();
  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang || "en-US";
  } else {
    utterance.lang = "en-US";
  }

  utterance.onboundary = (event) => {
    if (event.name === "word" || event.charIndex >= 0) {
      const relativeWordIndex = getWordIndexFromCharIndex(segment, event.charIndex);
      const actualWordIndex = safeWordIndex + relativeWordIndex;
      playbackChunkIndex = chunkIndex;
      playbackWordIndex = actualWordIndex;
      highlightChunk(chunkIndex, actualWordIndex);
      updateProgress(calculateProgressFromPosition(chunkIndex, actualWordIndex));
      persistSavedProgress();
    }
  };

  utterance.onend = () => {
    if (!isPaused) {
      playbackChunkIndex = chunkIndex + 1;
      playbackWordIndex = 0;
      persistSavedProgress();
      speakFromPosition(playbackChunkIndex, playbackWordIndex);
    }
  };

  utterance.onerror = () => {
    isReading = false;
    persistSavedProgress();
    updateStatus("Speech playback hit an error. Try another browser voice.");
  };

  updateStatus("Reading aloud...");
  speechSynthesis.speak(utterance);
}

function highlightChunk(index, wordIndex, forceCenter = false) {
  const nodes = textViewer.querySelectorAll(".viewer-line");
  nodes.forEach((node) => node.classList.remove("is-active"));
  const active = textViewer.querySelector(`[data-index="${index}"]`);
  if (active) {
    active.classList.add("is-active");
    if (forceCenter) {
      keepChunkInView(active, forceCenter);
      lastVisibleChunkIndex = index;
    } else if (lastVisibleChunkIndex !== index) {
      lastVisibleChunkIndex = index;
    }
  }

  const absoluteWordIndex = getAbsoluteWordIndex(index, wordIndex);
  setActiveWord(absoluteWordIndex, forceCenter);
}

function updateProgress(percent) {
  progressValue.textContent = `${percent}%`;
  meterFill.style.width = `${percent}%`;
  progressRange.value = String(Math.max(0, Math.min(100, Math.round(percent))));
  updateTimeEstimates();
}

function stopReading() {
  speechSynthesis.cancel();
  isPaused = false;
  isReading = false;
  const nodes = textViewer.querySelectorAll(".viewer-line");
  nodes.forEach((node) => node.classList.remove("is-active"));
  if (chunks.length) {
    highlightChunk(playbackChunkIndex, playbackWordIndex, true);
    updateProgress(calculateProgressFromPosition(playbackChunkIndex, playbackWordIndex));
    chunkValue.textContent = `${Math.min(playbackChunkIndex + 1, chunks.length)} / ${chunks.length}`;
  } else {
    setActiveWord(-1);
    updateProgress(0);
    chunkValue.textContent = "0 / 0";
  }
  persistSavedProgress();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function clearReader(message = "No readable text found in that file.") {
  currentText = "";
  currentSourceType = "";
  currentSavedDocumentId = "";
  chunks = [];
  playbackChunkIndex = 0;
  playbackWordIndex = 0;
  isReading = false;
  lastVisibleChunkIndex = -1;
  activeWordIndex = -1;
  textViewer.innerHTML = `<p class="placeholder">${message}</p>`;
  if (fileNameEl.textContent === "None loaded") {
    wordCountEl.textContent = "0";
  }
  updateProgress(0);
  chunkValue.textContent = "0 / 0";
  updateTimeEstimates();
}

function resetDocument() {
  stopReading();
  pasteInput.value = "";
  pasteTitleInput.value = "";
  fileNameEl.textContent = "None loaded";
  wordCountEl.textContent = "0";
  clearReader();
}

function renderChunkWords(container, chunk, chunkIndex) {
  const words = getChunkWords(chunk);
  words.forEach((word, wordIndex) => {
    const span = document.createElement("span");
    span.className = "viewer-word";
    span.dataset.absoluteWordIndex = String(getAbsoluteWordIndex(chunkIndex, wordIndex));
    span.dataset.chunkIndex = String(chunkIndex);
    span.dataset.wordIndex = String(wordIndex);
    span.textContent = word;
    span.title = "Double-click to start reading from here";
    span.addEventListener("dblclick", () => {
      startReadingFromSelection(chunkIndex, wordIndex);
    });
    container.appendChild(span);
  });
}

function getAbsoluteWordIndex(chunkIndex, wordIndex) {
  let total = 0;
  for (let index = 0; index < chunkIndex; index += 1) {
    total += countWordsInChunk(chunks[index]);
  }
  return total + Math.max(wordIndex, 0);
}

function countWordsInChunk(chunk) {
  return getChunkWords(chunk).length;
}

function getWordIndexFromCharIndex(chunk, charIndex) {
  const words = chunk.match(/\S+\s*/g) || [];
  let cursor = 0;

  for (let index = 0; index < words.length; index += 1) {
    cursor += words[index].length;
    if (charIndex < cursor) {
      return index;
    }
  }

  return Math.max(words.length - 1, 0);
}

function setActiveWord(nextIndex, forceCenter = false) {
  if (activeWordIndex === nextIndex && !forceCenter) {
    return;
  }

  const current = textViewer.querySelector(`[data-absolute-word-index="${activeWordIndex}"]`);
  if (current) {
    current.classList.remove("is-active");
  }

  activeWordIndex = nextIndex;
  if (nextIndex < 0) {
    return;
  }

  const next = textViewer.querySelector(`[data-absolute-word-index="${nextIndex}"]`);
  if (next) {
    next.classList.add("is-active");
    if (forceCenter) {
      centerElementInView(next);
    } else {
      keepWordInView(next);
    }
  }
}

function getChunkWords(chunk) {
  return chunk.match(/\S+\s*/g) || [];
}

function startReadingFromSelection(chunkIndex, wordIndex) {
  speechSynthesis.cancel();
  isPaused = false;
  isReading = true;
  playbackChunkIndex = chunkIndex;
  playbackWordIndex = wordIndex;
  lastVisibleChunkIndex = -1;
  highlightChunk(chunkIndex, wordIndex, true);
  updateProgress(calculateProgressFromPosition(chunkIndex, wordIndex));
  chunkValue.textContent = `${chunkIndex + 1} / ${chunks.length}`;
  persistSavedProgress();
  speakFromPosition(chunkIndex, wordIndex);
}

function shiftReadingPosition(direction) {
  if (!chunks.length) {
    updateStatus("Paste some text before moving through it.");
    return;
  }

  const targetChunk = Math.min(Math.max(playbackChunkIndex + direction, 0), chunks.length - 1);
  playbackChunkIndex = targetChunk;
  playbackWordIndex = 0;

  if (speechSynthesis.speaking || speechSynthesis.paused || isReading) {
    speechSynthesis.cancel();
    isPaused = false;
    isReading = true;
    speakFromPosition(playbackChunkIndex, playbackWordIndex);
  } else {
    highlightChunk(playbackChunkIndex, playbackWordIndex, true);
    updateProgress(calculateProgressFromPosition(playbackChunkIndex, playbackWordIndex));
    chunkValue.textContent = `${playbackChunkIndex + 1} / ${chunks.length}`;
    persistSavedProgress();
    updateStatus(direction > 0 ? "Moved forward in the document." : "Moved backward in the document.");
  }
}

function keepChunkInView(element, forceCenter = false) {
  if (forceCenter) {
    centerElementInView(element);
    return;
  }

  const containerTop = textViewer.scrollTop;
  const containerBottom = containerTop + textViewer.clientHeight;
  const elementTop = element.offsetTop;
  const elementBottom = elementTop + element.offsetHeight;
  const topPadding = 80;
  const bottomPadding = 120;

  if (elementTop < containerTop + topPadding) {
    textViewer.scrollTop = Math.max(elementTop - topPadding, 0);
    return;
  }

  if (elementBottom > containerBottom - bottomPadding) {
    textViewer.scrollTop = elementBottom - textViewer.clientHeight + bottomPadding;
  }
}

function centerElementInView(element) {
  requestAnimationFrame(() => {
    const containerRect = textViewer.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const delta =
      elementRect.top -
      containerRect.top -
      containerRect.height / 2 +
      elementRect.height / 2;
    animateViewerScrollTo(textViewer.scrollTop + delta);
  });
}

function keepWordInView(element) {
  requestAnimationFrame(() => {
    const containerRect = textViewer.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const preferredTop = containerRect.top + containerRect.height * 0.38;
    const preferredBottom = containerRect.top + containerRect.height * 0.7;
    const wordCenter = elementRect.top + elementRect.height / 2;

    if (wordCenter < preferredTop) {
      animateViewerScrollTo(textViewer.scrollTop - (preferredTop - wordCenter));
      return;
    }

    if (wordCenter > preferredBottom) {
      animateViewerScrollTo(textViewer.scrollTop + (wordCenter - preferredBottom));
    }
  });
}

function animateViewerScrollTo(nextTop) {
  const maxScrollTop = Math.max(textViewer.scrollHeight - textViewer.clientHeight, 0);
  targetViewerScrollTop = Math.max(0, Math.min(nextTop, maxScrollTop));

  if (scrollAnimationFrame) {
    return;
  }

  const step = () => {
    const currentTop = textViewer.scrollTop;
    const delta = targetViewerScrollTop - currentTop;

    if (Math.abs(delta) < 1) {
      textViewer.scrollTop = targetViewerScrollTop;
      scrollAnimationFrame = 0;
      return;
    }

    textViewer.scrollTop = currentTop + delta * 0.12;
    scrollAnimationFrame = requestAnimationFrame(step);
  };

  scrollAnimationFrame = requestAnimationFrame(step);
}

function populateVoices() {
  availableVoices = speechSynthesis.getVoices().slice().sort((left, right) => {
    const leftScore = getVoicePriority(left);
    const rightScore = getVoicePriority(right);
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return left.name.localeCompare(right.name);
  });

  voiceSelect.innerHTML = "";

  if (!availableVoices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Default browser voice";
    voiceSelect.appendChild(option);
    return;
  }

  availableVoices.forEach((voice, index) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = formatVoiceLabel(voice);
    if (voice.name === readerPreferences.voice) {
      option.selected = true;
    } else if (index === 0 && !readerPreferences.voice) {
      option.selected = true;
    }
    voiceSelect.appendChild(option);
  });
}

function getSelectedVoice() {
  if (!availableVoices.length) {
    return null;
  }

  return availableVoices.find((voice) => voice.name === voiceSelect.value) || availableVoices[0];
}

function formatVoiceLabel(voice) {
  const tags = [];
  if (voice.default) {
    tags.push("Default");
  }
  if (looksFemaleVoice(voice)) {
    tags.push("Likely female");
  }

  const suffix = tags.length ? ` (${tags.join(", ")})` : "";
  return `${voice.name} - ${voice.lang}${suffix}`;
}

function getVoicePriority(voice) {
  let score = 0;

  if (/en-/i.test(voice.lang)) {
    score += 5;
  }
  if (voice.default) {
    score += 4;
  }
  if (looksFemaleVoice(voice)) {
    score += 3;
  }
  if (/natural|neural|aria|jenny|zira|sara|sonia|female|woman|girl/i.test(voice.name)) {
    score += 2;
  }

  return score;
}

function looksFemaleVoice(voice) {
  return /aria|jenny|zira|hazel|susan|sara|sonia|ava|emma|olivia|female|woman|girl|catherine|linda|heather|michelle|karen|moira/i.test(
    `${voice.name} ${voice.voiceURI}`
  );
}

function updateTimeEstimates() {
  const wordsPerMinuteAtOneX = 160;
  const rate = Number(speedRange.value) || 1;
  const effectiveWordsPerMinute = wordsPerMinuteAtOneX * rate;
  const totalWords = currentText.trim() ? currentText.trim().split(/\s+/).length : 0;
  const completedWords = getCompletedWordCount();
  const totalMinutes = totalWords / effectiveWordsPerMinute;
  const doneMinutes = completedWords / effectiveWordsPerMinute;
  const leftMinutes = Math.max(totalMinutes - doneMinutes, 0);

  totalTimeValue.textContent = formatMinutes(totalMinutes);
  doneTimeValue.textContent = formatMinutes(doneMinutes);
  leftTimeValue.textContent = formatMinutes(leftMinutes);
}

function getCompletedWordCount() {
  if (!chunks.length) {
    return 0;
  }

  return getAbsoluteWordIndex(playbackChunkIndex, playbackWordIndex);
}

function formatMinutes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0m";
  }

  if (value < 1) {
    return `${Math.max(1, Math.round(value * 60))}s`;
  }

  const rounded = Math.round(value * 10) / 10;
  return `${rounded}m`;
}

function seekToPercent(percent, keepVisible = false) {
  if (!chunks.length) {
    return;
  }

  const clampedPercent = Math.max(0, Math.min(100, percent));
  const totalWords = currentText.trim() ? currentText.trim().split(/\s+/).length : 0;
  if (!totalWords) {
    return;
  }

  const targetWord = Math.round((clampedPercent / 100) * Math.max(totalWords - 1, 0));
  const targetPosition = getPositionFromAbsoluteWord(targetWord);
  playbackChunkIndex = targetPosition.chunkIndex;
  playbackWordIndex = targetPosition.wordIndex;
  lastVisibleChunkIndex = -1;
  highlightChunk(playbackChunkIndex, playbackWordIndex, keepVisible);
  updateProgress(calculateProgressFromPosition(playbackChunkIndex, playbackWordIndex));
  chunkValue.textContent = `${playbackChunkIndex + 1} / ${chunks.length}`;
  persistSavedProgress();

  if (wasReadingBeforeSeek || speechSynthesis.speaking || speechSynthesis.paused || isReading) {
    speechSynthesis.cancel();
    isPaused = false;
    isReading = true;
    speakFromPosition(playbackChunkIndex, playbackWordIndex);
  } else {
    updateStatus("Reading position updated.");
  }

  wasReadingBeforeSeek = false;
}

function previewSeekToPercent(percent) {
  if (!chunks.length) {
    return;
  }

  const clampedPercent = Math.max(0, Math.min(100, percent));
  const totalWords = currentText.trim() ? currentText.trim().split(/\s+/).length : 0;
  if (!totalWords) {
    return;
  }

  const targetWord = Math.round((clampedPercent / 100) * Math.max(totalWords - 1, 0));
  const targetPosition = getPositionFromAbsoluteWord(targetWord);
  playbackChunkIndex = targetPosition.chunkIndex;
  playbackWordIndex = targetPosition.wordIndex;
  lastVisibleChunkIndex = -1;
  highlightChunk(playbackChunkIndex, playbackWordIndex, true);
  updateProgress(calculateProgressFromPosition(playbackChunkIndex, playbackWordIndex));
  chunkValue.textContent = `${playbackChunkIndex + 1} / ${chunks.length}`;
  persistSavedProgress();
  updateStatus("Move the bar, then release to start reading from the highlighted spot.");
}

function getPositionFromAbsoluteWord(targetWord) {
  let remaining = targetWord;

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const wordCount = countWordsInChunk(chunks[chunkIndex]);
    if (remaining < wordCount) {
      return {
        chunkIndex,
        wordIndex: remaining
      };
    }
    remaining -= wordCount;
  }

  return {
    chunkIndex: Math.max(chunks.length - 1, 0),
    wordIndex: Math.max(countWordsInChunk(chunks[Math.max(chunks.length - 1, 0)]) - 1, 0)
  };
}

function calculateProgressFromPosition(chunkIndex, wordIndex) {
  const totalWords = currentText.trim() ? currentText.trim().split(/\s+/).length : 0;
  if (!totalWords) {
    return 0;
  }

  const absoluteWord = getAbsoluteWordIndex(chunkIndex, wordIndex);
  return Math.round((absoluteWord / Math.max(totalWords - 1, 1)) * 100);
}

function applyReaderStyle() {
  const fontMap = {
    space: '"Space Grotesk", sans-serif',
    serif: '"Instrument Serif", serif',
    georgia: "Georgia, serif",
    verdana: "Verdana, sans-serif",
    courier: '"Courier New", monospace'
  };

  textViewer.style.setProperty("--reader-font-size", `${fontSizeRange.value}px`);
  textViewer.style.setProperty("--reader-font-family", fontMap[fontSelect.value] || fontMap.space);
  fontSizeValue.textContent = `${fontSizeRange.value}px`;
}

function normalizeSpeechText(text) {
  return text
    .replace(/^[ \t]*[•][ \t]*/gm, "List item: ")
    .replace(/^[ \t]*[*-][ \t]+/gm, "List item: ")
    .replace(/\be\.\s*g\./gi, "for example")
    .replace(/\bi\.\s*e\./gi, "that is")
    .replace(/\betc\./gi, "etcetera");
}

function transformPastedText(text, mode) {
  if (mode === "summarize") {
    return summarizeText(text);
  }

  if (mode === "explain") {
    return explainText(text);
  }

  return text;
}

function summarizeText(text) {
  const normalized = cleanText(text);
  const sentences = getSentences(normalized);
  if (!sentences.length) {
    return normalized;
  }

  const keywords = getKeywordSet(normalized);
  const scored = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: scoreSentence(sentence, keywords)
  }));

  const selected = scored
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.min(8, Math.max(4, Math.ceil(sentences.length * 0.35))))
    .sort((left, right) => left.index - right.index)
    .map((item) => item.sentence);

  const opening = sentences.slice(0, Math.min(2, sentences.length)).join(" ");
  const themes = [...keywords].slice(0, 6).join(", ");
  const keyPoints = selected.map((sentence) => `- ${sentence}`).join("\n");

  return [
    "Detailed summary:",
    "",
    `Overview: ${opening || selected[0] || normalized}`,
    "",
    themes ? `Main themes: ${themes}.` : "",
    themes ? "" : "",
    "Key points:",
    keyPoints
  ]
    .filter(Boolean)
    .join("\n");
}

function explainText(text) {
  const normalized = cleanText(text);
  const sentences = getSentences(normalized);
  if (!sentences.length) {
    return normalized;
  }

  const summaryBlock = summarizeText(normalized);
  const topSentences = sentences.slice(0, Math.min(6, sentences.length));
  const explanationLines = topSentences.map((sentence, index) => {
    const simplified = simplifySentence(sentence);
    return `${index + 1}. ${simplified}`;
  });

  const ideaLines = buildIdeaBreakdown(sentences);

  return [
    "Detailed explanation:",
    "",
    "What this is saying:",
    explanationLines.join("\n"),
    "",
    "Broken down further:",
    ideaLines.join("\n"),
    "",
    summaryBlock
  ].join("\n");
}

function getSentences(text) {
  return (
    text.match(/[^.!?\n]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) || []
  );
}

function getKeywordSet(text) {
  const stopWords = new Set([
    "the", "and", "for", "that", "with", "this", "from", "have", "into", "about", "there",
    "their", "were", "which", "would", "could", "should", "because", "while", "where", "when",
    "what", "your", "they", "them", "than", "then", "been", "being", "also", "more", "most",
    "some", "such", "many", "much", "very", "will", "just", "into", "over", "under", "between",
    "through", "using", "used", "each", "other", "these", "those", "does", "did", "done", "are",
    "was", "were", "has", "had", "its", "it's", "our", "out", "all", "any", "can"
  ]);

  const frequencies = new Map();
  const words = text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [];
  words.forEach((word) => {
    if (stopWords.has(word)) {
      return;
    }
    frequencies.set(word, (frequencies.get(word) || 0) + 1);
  });

  return new Set(
    [...frequencies.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12)
      .map(([word]) => word)
  );
}

function scoreSentence(sentence, keywords) {
  const words = sentence.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [];
  let score = 0;

  words.forEach((word) => {
    if (keywords.has(word)) {
      score += 2;
    }
  });

  if (sentence.length > 50 && sentence.length < 220) {
    score += 2;
  }

  return score;
}

function simplifySentence(sentence) {
  return sentence
    .replace(/\be\.g\./gi, "for example")
    .replace(/\bi\.e\./gi, "that is")
    .replace(/\bet al\./gi, "and others")
    .replace(/\butilize\b/gi, "use")
    .replace(/\bapproximately\b/gi, "about")
    .replace(/\bdemonstrate\b/gi, "show")
    .replace(/\bindividuals\b/gi, "people")
    .replace(/\bchildren and young people\b/gi, "children")
    .replace(/\bfacilitate\b/gi, "help")
    .replace(/\btherefore\b/gi, "so")
    .replace(/\bhowever\b/gi, "but")
    .replace(/\bin order to\b/gi, "to")
    .replace(/\bmoreover\b/gi, "also")
    .replace(/\bsubsequently\b/gi, "after that")
    .replace(/\bprior to\b/gi, "before")
    .replace(/\bcommence\b/gi, "start");
}

function buildIdeaBreakdown(sentences) {
  const groups = [];
  for (let index = 0; index < sentences.length; index += 2) {
    const pair = sentences.slice(index, index + 2).join(" ");
    if (!pair) {
      continue;
    }
    groups.push(`- ${simplifySentence(pair)}`);
    if (groups.length >= 5) {
      break;
    }
  }

  return groups.length ? groups : ["- No further breakdown available."];
}

function recenterHighlight() {
  if (!chunks.length) {
    updateStatus("Load some text first, then recenter the current highlight.");
    return;
  }

  highlightChunk(playbackChunkIndex, playbackWordIndex, true);
  updateStatus("Highlight recentered.");
}

function loadSavedTexts() {
  try {
    const raw = window.localStorage.getItem(SAVED_TEXTS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Saved text library could not be loaded.", error);
    return [];
  }
}

function persistSavedTexts() {
  window.localStorage.setItem(SAVED_TEXTS_KEY, JSON.stringify(savedTexts));
}

function savePastedText(rawText, customTitle) {
  const normalizedRawText = rawText.trim();
  const plainText = normalizedRawText;
  const title = customTitle || createSavedTitle(plainText);
  const now = new Date().toISOString();

  const savedItem = {
    id: `saved-${Date.now()}`,
    title,
    rawText: normalizedRawText,
    mode: "text",
    updatedAt: now,
    wordCount: plainText.trim() ? plainText.trim().split(/\s+/).length : 0,
    progress: {
      chunkIndex: 0,
      wordIndex: 0
    }
  };

  savedTexts = [savedItem, ...savedTexts];
  persistSavedTexts();
  return savedItem;
}

function renderSavedTexts() {
  if (!savedTexts.length) {
    savedList.innerHTML = '<p class="saved-empty">No saved pasted texts yet.</p>';
    return;
  }

  savedList.innerHTML = "";

  savedTexts.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "saved-item";
    const progressPercent = calculateSavedPercent(item);
    const updatedCopy = formatSavedDate(item.updatedAt);

    wrapper.innerHTML = `
      <div class="saved-item-header">
        <div>
          <p class="saved-item-title">${escapeHtml(item.title)}</p>
          <p class="saved-item-copy">${item.wordCount.toLocaleString()} words • ${escapeHtml(updatedCopy)}</p>
        </div>
      </div>
      <div class="saved-pill">Resume at ${progressPercent}%</div>
      <div class="saved-item-actions">
        <button class="control" type="button" data-action="open" data-id="${item.id}">Open</button>
        <button class="control" type="button" data-action="delete" data-id="${item.id}">Delete</button>
      </div>
    `;

    savedList.appendChild(wrapper);
  });
}

function openSavedText(id) {
  const savedItem = savedTexts.find((item) => item.id === id);
  if (!savedItem) {
    updateStatus("That saved text could not be found.");
    return;
  }

  stopReading();
  pasteInput.value = savedItem.rawText;
  pasteTitleInput.value = savedItem.title;
  setDocumentText(getPlainTextForSavedItem(savedItem), {
    sourceType: "text",
    sourceLabel: savedItem.title,
    savedDocumentId: savedItem.id,
    savedProgress: savedItem.progress
  });
  updateStatus("Saved text reopened at your last reading position.");
}

function deleteSavedText(id) {
  savedTexts = savedTexts.filter((item) => item.id !== id);
  if (currentSavedDocumentId === id) {
    currentSavedDocumentId = "";
  }
  persistSavedTexts();
  renderSavedTexts();
  updateStatus("Saved text deleted.");
}

function persistSavedProgress() {
  if (!currentSavedDocumentId) {
    return;
  }

  const savedItem = savedTexts.find((item) => item.id === currentSavedDocumentId);
  if (!savedItem) {
    return;
  }

  savedItem.progress = {
    chunkIndex: playbackChunkIndex,
    wordIndex: playbackWordIndex
  };
  savedItem.updatedAt = new Date().toISOString();
  savedItem.wordCount = currentText.trim() ? currentText.trim().split(/\s+/).length : 0;
  persistSavedTexts();
  renderSavedTexts();
}

function normalizeSavedProgress(savedProgress, currentChunks) {
  const fallback = { chunkIndex: 0, wordIndex: 0 };
  if (!savedProgress || !currentChunks.length) {
    return fallback;
  }

  const maxChunkIndex = Math.max(currentChunks.length - 1, 0);
  const chunkIndex = Math.min(Math.max(savedProgress.chunkIndex || 0, 0), maxChunkIndex);
  const maxWordIndex = Math.max(countWordsInChunk(currentChunks[chunkIndex]) - 1, 0);
  const wordIndex = Math.min(Math.max(savedProgress.wordIndex || 0, 0), maxWordIndex);

  return {
    chunkIndex,
    wordIndex
  };
}

function calculateSavedPercent(item) {
  const cleaned = cleanText(getPlainTextForSavedItem(item));
  const localChunks = createChunks(cleaned);
  const totalWords = cleaned.trim() ? cleaned.trim().split(/\s+/).length : 0;
  if (!totalWords || !localChunks.length) {
    return 0;
  }

  const progress = normalizeSavedProgress(item.progress, localChunks);
  let completedWords = 0;
  for (let index = 0; index < progress.chunkIndex; index += 1) {
    completedWords += countWordsInChunk(localChunks[index]);
  }
  completedWords += progress.wordIndex;

  return Math.round((completedWords / Math.max(totalWords - 1, 1)) * 100);
}

function getPlainTextForSavedItem(item) {
  return item.rawText;
}

function createSavedTitle(text) {
  const firstLine = text.split("\n").map((line) => line.trim()).find(Boolean) || "";
  return firstLine.slice(0, 48) || "Saved pasted text";
}

function formatSavedDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "saved recently";
  }

  return `saved ${parsed.toLocaleDateString([], {
    month: "short",
    day: "numeric"
  })}`;
}
