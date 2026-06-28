// Paste your deployed Google Apps Script Web App URL here to send responses to Google Sheets.
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyE4EsJLCVPxeCksCguZ5xvYqKsaZA3f9nuxO1h0GdGDvYyPsRqQO8fb_JGbYFimj5K/exec";
const GOOGLE_SHEET_URL = "";

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

function renderDates() {
  dateList.innerHTML = dates.map((date) => `
    <article class="date-card">
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

  return { selections, present, absent, filled };
}

function setMessage(text, type = "") {
  formMessage.textContent = text;
  formMessage.className = `form-message ${type}`.trim();
}

function buildPayload() {
  const summary = updateSummary();

  return {
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

function saveLocalBackup(payload) {
  const key = "sports-attendance-submissions";
  const records = JSON.parse(localStorage.getItem(key) || "[]");
  records.push(payload);
  localStorage.setItem(key, JSON.stringify(records));
}

async function submitToGoogleSheet(payload) {
  if (!GOOGLE_APPS_SCRIPT_URL) {
    saveLocalBackup(payload);
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
  if (!studentName.value) {
    setMessage("請先選擇學生姓名。", "error");
    studentName.focus();
    return false;
  }

  const missingDate = getSelections().find((date) => !date.status);
  if (missingDate) {
    setMessage(`請選擇 ${missingDate.label} 的出席狀態。`, "error");
    return false;
  }

  return true;
}

renderDates();
updateSummary();

form.addEventListener("change", () => {
  updateSummary();
  setMessage("");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!validateForm()) {
    return;
  }

  const payload = buildPayload();
  submitButton.disabled = true;
  setMessage("送出中...");

  try {
    const result = await submitToGoogleSheet(payload);
    const localNote = result.localOnly ? "目前尚未設定 Google Sheets，資料已先暫存在此裝置。" : "已送出到 Google Sheets。";
    setMessage(localNote, "success");
  } catch (error) {
    saveLocalBackup(payload);
    setMessage("網路送出失敗，資料已先暫存在此裝置。", "error");
  } finally {
    submitButton.disabled = false;
  }
});

if (GOOGLE_SHEET_URL) {
  console.info(`Google Sheet: ${GOOGLE_SHEET_URL}`);
}
