// Paste your deployed Google Apps Script Web App URL here to send responses to Google Sheets.
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyE4EsJLCVPxeCksCguZ5xvYqKsaZA3f9nuxO1h0GdGDvYyPsRqQO8fb_JGbYFimj5K/exec";
const GOOGLE_SHEET_URL = "";
const APP_VERSION = "v4";
const SUBMISSIONS_STORAGE_KEY = "sports-attendance-submissions";

const dates = [
  { id: "2026-06-15", label: "6/15(一)", week: "第一週" },
  { id: "2026-06-16", label: "6/16(二)", week: "第一週" },
  { id: "2026-06-17", label: "6/17(三)", week: "第一週" },
  { id: "2026-06-18", label: "6/18(四)", week: "第一週" },
  { id: "2026-06-22", label: "6/22(一)", week: "第二週" },
  { id: "2026-06-23", label: "6/23(二)", week: "第二週" },
  { id: "2026-06-24", label: "6/24(三)", week: "第二週" },
  { id: "2026-06-25", label: "6/25(四)", week: "第二週" },
  { id: "2026-06-26", label: "6/26(五)", week: "第二週" },
  { id: "2026-06-29", label: "6/29(一)", week: "第三週" },
  { id: "2026-06-30", label: "6/30(二)", week: "第三週" }
];

const form = document.querySelector("#attendanceForm");
const studentName = document.querySelector("#studentName");
const dateList = document.querySelector("#dateList");
const presentDates = document.querySelector("#presentDates");
const absentDates = document.querySelector("#absentDates");
const presentCount = document.querySelector("#presentCount");
const absentCount = document.querySelector("#absentCount");
const totalCount = document.querySelector("#totalCount");
const classTotal = document.querySelector("#classTotal");
const formMessage = document.querySelector("#formMessage");
const submitButton = document.querySelector(".submit-button");
let isReviewingSavedRecord = false;
let lookupRequestId = 0;

function renderDates() {
  dateList.innerHTML = dates.map((date) => `
    <article class="date-card" data-date-id="${date.id}">
      <div class="date-label">
        <strong>${date.label}</strong>
        <span>${date.week}</span>
      </div>
      <div class="choice-group" role="radiogroup" aria-label="${date.label}">
        <label>
          <input type="radio" name="${date.id}" value="present">
          <span class="choice-pill">出席</span>
        </label>
        <label>
          <input type="radio" name="${date.id}" value="absent">
          <span class="choice-pill">未出席</span>
        </label>
      </div>
    </article>
  `).join("");
}

function getSelections() {
  return dates.map((date) => {
    const selected = form.querySelector(`input[name="${date.id}"]:checked`);

    return {
      ...date,
      status: selected ? selected.value : ""
    };
  });
}

function updateSubmitState(filled) {
  if (isReviewingSavedRecord) {
    submitButton.disabled = false;
    submitButton.dataset.ready = "review";
    submitButton.classList.remove("is-incomplete");
    submitButton.textContent = "再次修改";
    return;
  }

  submitButton.disabled = false;
  submitButton.dataset.ready = filled === dates.length ? "true" : "false";
  submitButton.classList.toggle("is-incomplete", filled !== dates.length);
  submitButton.textContent = filled === dates.length
    ? "送出調查"
    : `尚有 ${dates.length - filled} 天未填`;
}

function updateSummary() {
  const selections = getSelections();
  const present = selections.filter((date) => date.status === "present");
  const absent = selections.filter((date) => date.status === "absent");
  const filled = present.length + absent.length;

  presentDates.textContent = present.length ? present.map((date) => date.label).join("、") : "尚未選擇";
  absentDates.textContent = absent.length ? absent.map((date) => date.label).join("、") : "尚未選擇";
  presentCount.textContent = present.length;
  absentCount.textContent = absent.length;
  totalCount.textContent = filled;
  classTotal.textContent = present.length;
  updateSubmitState(filled);

  return { selections, present, absent, filled };
}

function setMessage(text, type = "") {
  formMessage.textContent = text;
  formMessage.className = `form-message ${type}`.trim();
}

function clearMissingHighlights() {
  dateList.querySelectorAll(".date-card.is-missing").forEach((card) => {
    card.classList.remove("is-missing");
  });
}

function jumpToMissingDate(date) {
  clearMissingHighlights();

  const card = dateList.querySelector(`[data-date-id="${date.id}"]`);
  if (!card) {
    return;
  }

  card.classList.add("is-missing");
  card.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  const firstChoice = card.querySelector("input");
  if (firstChoice) {
    setTimeout(() => firstChoice.focus({ preventScroll: true }), 350);
  }
}

function buildPayload() {
  const summary = updateSummary();

  return {
    action: "upsert",
    submittedAt: new Date().toISOString(),
    studentName: studentName.value,
    presentDates: summary.present.map((date) => date.label),
    absentDates: summary.absent.map((date) => date.label),
    classTotal: summary.present.length,
    filledTotal: summary.filled,
    records: summary.selections.map((date) => ({
      date: date.label,
      dateId: date.id,
      status: date.status
    }))
  };
}

function loadSavedSubmissions() {
  try {
    const saved = JSON.parse(localStorage.getItem(SUBMISSIONS_STORAGE_KEY) || "{}");

    if (Array.isArray(saved)) {
      return saved.reduce((records, record) => {
        if (record && record.studentName) {
          records[record.studentName] = record;
        }

        return records;
      }, {});
    }

    return saved && typeof saved === "object" ? saved : {};
  } catch (error) {
    return {};
  }
}

function getSavedSubmission(name) {
  if (!name) {
    return null;
  }

  return loadSavedSubmissions()[name] || null;
}

function saveLocalBackup(payload) {
  const records = loadSavedSubmissions();
  records[payload.studentName] = payload;
  localStorage.setItem(SUBMISSIONS_STORAGE_KEY, JSON.stringify(records));
}

function requestJsonp(url, params, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const callbackName = `attendanceLookup_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const endpoint = new URL(url);
    let timer = null;
    let script = null;

    Object.entries({
      ...params,
      callback: callbackName
    }).forEach(([key, value]) => {
      endpoint.searchParams.set(key, value);
    });

    function cleanup() {
      window[callbackName] = undefined;

      if (timer) {
        clearTimeout(timer);
      }

      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    window[callbackName] = (response) => {
      cleanup();
      resolve(response);
    };

    script = document.createElement("script");
    script.src = endpoint.toString();
    script.onerror = () => {
      cleanup();
      reject(new Error("lookup failed"));
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error("lookup timeout"));
    }, timeoutMs);

    document.body.appendChild(script);
  });
}

async function getRemoteSubmission(name) {
  if (!GOOGLE_APPS_SCRIPT_URL || !name) {
    return null;
  }

  const response = await requestJsonp(GOOGLE_APPS_SCRIPT_URL, {
    action: "lookup",
    studentName: name
  });

  if (!response || response.ok === false || !response.record) {
    return null;
  }

  return response.record;
}

function setDateInputsDisabled(disabled) {
  dateList.querySelectorAll("input").forEach((input) => {
    input.disabled = disabled;
  });
}

function clearSelections() {
  dateList.querySelectorAll("input:checked").forEach((input) => {
    input.checked = false;
  });
}

function getStatusFromSavedRecord(record, date) {
  const savedDate = Array.isArray(record.records)
    ? record.records.find((item) => item.dateId === date.id || item.date === date.label)
    : null;

  if (savedDate && savedDate.status) {
    return savedDate.status;
  }

  if (Array.isArray(record.presentDates) && record.presentDates.includes(date.label)) {
    return "present";
  }

  if (Array.isArray(record.absentDates) && record.absentDates.includes(date.label)) {
    return "absent";
  }

  return "";
}

function applySavedRecord(record) {
  clearSelections();

  dates.forEach((date) => {
    const status = getStatusFromSavedRecord(record, date);
    const input = status ? form.querySelector(`input[name="${date.id}"][value="${status}"]`) : null;

    if (input) {
      input.checked = true;
    }
  });

  updateSummary();
}

function setReviewMode(enabled) {
  isReviewingSavedRecord = enabled;
  form.classList.toggle("is-reviewing", enabled);
  setDateInputsDisabled(enabled);
  updateSummary();
}

function showSavedRecord(record) {
  applySavedRecord(record);
  setReviewMode(true);
  setMessage(`這是 ${studentName.value} 之前填寫過的資料。若要更改，請按「再次修改」。`, "success");
}

function startEditingSavedRecord() {
  setReviewMode(false);
  setMessage(`正在修改 ${studentName.value} 的資料，送出後會覆蓋舊資料。`);

  const firstChoice = dateList.querySelector("input");
  if (firstChoice) {
    firstChoice.focus({ preventScroll: true });
  }
}

async function handleStudentChange() {
  clearMissingHighlights();
  const selectedName = studentName.value;
  const currentLookupId = ++lookupRequestId;

  setReviewMode(false);
  clearSelections();
  updateSummary();

  if (!selectedName) {
    setMessage("請先選擇學生姓名。");
    return;
  }

  const localRecord = getSavedSubmission(selectedName);

  if (GOOGLE_APPS_SCRIPT_URL) {
    setDateInputsDisabled(true);
    submitButton.disabled = true;
    submitButton.classList.add("is-incomplete");
    submitButton.textContent = "查詢資料中...";
    setMessage(`正在查詢 ${selectedName} 之前填寫過的資料...`);

    try {
      const remoteRecord = await getRemoteSubmission(selectedName);

      if (currentLookupId !== lookupRequestId) {
        return;
      }

      if (remoteRecord) {
        saveLocalBackup(remoteRecord);
        showSavedRecord(remoteRecord);
        return;
      }
    } catch (error) {
      if (currentLookupId !== lookupRequestId) {
        return;
      }

      if (localRecord) {
        showSavedRecord(localRecord);
        setMessage(`暫時無法查詢 Google Sheet，先顯示此裝置已儲存的 ${selectedName} 資料。`, "error");
        return;
      }

      setReviewMode(false);
      setMessage("暫時無法查詢 Google Sheet，請確認網路後再試；也可以先重新填寫後送出。", "error");
      return;
    }
  }

  if (localRecord) {
    showSavedRecord(localRecord);
    return;
  }

  setReviewMode(false);
  setMessage(`尚未找到 ${selectedName} 的舊資料，請完成 ${dates.length} 天的出席狀態後再送出。`);
}

async function submitToGoogleSheet(payload) {
  if (!GOOGLE_APPS_SCRIPT_URL) {
    return {
      ok: true,
      localOnly: true
    };
  }

  await fetch(GOOGLE_APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  return {
    ok: true,
    localOnly: false
  };
}

function validateForm() {
  const summary = updateSummary();

  if (!studentName.value) {
    setMessage("請先選擇學生姓名。", "error");
    studentName.focus();
    studentName.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
    return false;
  }

  const missingDate = summary.selections.find((date) => !date.status);
  if (missingDate) {
    setMessage(`請先選擇 ${missingDate.label} 的出席狀態。`, "error");
    jumpToMissingDate(missingDate);
    return false;
  }

  clearMissingHighlights();
  return true;
}

renderDates();
updateSummary();
setMessage(`請先選擇學生姓名。系統版本 ${APP_VERSION}`);

studentName.addEventListener("change", handleStudentChange);

form.addEventListener("change", (event) => {
  if (event.target === studentName || isReviewingSavedRecord) {
    return;
  }

  const summary = updateSummary();
  clearMissingHighlights();

  if (summary.filled === dates.length) {
    setMessage("已完成所有日期，可以送出。", "success");
  } else {
    setMessage(`還有 ${dates.length - summary.filled} 天未填，請確認每天都有點選。`);
  }
});

submitButton.addEventListener("click", (event) => {
  if (isReviewingSavedRecord) {
    event.preventDefault();
    startEditingSavedRecord();
    return;
  }

  if (submitButton.dataset.ready === "true") {
    return;
  }

  event.preventDefault();
  validateForm();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isReviewingSavedRecord) {
    startEditingSavedRecord();
    return;
  }

  if (!validateForm()) {
    return;
  }

  const payload = buildPayload();
  submitButton.disabled = true;
  submitButton.classList.remove("is-incomplete");
  submitButton.textContent = "送出中...";
  setMessage("送出中...");

  try {
    const result = await submitToGoogleSheet(payload);
    saveLocalBackup(payload);
    const localNote = result.localOnly ? "目前尚未設定 Google Sheets，資料已先暫存在此裝置。" : "已送出到 Google Sheets。";
    setMessage(localNote, "success");
    setReviewMode(true);
  } catch (error) {
    saveLocalBackup(payload);
    setMessage("網路送出失敗，資料已先暫存在此裝置。", "error");
  } finally {
    updateSummary();
  }
});

if (GOOGLE_SHEET_URL) {
  console.info(`Google Sheet: ${GOOGLE_SHEET_URL}`);
}
