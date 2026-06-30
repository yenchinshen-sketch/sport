const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyE4EsJLCVPxeCksCguZ5xvYqKsaZA3f9nuxO1h0GdGDvYyPsRqQO8fb_JGbYFimj5K/exec";
const SUBMISSIONS_STORAGE_KEY = "sports-attendance-submissions";
const COACH_FEE_PER_DAY = 2000;

const students = ["序恆", "瑞安", "悠時", "泓毅", "亦宸", "愷恩"];
const dates = [
  { id: "2026-06-15", label: "6/15(一)" },
  { id: "2026-06-16", label: "6/16(二)" },
  { id: "2026-06-17", label: "6/17(三)" },
  { id: "2026-06-18", label: "6/18(四)" },
  { id: "2026-06-22", label: "6/22(一)" },
  { id: "2026-06-23", label: "6/23(二)" },
  { id: "2026-06-24", label: "6/24(三)" },
  { id: "2026-06-25", label: "6/25(四)" },
  { id: "2026-06-26", label: "6/26(五)" },
  { id: "2026-06-29", label: "6/29(一)" },
  { id: "2026-06-30", label: "6/30(二)" }
];

const dataStatus = document.querySelector("#dataStatus");
const lastUpdated = document.querySelector("#lastUpdated");
const totalCoachFee = document.querySelector("#totalCoachFee");
const settledDays = document.querySelector("#settledDays");
const studentCount = document.querySelector("#studentCount");
const dailyList = document.querySelector("#dailyList");
const studentRows = document.querySelector("#studentRows");
const refreshButton = document.querySelector("#refreshButton");
const downloadButton = document.querySelector("#downloadButton");

let currentSummary = null;

function formatMoney(amount) {
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return `${new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(amount)} 元`;
}

function setStatus(text, type = "") {
  dataStatus.textContent = text;
  dataStatus.className = `status-pill ${type}`.trim();
}

function requestJsonp(url, params, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const callbackName = `feeLookup_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const endpoint = new URL(url);
    let script = null;
    let timer = null;

    Object.entries({ ...params, callback: callbackName }).forEach(([key, value]) => {
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
      reject(new Error("無法連線到 Google Sheet"));
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error("Google Sheet 查詢逾時"));
    }, timeoutMs);

    document.body.appendChild(script);
  });
}

function loadLocalBackups() {
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

async function lookupStudent(name) {
  const response = await requestJsonp(GOOGLE_APPS_SCRIPT_URL, {
    action: "lookup",
    studentName: name
  });

  if (!response || response.ok === false || !response.record) {
    return null;
  }

  return response.record;
}

function getStatus(record, date) {
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

function buildSummary(recordsByStudent) {
  const knownStudents = students.filter((name) => recordsByStudent[name]);
  const missingStudents = students.filter((name) => !recordsByStudent[name]);
  const totalsByStudent = Object.fromEntries(students.map((name) => [
    name,
    {
      name,
      days: 0,
      total: 0,
      status: recordsByStudent[name] ? "已取得" : "尚未取得資料"
    }
  ]));

  const days = dates.map((date) => {
    const attendees = knownStudents.filter((name) => getStatus(recordsByStudent[name], date) === "present");
    const perStudentFee = attendees.length ? COACH_FEE_PER_DAY / attendees.length : 0;

    attendees.forEach((name) => {
      totalsByStudent[name].days += 1;
      totalsByStudent[name].total += perStudentFee;
    });

    return {
      ...date,
      attendees,
      perStudentFee
    };
  });

  return {
    days,
    students: students.map((name) => totalsByStudent[name]),
    knownStudents,
    missingStudents
  };
}

function renderDailyCards(days) {
  dailyList.innerHTML = days.map((day) => {
    const names = day.attendees.length
      ? day.attendees.map((name) => `<span class="name-chip">${name}</span>`).join("")
      : `<p class="empty-note">今天沒有取得任何出席學生，請先確認資料。</p>`;

    return `
      <article class="day-card">
        <div class="day-head">
          <div class="day-date">${day.label}</div>
          <div class="day-metrics">
            <div class="metric">
              <strong>${day.attendees.length} 人</strong>
              <span>當天出席</span>
            </div>
            <div class="metric">
              <strong>${formatMoney(day.perStudentFee)}</strong>
              <span>每人應繳</span>
            </div>
          </div>
        </div>
        <div class="name-list">${names}</div>
      </article>
    `;
  }).join("");
}

function renderStudentRows(summary) {
  studentRows.innerHTML = summary.students.map((student) => `
    <tr>
      <td>${student.name}</td>
      <td>${student.days}</td>
      <td class="money">${student.status === "已取得" ? formatMoney(student.total) : "-"}</td>
      <td class="${student.status === "已取得" ? "" : "warning"}">${student.status}</td>
    </tr>
  `).join("");
}

function renderSummary(summary) {
  currentSummary = summary;
  totalCoachFee.textContent = formatMoney(COACH_FEE_PER_DAY * dates.length);
  settledDays.textContent = dates.length;
  studentCount.textContent = `${summary.knownStudents.length}/${students.length}`;
  renderDailyCards(summary.days);
  renderStudentRows(summary);

  if (summary.missingStudents.length) {
    setStatus("部分資料未取得", "is-error");
    lastUpdated.textContent = `尚未取得：${summary.missingStudents.join("、")}。其餘資料已完成計算。`;
    return;
  }

  setStatus("資料已更新", "is-ready");
  lastUpdated.textContent = `最後更新：${new Date().toLocaleString("zh-TW")}`;
}

function buildCsv(summary) {
  const rows = [
    ["日期", "出席學生", "出席人數", "每人應繳"],
    ...summary.days.map((day) => [
      day.label,
      day.attendees.join("、"),
      day.attendees.length,
      day.perStudentFee.toFixed(2)
    ]),
    [],
    ["學生", "出席天數", "應繳合計", "資料狀態"],
    ...summary.students.map((student) => [
      student.name,
      student.days,
      student.status === "已取得" ? student.total.toFixed(2) : "",
      student.status
    ])
  ];

  return rows.map((row) => row.map((cell) => {
    const text = String(cell);
    return `"${text.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
}

function downloadCsv() {
  if (!currentSummary) {
    return;
  }

  const blob = new Blob([`\ufeff${buildCsv(currentSummary)}`], {
    type: "text/csv;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "運動費用結算.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function loadData() {
  setStatus("讀取資料中");
  lastUpdated.textContent = "正在連線到 Google Sheet...";
  refreshButton.disabled = true;
  downloadButton.disabled = true;

  const localBackups = loadLocalBackups();
  const results = await Promise.allSettled(students.map(async (name) => {
    const remoteRecord = await lookupStudent(name);
    return [name, remoteRecord || localBackups[name] || null];
  }));

  const recordsByStudent = {};
  results.forEach((result, index) => {
    const fallbackName = students[index];

    if (result.status === "fulfilled") {
      const [name, record] = result.value;

      if (record) {
        recordsByStudent[name] = record;
      }

      return;
    }

    if (localBackups[fallbackName]) {
      recordsByStudent[fallbackName] = localBackups[fallbackName];
    }
  });

  renderSummary(buildSummary(recordsByStudent));
  refreshButton.disabled = false;
  downloadButton.disabled = false;
}

refreshButton.addEventListener("click", loadData);
downloadButton.addEventListener("click", downloadCsv);

loadData();
