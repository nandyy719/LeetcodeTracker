# LeetCode Solution Tracker 🧠

---

## 🚀 Overview

The **LeetCode Solution Tracker** is a small-to-medium sized Chrome Extension designed to elevate your LeetCode problem-solving experience. It allows you to **capture and save** your final submissions directly from the LeetCode submission page, complete with your personal notes and the submission's performance metrics.

The core power of this extension comes from its integration with the **Gemini API**. After successfully saving a submission, you can leverage Google's cutting-edge AI to:

* Generate an **optimal solution** to the problem.
* Receive a **detailed comparison** between your code and the optimal solution.
* Get **educational notes** and actionable insights for improvement.
* Identify **algorithmic topics/techniques** for targeted review.

This tracker turns every LeetCode submission into a personalized, AI-powered learning opportunity.

---

## ✨ Features

* **Submission Capture:** Automatically extracts the problem name, difficulty, language, code, and submission results (runtime, memory, status) from the LeetCode submission view.
* **Local Storage:** Saves all your submissions and personal notes securely in the extension's local storage.
* **Gemini API Integration:** Requires a user-configured API key to provide advanced solution analysis.
* **AI Analysis:** Requests Gemini to generate an optimal solution and detailed educational feedback on your submission.

---

## 🛠️ Setup & Configuration

1.  **Get Your Gemini API Key:** You must have a valid API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2.  **Load the Extension (Developer Mode):**
    a.  Navigate to `chrome://extensions/` in your Chrome browser.
    b.  Enable **Developer mode** using the toggle in the top-right corner.
    c.  Click **Load unpacked** and select the directory containing the extension files.
3.  **Configure API Key:** Open the extension popup, click the **Configure API** button, and paste your Gemini API key to save it securely for future use.

---

## ⚠️ Known Issues & Important Deficits

Please be aware of these current limitations to ensure a smooth and correct experience:

1.  **Code Extraction Requires Visibility:** The code extraction logic attempts to capture what is visually present in the LeetCode editor. If your solution is very long and **doesn't fit entirely on the screen** without scrolling in the submission view, the full code may not be captured. In this scenario, you must **copy the complete solution** and paste/edit it into the extension's code field before saving.
2.  **Page Refresh After Problem Change:** If you use LeetCode's in-site navigation to switch from one problem to another, the extension may incorrectly retrieve the problem name of the **previous problem**. To prevent this, you should **refresh the LeetCode page** every time you move to a new problem before trying to use the extension.
3.  **Must Be on Submission View:** The extension is designed to run on the LeetCode submission result page (the URL will typically include `/submissions/`). It will retrieve incorrect or incomplete results if you try to use it before you have successfully **clicked the Submit button** and navigated to the final submission view.
4.  **Save Edits Before Analysis:** If you make an edit to the code or notes fields within the extension popup, you must **save the submission first** before clicking "Analyze with Gemini." Gemini will otherwise analyze the **old, unsaved version** of the code, as changes made in the popup field do not update the submission data until the "Save Submission" button is clicked.

---