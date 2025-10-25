// popup.js - Enhanced version with new API integration

let currentData = {
  profile: null,
  submissions: [],
  calendar: null
};

document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
});

function initializeApp() {
  // Get DOM elements
  const usernameInput = document.getElementById("username");
  const limitSelect = document.getElementById("limit");
  const languageFilter = document.getElementById("languageFilter");
  const fetchProfileBtn = document.getElementById("fetchProfile");
  const fetchSubmissionsBtn = document.getElementById("fetchSubmissions");
  const statusElem = document.getElementById("status");
  const resultsBody = document.getElementById("resultsBody");
  const statsSection = document.getElementById("statsSection");
  const totalSolved = document.getElementById("totalSolved");
  const totalSubmissions = document.getElementById("totalSubmissions");

  // Prefill username if detected/stored
  chrome.storage.local.get("leetcode_username", data => {
    if (data.leetcode_username) {
      usernameInput.value = data.leetcode_username;
    }
  });

  // Event listeners
  document.getElementById("testConnection").addEventListener("click", () => testConnection());
  fetchProfileBtn.addEventListener("click", () => fetchUserProfile());
  fetchSubmissionsBtn.addEventListener("click", () => fetchSubmissions());
  languageFilter.addEventListener("change", () => filterSubmissions());
  
  // Tab functionality
  initializeTabs();
  
  // Modal functionality
  initializeModal();
  
  // Calendar functionality
  initializeCalendar();
  
  // Export functionality
  initializeExport();
}

function testConnection() {
  showStatus("Testing LeetCode connection...", "loading");
  
  chrome.runtime.sendMessage(
    { action: "test_connection" },
    response => {
      if (!response) {
        showStatus("No response from background script.", "error");
        return;
      }

      if (!response.success) {
        showStatus("Connection failed: " + response.error, "error");
        return;
      }

      const { hasSession, hasCSRF, message } = response.data;
      if (hasSession && hasCSRF) {
        showStatus("✅ Connection successful! Cookies found.", "success");
      } else {
        showStatus("❌ Connection failed. Please log into LeetCode first.", "error");
      }
    }
  );
}

function fetchUserProfile() {
  const username = document.getElementById("username").value.trim();
  if (!username) {
    showStatus("Please enter your LeetCode username first.", "error");
    return;
  }

  showStatus("Fetching profile...", "loading");
  
  chrome.runtime.sendMessage(
    { action: "fetch_profile", username },
    response => {
      if (!response) {
        showStatus("No response from background script.", "error");
        return;
      }

      if (!response.success) {
        showStatus("Error: " + response.error, "error");
        return;
      }

      currentData.profile = response.data;
      displayProfile(response.data);
      showStatus("Profile loaded successfully!", "success");
    }
  );
}

function fetchSubmissions() {
  const username = document.getElementById("username").value.trim();
  const limit = parseInt(document.getElementById("limit").value, 10);
  
  if (!username) {
    showStatus("Please enter your LeetCode username first.", "error");
    return;
  }

  showStatus("Fetching submissions...", "loading");
  
  chrome.runtime.sendMessage(
    { action: "fetch_submissions", username, limit },
    response => {
      if (!response) {
        showStatus("No response from background script.", "error");
        return;
      }

      if (!response.success) {
        showStatus("Error: " + response.error, "error");
        return;
      }

      currentData.submissions = response.data.submissions || [];
      displaySubmissions(currentData.submissions);
      updateStats(response.data.solvedCount, currentData.submissions.length);
      showStatus(`Fetched ${currentData.submissions.length} submissions successfully!`, "success");
    }
  );
}

function displayProfile(profile) {
  const statsSection = document.getElementById("statsSection");
  const totalSolved = document.getElementById("totalSolved");
  const totalSubmissions = document.getElementById("totalSubmissions");
  
  if (profile && profile.submitStats) {
    statsSection.style.display = "flex";
    totalSolved.textContent = profile.submitStats.acSubmissionNum || 0;
    totalSubmissions.textContent = profile.submitStats.totalSubmissionNum || 0;
  }
}

function displaySubmissions(submissions) {
  const resultsBody = document.getElementById("resultsBody");
  resultsBody.innerHTML = "";

  if (submissions.length === 0) {
    resultsBody.innerHTML = `<tr><td colspan="7">No submissions found.</td></tr>`;
    return;
  }

  submissions.forEach((sub, i) => {
    const row = document.createElement("tr");
    const date = new Date(sub.timestamp * 1000).toLocaleDateString();

    row.innerHTML = `
      <td>${i + 1}</td>
      <td><a href="https://leetcode.com/problems/${sub.slug}/" target="_blank">${sub.title}</a></td>
      <td><span class="language-badge">${sub.lang}</span></td>
      <td>${sub.runtime || 'N/A'}</td>
      <td>${sub.memory || 'N/A'}</td>
      <td>${date}</td>
      <td>
        <button class="btn-small view-code" data-index="${i}">View Code</button>
      </td>
    `;

    // Add click handler for view code button
    const viewCodeBtn = row.querySelector('.view-code');
    viewCodeBtn.addEventListener('click', () => showCodeModal(sub));

    resultsBody.appendChild(row);
  });
}

function filterSubmissions() {
  const languageFilter = document.getElementById("languageFilter").value;
  const filteredSubmissions = languageFilter 
    ? currentData.submissions.filter(sub => sub.lang === languageFilter)
    : currentData.submissions;
  
  displaySubmissions(filteredSubmissions);
}

function updateStats(solvedCount, submissionCount) {
  const statsSection = document.getElementById("statsSection");
  const totalSolved = document.getElementById("totalSolved");
  const totalSubmissions = document.getElementById("totalSubmissions");
  
  statsSection.style.display = "flex";
  totalSolved.textContent = solvedCount || submissionCount;
  totalSubmissions.textContent = submissionCount;
}

function showCodeModal(submission) {
  const modal = document.getElementById("codeModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalLanguage = document.getElementById("modalLanguage");
  const modalRuntime = document.getElementById("modalRuntime");
  const modalMemory = document.getElementById("modalMemory");
  const modalCode = document.getElementById("modalCode");

  modalTitle.textContent = submission.title;
  modalLanguage.textContent = `Language: ${submission.lang}`;
  modalRuntime.textContent = `Runtime: ${submission.runtime || 'N/A'}`;
  modalMemory.textContent = `Memory: ${submission.memory || 'N/A'}`;
  modalCode.textContent = submission.code;

  modal.style.display = "block";
}

function initializeModal() {
  const modal = document.getElementById("codeModal");
  const closeBtn = document.querySelector(".close");
  const closeModalBtn = document.getElementById("closeModal");
  const copyCodeBtn = document.getElementById("copyCode");

  closeBtn.addEventListener("click", () => modal.style.display = "none");
  closeModalBtn.addEventListener("click", () => modal.style.display = "none");
  
  copyCodeBtn.addEventListener("click", () => {
    const code = document.getElementById("modalCode").textContent;
    navigator.clipboard.writeText(code);
    showStatus("Code copied to clipboard!", "success");
  });

  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });
}

function initializeTabs() {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      const targetTab = button.getAttribute("data-tab");
      
      // Remove active class from all buttons and panels
      tabButtons.forEach(btn => btn.classList.remove("active"));
      tabPanels.forEach(panel => panel.classList.remove("active"));
      
      // Add active class to clicked button and corresponding panel
      button.classList.add("active");
      document.getElementById(targetTab + "Tab").classList.add("active");
    });
  });
}

function initializeCalendar() {
  const prevYearBtn = document.getElementById("prevYear");
  const nextYearBtn = document.getElementById("nextYear");
  const currentYearSpan = document.getElementById("currentYear");
  const calendarContent = document.getElementById("calendarContent");
  
  let currentYear = new Date().getFullYear();
  currentYearSpan.textContent = currentYear;

  prevYearBtn.addEventListener("click", () => {
    currentYear--;
    currentYearSpan.textContent = currentYear;
    fetchCalendar(currentYear);
  });

  nextYearBtn.addEventListener("click", () => {
    currentYear++;
    currentYearSpan.textContent = currentYear;
    fetchCalendar(currentYear);
  });

  // Load current year calendar
  fetchCalendar(currentYear);
}

function fetchCalendar(year) {
  const username = document.getElementById("username").value.trim();
  if (!username) {
    showStatus("Please enter your LeetCode username first.", "error");
    return;
  }

  chrome.runtime.sendMessage(
    { action: "fetch_calendar", username, year },
    response => {
      if (response && response.success) {
        displayCalendar(response.data, year);
      } else {
        showStatus("Error loading calendar: " + (response?.error || "Unknown error"), "error");
      }
    }
  );
}

function displayCalendar(calendarData, year) {
  const calendarContent = document.getElementById("calendarContent");
  // Implementation for calendar display would go here
  calendarContent.innerHTML = `<p>Calendar data for ${year} would be displayed here.</p>`;
}

function initializeExport() {
  const exportJSON = document.getElementById("exportJSON");
  const exportCSV = document.getElementById("exportCSV");
  const exportCode = document.getElementById("exportCode");

  exportJSON.addEventListener("click", () => exportData("json"));
  exportCSV.addEventListener("click", () => exportData("csv"));
  exportCode.addEventListener("click", () => exportData("code"));
}

function exportData(format) {
  if (currentData.submissions.length === 0) {
    showStatus("No data to export. Please fetch submissions first.", "error");
    return;
  }

  const username = document.getElementById("username").value.trim();
  const timestamp = new Date().toISOString().split('T')[0];
  
  switch (format) {
    case "json":
      exportAsJSON(username, timestamp);
      break;
    case "csv":
      exportAsCSV(username, timestamp);
      break;
    case "code":
      exportAsCodeFiles(username, timestamp);
      break;
  }
}

function exportAsJSON(username, timestamp) {
  const data = {
    username,
    exportDate: timestamp,
    submissions: currentData.submissions
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leetcode-submissions-${username}-${timestamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showStatus("JSON file exported successfully!", "success");
}

function exportAsCSV(username, timestamp) {
  const headers = ["Title", "Language", "Runtime", "Memory", "Date", "Code"];
  const csvContent = [
    headers.join(","),
    ...currentData.submissions.map(sub => [
      `"${sub.title}"`,
      `"${sub.lang}"`,
      `"${sub.runtime || 'N/A'}"`,
      `"${sub.memory || 'N/A'}"`,
      `"${new Date(sub.timestamp * 1000).toLocaleDateString()}"`,
      `"${sub.code.replace(/"/g, '""')}"`
    ].join(","))
  ].join("\n");
  
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leetcode-submissions-${username}-${timestamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  
  showStatus("CSV file exported successfully!", "success");
}

function exportAsCodeFiles(username, timestamp) {
  // This would create individual code files for each submission
  showStatus("Code files export feature coming soon!", "info");
}

function showStatus(message, type = "info") {
  const statusElem = document.getElementById("status");
  statusElem.textContent = message;
  statusElem.className = `status-message ${type}`;
  
  // Auto-hide success messages after 3 seconds
  if (type === "success") {
    setTimeout(() => {
      statusElem.textContent = "";
      statusElem.className = "status-message";
    }, 3000);
  }
}
  