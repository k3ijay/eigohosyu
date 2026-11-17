/* app config: week limit, ai model, and evaluation items */
const CONFIG = {
  maxWeek: 20,
  defaultAiModel: "DeepL Write",
  scoreOptions: ["0.0", "0.5", "1.0"],
  scoreLabels: ["低", "中", "高"],
  defaultScoreIndex: 1,
  oddHeadings: {
    first: "１．",
    secondBase: "２．【添削】",
    secondSuffix: "を併用",
    third: "３．【評価】",
  },
  evaluationTableHeader: {
    item: "項目",
    score: "評価　よい=1.0、普通=0.5、悪い=0",
  },
  evaluationItems: [
    "1.与えられたタスクをしっかり理解しているか",
    "2.タスクで求められている要素を網羅しているか",
    "3.パラグラフの目的は明確か",
    "4.パラグラフとパラグラフの関係性およびパラグラフ内の文と文のつながりは論理的で適切か",
    "5.文脈上、適切な語彙が使われているか",
    "6.豊富なボキャブラリーを操っているか",
    "7.多様な文法や構文を適切に使っているか",
    "8.語数は指定された語数を満たしているか",
    "9.文章は読みやすいか",
  ],
};

/* escape html special characters (&, <, >) */
function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/* convert full-width digits to half-width and strip leading 0s and non-digits */
function sanitizeNaturalNumberInput(rawValue) {
  const halfWidth = rawValue.replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  );
  return halfWidth.replace(/[^0-9]/g, "").replace(/^0+/, "");
}

/* return an integer from 1 to max week if valid, otherwise null */
function parseValidWeekNumber(sanitizedValue) {
  if (!sanitizedValue) {
    return null;
  }
  const num = Number(sanitizedValue);
  if (!Number.isInteger(num) || num < 1 || num > CONFIG.maxWeek) {
    return null;
  }
  return num;
}

/* build section 2 heading for odd weeks (omit ai note when null) */
function buildSecondHeading(aiModel = CONFIG.defaultAiModel) {
  if (aiModel === null) {
    return CONFIG.oddHeadings.secondBase;
  }
  return `${CONFIG.oddHeadings.secondBase}（${aiModel}${CONFIG.oddHeadings.secondSuffix}）`;
}

/* convert each non-empty line into a <p> element */
function formatParagraphsToHtml(rawText) {
  const normalized = rawText.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return "";
  }

  return normalized
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("\n");
}

/* build html output for even weeks */
function buildEvenWeekHtml(text) {
  return formatParagraphsToHtml(text);
}

/* build evaluation table html for odd weeks with inline styles */
function buildEvaluationTableHtml(scores) {
  const thStyle =
    "border: 1px solid #000; padding: 0px 10px; font-weight: normal; text-align: left;";
  const tdStyle = "border: 1px solid #000; padding: 0px 10px;";

  const rowsHtml = CONFIG.evaluationItems
    .map((item, index) => {
      const score = CONFIG.scoreOptions.includes(scores[index])
        ? scores[index]
        : "";
      return [
        "    <tr>",
        `      <td style="${tdStyle}">${escapeHtml(item)}</td>`,
        `      <td style="${tdStyle}">${score}</td>`,
        "    </tr>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<table border="1" style="border-collapse: collapse; border: 1px solid #000;">',
    "  <thead>",
    "    <tr>",
    `      <th style="${thStyle}">${escapeHtml(CONFIG.evaluationTableHeader.item)}</th>`,
    `      <th style="${thStyle}">${escapeHtml(CONFIG.evaluationTableHeader.score)}</th>`,
    "    </tr>",
    "  </thead>",
    "  <tbody>",
    rowsHtml,
    "  </tbody>",
    "</table>",
  ].join("\n");
}

/* build full html output for odd weeks */
function buildOddWeekHtml(
  text1,
  text2,
  scores,
  aiModel = CONFIG.defaultAiModel
) {
  const parts = [`<h1>${escapeHtml(CONFIG.oddHeadings.first)}</h1>`];

  const paragraphs1 = formatParagraphsToHtml(text1);
  if (paragraphs1) {
    parts.push(paragraphs1);
  }

  const normalizedAiModel = aiModel ? aiModel : null;
  parts.push(`<h1>${escapeHtml(buildSecondHeading(normalizedAiModel))}</h1>`);

  const paragraphs2 = formatParagraphsToHtml(text2);
  if (paragraphs2) {
    parts.push(paragraphs2);
  }

  parts.push(`<h1>${escapeHtml(CONFIG.oddHeadings.third)}</h1>`);
  parts.push(buildEvaluationTableHtml(scores));

  return parts.join("\n");
}

/* initialize ui state and event listeners */
function initApp() {
  const termSelect = document.getElementById("term-select");
  const weekInput = document.getElementById("week-input");
  const weekTypeBadge = document.getElementById("week-type-badge");
  const weekStatusMessage = document.getElementById("week-status-message");

  const evenWeekSection = document.getElementById("even-week-section");
  const oddWeekSection = document.getElementById("odd-week-section");
  const outputSection = document.getElementById("output-section");

  const evenTextInput = document.getElementById("even-text");
  const oddText1Input = document.getElementById("odd-text-1");
  const oddText2Input = document.getElementById("odd-text-2");
  const oddText2Heading = document.getElementById("odd-text-2-heading");
  const aiToolModeRadios = document.querySelectorAll('input[name="ai-tool-mode"]');
  const customAiInput = document.getElementById("custom-ai-input");
  const evalTableBody = document.getElementById("eval-table-body");

  const htmlOutput = document.getElementById("html-output");
  const htmlPreview = document.getElementById("html-preview");
  const copyButton = document.getElementById("copy-button");
  const resetButton = document.getElementById("reset-button");
  const copyStatus = document.getElementById("copy-status");
  const copyModal = document.getElementById("copy-modal");
  const copyModalClose = document.getElementById("copy-modal-close");

  const state = {
    term: "",
    weekNumber: null,
    aiToolMode: "default",
    scores: Array(CONFIG.evaluationItems.length).fill(
      CONFIG.scoreOptions[CONFIG.defaultScoreIndex]
    ),
  };

  function isEvenWeek(weekNumber) {
    return weekNumber % 2 === 0;
  }

  function getSelectedAiModel() {
    if (state.aiToolMode === "none") {
      return null;
    }
    if (state.aiToolMode === "custom") {
      return customAiInput.value.trim();
    }
    return CONFIG.defaultAiModel;
  }

  function updateSliderLabels(sliderWrap, selectedIndex) {
    const labelSpans = sliderWrap.querySelectorAll(".score-slider-labels span");
    labelSpans.forEach((span, idx) => {
      span.classList.toggle("is-active", idx === selectedIndex);
    });
  }

  function renderEvaluationRows() {
    const fragment = document.createDocumentFragment();

    CONFIG.evaluationItems.forEach((item, index) => {
      const tr = document.createElement("tr");

      const itemTd = document.createElement("td");
      itemTd.textContent = item;

      const scoreTd = document.createElement("td");
      const sliderWrap = document.createElement("div");
      sliderWrap.className = "score-slider-wrap";

      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "score-slider";
      slider.min = "0";
      slider.max = String(CONFIG.scoreOptions.length - 1);
      slider.step = "1";
      slider.value = String(CONFIG.defaultScoreIndex);
      slider.dataset.index = String(index);
      slider.setAttribute("aria-label", `${item}の評価`);

      const labelsRow = document.createElement("div");
      labelsRow.className = "score-slider-labels";
      CONFIG.scoreLabels.forEach((labelText, labelIdx) => {
        const span = document.createElement("span");
        span.textContent = labelText;
        if (labelIdx === CONFIG.defaultScoreIndex) {
          span.classList.add("is-active");
        }
        labelsRow.appendChild(span);
      });

      sliderWrap.append(slider, labelsRow);
      scoreTd.appendChild(sliderWrap);
      tr.append(itemTd, scoreTd);
      fragment.appendChild(tr);
    });

    evalTableBody.appendChild(fragment);
  }

  function setWeekStatus(message, isError = false) {
    weekStatusMessage.textContent = message;
    weekStatusMessage.classList.toggle("is-error", isError);
  }

  function setCopyStatus(message, isError = false) {
    copyStatus.textContent = message;
    copyStatus.classList.toggle("is-error", isError);
  }

  function updateAiToolView() {
    const isCustom = state.aiToolMode === "custom";
    customAiInput.hidden = !isCustom;
    oddText2Heading.textContent = buildSecondHeading(getSelectedAiModel());
  }

  function updateWeekView() {
    if (!state.term) {
      weekInput.disabled = true;
      weekTypeBadge.hidden = true;
      evenWeekSection.hidden = true;
      oddWeekSection.hidden = true;
      outputSection.hidden = true;
      setWeekStatus("まず前期・後期を選択してください。");
      return;
    }

    if (state.term === "first") {
      weekInput.disabled = true;
      weekTypeBadge.hidden = true;
      evenWeekSection.hidden = true;
      oddWeekSection.hidden = true;
      outputSection.hidden = true;
      setWeekStatus("前期は未実装です。");
      return;
    }

    weekInput.disabled = false;

    // second term selected
    const rawSanitized = weekInput.value;
    if (!rawSanitized) {
      weekTypeBadge.hidden = true;
      evenWeekSection.hidden = true;
      oddWeekSection.hidden = true;
      outputSection.hidden = true;
      setWeekStatus(`1〜${CONFIG.maxWeek}の自然数を入力してください。`);
      return;
    }

    if (state.weekNumber === null) {
      weekTypeBadge.hidden = true;
      evenWeekSection.hidden = true;
      oddWeekSection.hidden = true;
      outputSection.hidden = true;
      setWeekStatus(`${CONFIG.maxWeek}以下の自然数を入力してください。`, true);
      return;
    }

    const even = isEvenWeek(state.weekNumber);
    weekTypeBadge.hidden = false;
    weekTypeBadge.textContent = `後期 Week ${state.weekNumber}（${even ? "偶数週" : "奇数週"}）`;
    evenWeekSection.hidden = !even;
    oddWeekSection.hidden = even;
    outputSection.hidden = false;
    setWeekStatus("");
  }

  function updateOutput() {
    if (state.term !== "second" || state.weekNumber === null) {
      htmlOutput.value = "";
      htmlPreview.innerHTML = "";
      return;
    }

    const even = isEvenWeek(state.weekNumber);
    const resultHtml = even
      ? buildEvenWeekHtml(evenTextInput.value)
      : buildOddWeekHtml(
          oddText1Input.value,
          oddText2Input.value,
          state.scores,
          getSelectedAiModel()
        );

    htmlOutput.value = resultHtml;
    htmlPreview.innerHTML = resultHtml;
  }

  function openCopyModal() {
    copyModal.hidden = false;
    copyModalClose.focus();
  }

  function closeCopyModal() {
    copyModal.hidden = true;
    copyButton.focus();
  }

  async function copyOutputToClipboard() {
    const text = htmlOutput.value;
    if (!text) {
      setCopyStatus("コピーするHTMLがありません。");
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      setCopyStatus("HTMLをクリップボードにコピーしました。");
      openCopyModal();
    } catch {
      // fallback when clipboard api is unavailable (e.g. file://)
      htmlOutput.select();
      const copied = document.execCommand("copy");
      if (copied) {
        setCopyStatus("HTMLをクリップボードにコピーしました。");
        openCopyModal();
      } else {
        setCopyStatus(
          "コピーに失敗しました。コードを手動でコピーしてください。",
          true
        );
      }
    }
  }

  function resetCurrentInputs() {
    if (state.weekNumber !== null && isEvenWeek(state.weekNumber)) {
      evenTextInput.value = "";
    } else {
      oddText1Input.value = "";
      oddText2Input.value = "";
      state.aiToolMode = "default";
      customAiInput.value = "";
      aiToolModeRadios.forEach((radio) => {
        radio.checked = radio.value === "default";
      });
      updateAiToolView();

      state.scores.fill(CONFIG.scoreOptions[CONFIG.defaultScoreIndex]);
      evalTableBody
        .querySelectorAll('input[type="range"]')
        .forEach((slider) => {
          slider.value = String(CONFIG.defaultScoreIndex);
          const wrap = slider.closest(".score-slider-wrap");
          if (wrap) {
            updateSliderLabels(wrap, CONFIG.defaultScoreIndex);
          }
        });
    }
    setCopyStatus("");
    updateOutput();
  }

  termSelect.addEventListener("change", () => {
    state.term = termSelect.value;
    setCopyStatus("");
    updateWeekView();
    updateOutput();
    if (state.term === "second" && !weekInput.value) {
      weekInput.focus();
    }
  });

  weekInput.addEventListener("input", () => {
    const sanitized = sanitizeNaturalNumberInput(weekInput.value);
    if (weekInput.value !== sanitized) {
      weekInput.value = sanitized;
    }
    state.weekNumber = parseValidWeekNumber(sanitized);
    setCopyStatus("");
    updateWeekView();
    updateOutput();
  });

  aiToolModeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) {
        return;
      }
      state.aiToolMode = radio.value;
      updateAiToolView();
      updateOutput();
      if (state.aiToolMode === "custom") {
        customAiInput.focus();
      }
    });
  });

  customAiInput.addEventListener("input", () => {
    updateAiToolView();
    updateOutput();
  });

  evenTextInput.addEventListener("input", updateOutput);
  oddText1Input.addEventListener("input", updateOutput);
  oddText2Input.addEventListener("input", updateOutput);

  evalTableBody.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === "range") {
      const index = Number(target.dataset.index);
      const scoreIndex = Number(target.value);
      state.scores[index] = CONFIG.scoreOptions[scoreIndex] ?? "";
      const wrap = target.closest(".score-slider-wrap");
      if (wrap) {
        updateSliderLabels(wrap, scoreIndex);
      }
      updateOutput();
    }
  });

  copyButton.addEventListener("click", copyOutputToClipboard);
  resetButton.addEventListener("click", resetCurrentInputs);
  copyModalClose.addEventListener("click", closeCopyModal);
  copyModal.addEventListener("click", (event) => {
    if (event.target === copyModal) {
      closeCopyModal();
    }
  });

  renderEvaluationRows();
  updateAiToolView();
  updateWeekView();
  updateOutput();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initApp);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CONFIG,
    escapeHtml,
    sanitizeNaturalNumberInput,
    parseValidWeekNumber,
    buildSecondHeading,
    formatParagraphsToHtml,
    buildEvenWeekHtml,
    buildEvaluationTableHtml,
    buildOddWeekHtml,
  };
}
