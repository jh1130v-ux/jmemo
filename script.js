const STORAGE_KEY = "jmemo-topics";
const EMOJIS = ["📘", "🍱", "🧁", "🎬", "✈️", "🐶", "🌼", "🎵", "🍓", "🧸", "☁️", "🍕", "📚", "🎨", "🌙"];

const elements = {
  topicForm: document.querySelector("#topic-form"),
  topicName: document.querySelector("#topic-name"),
  topicType: document.querySelector("#topic-type"),
  emojiField: document.querySelector("#emoji-field"),
  emojiPicker: document.querySelector("#emoji-picker"),
  topicsList: document.querySelector("#topics-list"),
  studyTopic: document.querySelector("#study-topic"),
  studyMode: document.querySelector("#study-mode"),
  studyCard: document.querySelector("#study-card"),
  startStudy: document.querySelector("#start-study"),
  singleTemplate: document.querySelector("#single-item-form-template"),
  doubleTemplate: document.querySelector("#double-item-form-template"),
};

let topics = loadTopics();
let studyState = {
  topicId: "",
  mode: "allow",
  queue: [],
  currentItemId: "",
  checked: false,
  feedback: null,
};
let selectedEmoji = EMOJIS[0];
const expandedTopicIds = new Set();

bootstrap();

function bootstrap() {
  renderEmojiPicker();
  bindEvents();
  toggleEmojiField();
  renderAll();
}

function bindEvents() {
  elements.topicForm.addEventListener("submit", handleTopicCreate);
  elements.topicType.addEventListener("change", toggleEmojiField);
  elements.startStudy.addEventListener("click", startStudySession);
  elements.topicsList.addEventListener("submit", handleItemCreate);
  elements.topicsList.addEventListener("click", handleListClick);
  elements.topicsList.addEventListener("input", clearFieldValidity);
  elements.studyCard.addEventListener("submit", handleAnswerSubmit);
  elements.studyCard.addEventListener("click", handleStudyCardClick);
}

function renderEmojiPicker() {
  elements.emojiPicker.innerHTML = EMOJIS.map(
    (emoji) =>
      `<button class="emoji-chip" type="button" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`
  ).join("");

  elements.emojiPicker.addEventListener("click", (event) => {
    const button = event.target.closest("[data-emoji]");

    if (!button) {
      return;
    }

    selectedEmoji = button.dataset.emoji;
    syncEmojiSelection();
  });

  syncEmojiSelection();
}

function toggleEmojiField() {
  elements.emojiField.hidden = false;
  syncEmojiSelection();
}

function handleTopicCreate(event) {
  event.preventDefault();

  const name = elements.topicName.value.trim();
  const type = elements.topicType.value;
  const emoji = selectedEmoji || EMOJIS[0];

  if (!name) {
    return;
  }

  topics.push({
    id: crypto.randomUUID(),
    name,
    type,
    emoji,
    items: [],
  });

  persistTopics();
  elements.topicForm.reset();
  elements.topicType.value = "single";
  selectedEmoji = EMOJIS[0];
  toggleEmojiField();
  renderAll();
}

function syncEmojiSelection() {
  const buttons = elements.emojiPicker.querySelectorAll(".emoji-chip");

  buttons.forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.emoji === selectedEmoji);
  });
}

function handleItemCreate(event) {
  const form = event.target.closest(".item-form");

  if (!form) {
    return;
  }

  event.preventDefault();

  const topic = topics.find((entry) => entry.id === form.dataset.topicId);

  if (!topic) {
    return;
  }

  if (topic.type === "single") {
    const input = form.elements.word;
    const value = input.value.trim();

    if (!value) {
      return;
    }

    if (topic.items.some((item) => normalizeText(item.value) === normalizeText(value))) {
      input.setCustomValidity("이미 등록된 단어예요.");
      input.reportValidity();
      return;
    }

    topic.items.unshift({
      id: crypto.randomUUID(),
      value,
    });
  } else {
    const frontInput = form.elements.front;
    const backInput = form.elements.back;
    const front = frontInput.value.trim();
    const back = form.elements.back.value.trim();

    if (!front || !back) {
      return;
    }

    if (topic.items.some((item) => normalizeText(item.front) === normalizeText(front))) {
      frontInput.setCustomValidity("이미 등록된 A 값이에요.");
      frontInput.reportValidity();
      return;
    }

    if (
      topic.items.some(
        (item) =>
          normalizeText(item.front) === normalizeText(front) &&
          normalizeText(item.back) === normalizeText(back)
      )
    ) {
      backInput.setCustomValidity("이미 등록된 세트예요.");
      backInput.reportValidity();
      return;
    }

    topic.items.unshift({
      id: crypto.randomUUID(),
      front,
      back,
    });
  }

  persistTopics();
  form.reset();
  syncStudyAfterTopicChange(topic.id);
  renderAll();
}

function handleListClick(event) {
  const toggleTopicButton = event.target.closest("[data-toggle-topic]");
  const deleteTopicButton = event.target.closest("[data-delete-topic]");
  const deleteItemButton = event.target.closest("[data-delete-item]");

  if (toggleTopicButton) {
    const topicId = toggleTopicButton.dataset.toggleTopic;

    if (expandedTopicIds.has(topicId)) {
      expandedTopicIds.delete(topicId);
    } else {
      expandedTopicIds.add(topicId);
    }

    renderTopics();
    return;
  }

  if (deleteTopicButton) {
    const topicId = deleteTopicButton.dataset.deleteTopic;
    topics = topics.filter((topic) => topic.id !== topicId);
    expandedTopicIds.delete(topicId);

    if (studyState.topicId === topicId) {
      resetStudyState();
    }

    persistTopics();
    renderAll();
    return;
  }

  if (deleteItemButton) {
    const topicId = deleteItemButton.dataset.topicId;
    const itemId = deleteItemButton.dataset.deleteItem;
    const topic = topics.find((entry) => entry.id === topicId);

    if (!topic) {
      return;
    }

    topic.items = topic.items.filter((item) => item.id !== itemId);
    persistTopics();
    syncStudyAfterTopicChange(topic.id);
    renderAll();
  }
}

function startStudySession() {
  const topicId = elements.studyTopic.value;
  const topic = topics.find((entry) => entry.id === topicId);

  if (!topic || topic.items.length === 0) {
    renderStudyEmpty("단어가 있는 주제를 선택해 주세요.");
    return;
  }

  studyState = {
    topicId,
    mode: elements.studyMode.value,
    queue: elements.studyMode.value === "unique" ? shuffle(topic.items.map((item) => item.id)) : [],
    currentItemId: "",
    checked: false,
    feedback: null,
  };

  selectNextQuestion();
}

function handleStudyCardClick(event) {
  const nextButton = event.target.closest("[data-action='next']");
  const restartButton = event.target.closest("[data-action='restart']");

  if (nextButton) {
    selectNextQuestion();
  }

  if (restartButton) {
    startStudySession();
  }
}

function handleAnswerSubmit(event) {
  const form = event.target.closest(".answer-form");

  if (!form) {
    return;
  }

  event.preventDefault();

  const topic = topics.find((entry) => entry.id === studyState.topicId);
  const item = topic?.items.find((entry) => entry.id === studyState.currentItemId);

  if (!topic || !item || topic.type !== "double") {
    return;
  }

  const userAnswer = form.elements.answer.value.trim();
  const isCorrect = normalizeText(userAnswer) === normalizeText(item.back);

  studyState.checked = true;
  studyState.feedback = {
    isCorrect,
    userAnswer,
    correctAnswer: item.back,
  };

  renderStudyCard();
}

function selectNextQuestion() {
  const topic = topics.find((entry) => entry.id === studyState.topicId);

  if (!topic || topic.items.length === 0) {
    renderStudyEmpty("단어가 남아 있지 않아요. 주제를 다시 확인해 주세요.");
    return;
  }

  let nextId = "";

  if (studyState.mode === "allow") {
    const randomItem = topic.items[Math.floor(Math.random() * topic.items.length)];
    nextId = randomItem.id;
  } else {
    if (studyState.queue.length === 0) {
      renderStudyComplete(topic);
      return;
    }

    nextId = studyState.queue.shift();
  }

  studyState.currentItemId = nextId;
  studyState.checked = false;
  studyState.feedback = null;
  renderStudyCard();
}

function renderAll() {
  renderTopicOptions();
  renderTopics();
  renderStudyCard();
}

function renderTopicOptions() {
  if (topics.length === 0) {
    elements.studyTopic.innerHTML = `<option value="">주제를 먼저 만들어 주세요</option>`;
    elements.studyTopic.disabled = true;
    return;
  }

  elements.studyTopic.disabled = false;

  if (!topics.some((topic) => topic.id === studyState.topicId)) {
    studyState.topicId = topics[0].id;
  }

  elements.studyTopic.innerHTML = topics
    .map(
      (topic) =>
        `<option value="${topic.id}" ${topic.id === studyState.topicId ? "selected" : ""}>
          ${topic.emoji} ${topic.name} (${topic.type === "single" ? "단면" : "양면"})
        </option>`
    )
    .join("");
}

function renderTopics() {
  if (topics.length === 0) {
    elements.topicsList.innerHTML = `
      <div class="empty-state">
        아직 만든 주제가 없어요. 위에서 첫 번째 메모장을 만들어보세요.
      </div>
    `;
    return;
  }

  elements.topicsList.innerHTML = topics.map(renderTopicCard).join("");
}

function renderTopicCard(topic) {
  const isExpanded = expandedTopicIds.has(topic.id);
  const formMarkup =
    topic.type === "single"
      ? elements.singleTemplate.innerHTML.replace("<form", `<form data-topic-id="${topic.id}"`)
      : elements.doubleTemplate.innerHTML.replace("<form", `<form data-topic-id="${topic.id}"`);

  const itemsMarkup =
    topic.items.length > 0
      ? topic.items.map((item) => renderItemRow(topic, item)).join("")
      : `<div class="empty-state">아직 등록된 ${topic.type === "single" ? "단어" : "세트"}가 없어요.</div>`;

  return `
    <article class="topic-card">
      <div class="topic-card__header">
        <div class="topic-card__title">
          <div class="topic-card__emoji">${topic.emoji}</div>
          <div>
            <h3>${escapeHtml(topic.name)}</h3>
            <p>${topic.type === "single" ? "단면 단어장" : "양면 단어장"} · ${topic.items.length}개</p>
          </div>
        </div>
        <div class="topic-card__actions">
          <button class="button button--secondary button--toggle" type="button" data-toggle-topic="${topic.id}">
            ${isExpanded ? "접기" : "펼치기"}
          </button>
          <button class="button button--ghost" type="button" data-delete-topic="${topic.id}">
            주제 삭제
          </button>
        </div>
      </div>
      <div class="topic-card__body" ${isExpanded ? "" : "hidden"}>
        <div class="helper-text">
          ${
            topic.type === "single"
              ? "단면은 한 개의 단어만 저장돼요. 랜덤 제시 시 단어가 그대로 보여요."
              : "양면은 A와 B 세트로 저장돼요. 랜덤 제시 시 A가 나오고 B를 맞혀야 해요."
          }
        </div>
        ${formMarkup}
        <div class="item-list">${itemsMarkup}</div>
      </div>
    </article>
  `;
}

function renderItemRow(topic, item) {
  const content =
    topic.type === "single"
      ? `<strong>${escapeHtml(item.value)}</strong>`
      : `<strong>${escapeHtml(item.front)}</strong><span>${escapeHtml(item.back)}</span>`;

  return `
    <div class="item-row">
      <div>${content}</div>
      <button
        class="button button--ghost"
        type="button"
        data-topic-id="${topic.id}"
        data-delete-item="${item.id}"
      >
        삭제
      </button>
    </div>
  `;
}

function renderStudyCard() {
  const topic = topics.find((entry) => entry.id === studyState.topicId);

  if (!topic) {
    renderStudyEmpty("주제를 먼저 만들어 주세요.");
    return;
  }

  if (!studyState.currentItemId) {
    renderStudyEmpty("랜덤 시작 버튼을 눌러 문제를 꺼내보세요.");
    return;
  }

  const item = topic.items.find((entry) => entry.id === studyState.currentItemId);

  if (!item) {
    renderStudyEmpty("현재 문제를 불러오지 못했어요. 다시 시작해 주세요.");
    return;
  }

  if (topic.type === "single") {
    elements.studyCard.className = "study-card";
    elements.studyCard.innerHTML = `
      <div class="study-box">
        <div class="study-meta">
          <div class="pill">${topic.emoji} ${escapeHtml(topic.name)}</div>
          <div class="pill">${studyState.mode === "allow" ? "중복 허용" : "중복 제거"}</div>
          <div class="pill">단면</div>
        </div>
        <div class="question-card">
          <p class="question-label">이번에 나온 단어</p>
          <h3 class="question-value">${escapeHtml(item.value)}</h3>
        </div>
        <div class="study-actions">
          <button class="button button--primary" type="button" data-action="next">다음 단어</button>
          <button class="button button--secondary" type="button" data-action="restart">처음부터 다시</button>
        </div>
      </div>
    `;
    return;
  }

  const feedbackMarkup = studyState.feedback
    ? `
      <div class="answer-result ${studyState.feedback.isCorrect ? "answer-result--correct" : "answer-result--wrong"}">
        ${
          studyState.feedback.isCorrect
            ? `정답이에요! 입력한 값: ${escapeHtml(studyState.feedback.userAnswer || "(빈칸)")}`
            : `아쉬워요. 입력한 값: ${escapeHtml(studyState.feedback.userAnswer || "(빈칸)")} / 정답: ${escapeHtml(studyState.feedback.correctAnswer)}`
        }
      </div>
    `
    : "";

  elements.studyCard.className = "study-card";
  elements.studyCard.innerHTML = `
    <div class="study-box">
      <div class="study-meta">
        <div class="pill">${topic.emoji} ${escapeHtml(topic.name)}</div>
        <div class="pill">${studyState.mode === "allow" ? "중복 허용" : "중복 제거"}</div>
        <div class="pill">양면</div>
      </div>
      <div class="question-card">
        <p class="question-label">제시어 A</p>
        <h3 class="question-value">${escapeHtml(item.front)}</h3>
      </div>
      <form class="answer-form">
        <label class="field">
          <span>B를 입력해보세요</span>
          <input
            name="answer"
            type="text"
            placeholder="정답을 입력해 주세요"
            ${studyState.checked ? `value="${escapeAttribute(studyState.feedback?.userAnswer || "")}"` : ""}
            required
          />
        </label>
        <div class="study-actions">
          <button class="button button--primary" type="submit">정답 확인</button>
          <button class="button button--secondary" type="button" data-action="next">다음 문제</button>
          <button class="button button--ghost" type="button" data-action="restart">처음부터 다시</button>
        </div>
      </form>
      ${feedbackMarkup}
    </div>
  `;
}

function renderStudyEmpty(message) {
  elements.studyCard.className = "study-card study-card--empty";
  elements.studyCard.innerHTML = `<p class="study-empty">${escapeHtml(message)}</p>`;
}

function renderStudyComplete(topic) {
  elements.studyCard.className = "study-card";
  elements.studyCard.innerHTML = `
    <div class="study-box">
      <div class="question-card">
        <p class="question-label">중복 제거 학습 완료</p>
        <h3 class="question-value">${escapeHtml(topic.name)}의 모든 항목을 다 봤어요!</h3>
      </div>
      <div class="study-actions">
        <button class="button button--primary" type="button" data-action="restart">다시 섞어서 시작</button>
      </div>
    </div>
  `;
  studyState.currentItemId = "";
}

function syncStudyAfterTopicChange(topicId) {
  if (studyState.topicId !== topicId) {
    return;
  }

  const topic = topics.find((entry) => entry.id === topicId);

  if (!topic || topic.items.length === 0) {
    resetStudyState();
    return;
  }

  studyState.queue = studyState.queue.filter((itemId) => topic.items.some((item) => item.id === itemId));

  if (!topic.items.some((item) => item.id === studyState.currentItemId)) {
    studyState.currentItemId = "";
    studyState.feedback = null;
    studyState.checked = false;
  }
}

function resetStudyState() {
  studyState = {
    topicId: topics[0]?.id || "",
    mode: elements.studyMode.value,
    queue: [],
    currentItemId: "",
    checked: false,
    feedback: null,
  };
}

function loadTopics() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to read saved topics", error);
    return [];
  }
}

function persistTopics() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(topics));
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function shuffle(list) {
  const cloned = [...list];

  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[randomIndex]] = [cloned[randomIndex], cloned[index]];
  }

  return cloned;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function clearFieldValidity(event) {
  const target = event.target;

  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  target.setCustomValidity("");
}
