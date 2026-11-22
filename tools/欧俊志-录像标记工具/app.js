(() => {
  "use strict";

  const elements = {
    video: document.querySelector("#video"),
    videoCard: document.querySelector("#videoCard"),
    videoStage: document.querySelector("#videoStage"),
    emptyState: document.querySelector("#emptyState"),
    dropOverlay: document.querySelector("#dropOverlay"),
    fileInput: document.querySelector("#fileInput"),
    openVideoButton: document.querySelector("#openVideoButton"),
    emptyOpenButton: document.querySelector("#emptyOpenButton"),
    videoMeta: document.querySelector("#videoMeta"),
    fileName: document.querySelector("#fileName"),
    playButton: document.querySelector("#playButton"),
    stagePlayButton: document.querySelector("#stagePlayButton"),
    muteButton: document.querySelector("#muteButton"),
    timeline: document.querySelector("#timeline"),
    currentTime: document.querySelector("#currentTime"),
    duration: document.querySelector("#duration"),
    composerTime: document.querySelector("#composerTime"),
    noteInput: document.querySelector("#noteInput"),
    charCount: document.querySelector("#charCount"),
    saveNoteButton: document.querySelector("#saveNoteButton"),
    noteCount: document.querySelector("#noteCount"),
    notesEmpty: document.querySelector("#notesEmpty"),
    notesList: document.querySelector("#notesList"),
    saveStatus: document.querySelector("#saveStatus"),
    toast: document.querySelector("#toast"),
    toastText: document.querySelector("#toastText"),
  };

  const state = {
    objectUrl: null,
    storageKey: null,
    notes: [],
    activeNoteId: null,
    wasPlayingBeforeScrub: false,
    toastTimer: null,
  };

  const pad = (value, size = 2) => String(value).padStart(size, "0");

  function formatTime(seconds, includeMilliseconds = true) {
    const safeValue = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const totalHundredths = Math.round(safeValue * 100);
    const minutes = Math.floor(totalHundredths / 6000);
    const remainingSeconds = Math.floor(totalHundredths / 100) % 60;
    const hundredths = totalHundredths % 100;
    const base = `${pad(minutes)}:${pad(remainingSeconds)}`;
    return includeMilliseconds ? `${base}.${pad(hundredths)}` : base;
  }

  function fileSignature(file) {
    return `${file.name}|${file.size}|${file.lastModified || 0}`;
  }

  function storageKeyFor(signature) {
    return `roadnote:marks:${signature}`;
  }

  function safelyReadNotes(storageKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (!Array.isArray(saved)) {
        return [];
      }
      return saved
        .filter(
          (note) =>
            note &&
            typeof note.id === "string" &&
            typeof note.text === "string" &&
            Number.isFinite(note.time)
        )
        .map((note) => ({
          id: note.id,
          text: note.text.slice(0, 120),
          time: Math.max(0, note.time),
          createdAt: Number(note.createdAt) || Date.now(),
        }));
    } catch {
      return [];
    }
  }

  function persistNotes() {
    if (!state.storageKey) {
      return;
    }
    try {
      localStorage.setItem(state.storageKey, JSON.stringify(state.notes));
      elements.saveStatus.innerHTML =
        '<span class="save-status__dot"></span>已自动保存';
    } catch {
      elements.saveStatus.textContent = "浏览器存储不可用";
    }
  }

  function showToast(message) {
    elements.toastText.textContent = message;
    elements.toast.classList.add("is-visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 1900);
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function updatePlayState() {
    const isPlaying = !elements.video.paused && Boolean(elements.video.src);
    elements.videoCard.classList.toggle("is-playing", isPlaying);
    elements.stagePlayButton.classList.toggle("paused", !isPlaying);
    elements.playButton.setAttribute("aria-label", isPlaying ? "暂停" : "播放");
    elements.stagePlayButton.setAttribute("aria-label", isPlaying ? "暂停" : "播放");
  }

  function updateMuteState() {
    const isMuted = elements.video.muted;
    elements.videoCard.classList.toggle("is-muted", isMuted);
    elements.muteButton.setAttribute("aria-label", isMuted ? "取消静音" : "静音");
  }

  function updateTime() {
    const current = elements.video.currentTime || 0;
    const duration = elements.video.duration || 0;
    const progress = duration > 0 ? (current / duration) * 100 : 0;
    elements.currentTime.textContent = formatTime(current);
    elements.composerTime.textContent = formatTime(current);
    elements.timeline.value = String(current);
    elements.timeline.style.setProperty("--timeline-progress", `${progress}%`);
  }

  function togglePlayback() {
    if (!elements.video.src) {
      return;
    }
    if (elements.video.paused) {
      elements.activeNoteId = null;
      renderNotes();
      elements.video.play().catch(() => {
        showToast("浏览器阻止了自动播放，请再次点击播放");
      });
    } else {
      elements.video.pause();
    }
  }

  function sortedNotes() {
    return [...state.notes].sort((a, b) => a.time - b.time);
  }

  function renderNotes() {
    const notes = sortedNotes();
    elements.noteCount.textContent = String(notes.length);
    elements.notesEmpty.hidden = notes.length > 0;
    elements.notesList.replaceChildren();

    for (const note of notes) {
      const item = document.createElement("li");
      item.className = "note-item";
      item.classList.toggle("is-active", note.id === state.activeNoteId);
      item.dataset.noteId = note.id;

      const jumpButton = document.createElement("button");
      jumpButton.className = "note-jump";
      jumpButton.type = "button";
      jumpButton.textContent = formatTime(note.time);
      jumpButton.title = `跳回 ${formatTime(note.time)}`;
      jumpButton.setAttribute("aria-label", `跳回 ${formatTime(note.time)}`);
      jumpButton.addEventListener("click", () => jumpToNote(note));

      const contentButton = document.createElement("button");
      contentButton.className = "note-content";
      contentButton.type = "button";
      const content = document.createElement("span");
      content.textContent = note.text;
      content.title = note.text;
      contentButton.append(content);
      contentButton.addEventListener("click", () => jumpToNote(note));

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-note";
      deleteButton.type = "button";
      deleteButton.title = "删除这条备注";
      deleteButton.setAttribute("aria-label", `删除 ${formatTime(note.time)} 的备注`);
      deleteButton.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg>';
      deleteButton.addEventListener("click", () => deleteNote(note.id));

      item.append(jumpButton, contentButton, deleteButton);
      elements.notesList.append(item);
    }
  }

  function jumpToNote(note) {
    elements.video.pause();
    elements.video.currentTime = Math.min(note.time, elements.video.duration || note.time);
    state.activeNoteId = note.id;
    updateTime();
    renderNotes();
    elements.videoStage.animate(
      [
        { boxShadow: "inset 0 0 0 0 rgba(242,202,82,0)" },
        { boxShadow: "inset 0 0 0 5px rgba(242,202,82,.75)" },
        { boxShadow: "inset 0 0 0 0 rgba(242,202,82,0)" },
      ],
      { duration: 540, easing: "ease-out" }
    );
    showToast(`已回到 ${formatTime(note.time)}`);
  }

  function deleteNote(noteId) {
    const deleted = state.notes.find((note) => note.id === noteId);
    state.notes = state.notes.filter((note) => note.id !== noteId);
    if (state.activeNoteId === noteId) {
      state.activeNoteId = null;
    }
    persistNotes();
    renderNotes();
    if (deleted) {
      showToast(`已删除 ${formatTime(deleted.time)} 的标记`);
    }
  }

  function saveNote() {
    if (!elements.video.src) {
      return;
    }
    const text = elements.noteInput.value.trim();
    if (!text) {
      elements.noteInput.focus();
      elements.noteInput.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-4px)" },
          { transform: "translateX(4px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 220 }
      );
      showToast("请先写下画面里要留意的内容");
      return;
    }

    elements.video.pause();
    const note = {
      id: createId(),
      text,
      time: Math.max(0, elements.video.currentTime || 0),
      createdAt: Date.now(),
    };

    state.notes.push(note);
    state.activeNoteId = note.id;
    elements.noteInput.value = "";
    elements.charCount.textContent = "0";
    persistNotes();
    renderNotes();
    updateComposerState();
    showToast(`已保存 ${formatTime(note.time)} 的画面标记`);
  }

  function updateComposerState() {
    const hasVideo = Boolean(elements.video.src);
    elements.noteInput.disabled = !hasVideo;
    elements.saveNoteButton.disabled = !hasVideo;
  }

  function loadVideoFile(file) {
    if (!file) {
      return;
    }
    const looksLikeVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name);
    if (!looksLikeVideo) {
      showToast("请选择 MP4、WebM 等视频文件");
      return;
    }

    elements.video.pause();
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
    }

    state.objectUrl = URL.createObjectURL(file);
    state.storageKey = storageKeyFor(fileSignature(file));
    state.notes = safelyReadNotes(state.storageKey);
    state.activeNoteId = null;
    elements.video.src = state.objectUrl;
    elements.video.load();
    elements.fileName.textContent = file.name;
    elements.videoMeta.hidden = false;
    elements.videoCard.classList.add("video-active");
    elements.stagePlayButton.hidden = false;
    [
      elements.playButton,
      elements.muteButton,
      elements.timeline,
    ].forEach((control) => {
      control.disabled = false;
    });
    updateComposerState();
    renderNotes();
    elements.saveStatus.innerHTML =
      '<span class="save-status__dot"></span>已载入录像';
    showToast("录像已载入，可开始添加备注");
  }

  function openFilePicker() {
    elements.fileInput.click();
  }

  elements.openVideoButton.addEventListener("click", openFilePicker);
  elements.emptyOpenButton.addEventListener("click", openFilePicker);
  elements.fileInput.addEventListener("change", (event) => {
    loadVideoFile(event.target.files && event.target.files[0]);
    event.target.value = "";
  });

  elements.video.addEventListener("loadedmetadata", () => {
    elements.duration.textContent = formatTime(elements.video.duration);
    elements.timeline.max = String(elements.video.duration || 0);
    updateTime();
    updatePlayState();
  });

  elements.video.addEventListener("error", () => {
    showToast("这个视频无法播放，请尝试 MP4 格式");
  });

  elements.video.addEventListener("timeupdate", updateTime);
  elements.video.addEventListener("play", updatePlayState);
  elements.video.addEventListener("pause", updatePlayState);
  elements.video.addEventListener("volumechange", updateMuteState);
  elements.video.addEventListener("click", togglePlayback);
  elements.playButton.addEventListener("click", togglePlayback);
  elements.stagePlayButton.addEventListener("click", togglePlayback);

  elements.muteButton.addEventListener("click", () => {
    elements.video.muted = !elements.video.muted;
  });

  elements.timeline.addEventListener("pointerdown", () => {
    state.wasPlayingBeforeScrub = !elements.video.paused;
  });

  elements.timeline.addEventListener("input", () => {
    elements.video.currentTime = Number(elements.timeline.value);
    state.activeNoteId = null;
    updateTime();
  });

  elements.timeline.addEventListener("change", () => {
    if (state.wasPlayingBeforeScrub) {
      elements.video.play().catch(() => {});
    }
    state.wasPlayingBeforeScrub = false;
    renderNotes();
  });

  elements.noteInput.addEventListener("input", () => {
    elements.charCount.textContent = String(elements.noteInput.value.length);
  });

  elements.noteInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      saveNote();
    }
  });

  elements.saveNoteButton.addEventListener("click", saveNote);

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable;
    if (event.code === "Space" && !isTyping && elements.video.src) {
      event.preventDefault();
      togglePlayback();
    }
  });

  let dragDepth = 0;
  elements.videoCard.addEventListener("dragenter", (event) => {
    if (!Array.from(event.dataTransfer.types || []).includes("Files")) {
      return;
    }
    event.preventDefault();
    dragDepth += 1;
    elements.videoCard.classList.add("dragging");
  });

  elements.videoCard.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });

  elements.videoCard.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      elements.videoCard.classList.remove("dragging");
    }
  });

  elements.videoCard.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    elements.videoCard.classList.remove("dragging");
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    loadVideoFile(file);
  });

  window.addEventListener("beforeunload", () => {
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
    }
  });

  updateComposerState();
  updatePlayState();
  updateMuteState();
  renderNotes();
})();
