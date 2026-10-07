const $ = (id) => document.getElementById(id);
let selectedQuizId = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

function showAlert(message, type = "success") {
  $("alert").innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
  setTimeout(() => $("alert").innerHTML = "", 4000);
}

function hideSections() {
  ["admin","student","quizArea","results"].forEach(id => $(id).classList.add("d-none"));
}

function showAdmin() {
  hideSections();
  $("admin").classList.remove("d-none");
  loadAdmin();
}

function showStudent() {
  hideSections();
  $("student").classList.remove("d-none");
  loadQuizzes();
}

async function showResults() {
  hideSections();
  $("results").classList.remove("d-none");
  const res = await fetch("/api/results");
  const data = await res.json();
  if (!res.ok) return showAlert(data.error || "Unable to load results.", "danger");
  $("results").innerHTML = `
    <div class="card shadow-sm"><div class="card-body">
      <h2 class="h5">Student Results</h2>
      ${data.length ? `<div class="table-responsive"><table class="table table-striped">
      <thead><tr><th>Student</th><th>Quiz</th><th>Score</th><th>Percentage</th><th>Date</th></tr></thead>
      <tbody>${data.map(r => `<tr>
        <td>${escapeHtml(r.student_name)}</td>
        <td>${escapeHtml(r.quiz_title)}</td>
        <td>${r.score} / ${r.total_points}</td>
        <td>${r.percentage}%</td>
        <td>${new Date(r.submitted_at).toLocaleString()}</td>
      </tr>`).join("")}</tbody></table></div>` : `<p class="text-muted">No results yet.</p>`}
    </div></div>`;
}

async function loadQuizzes() {
  const res = await fetch("/api/quizzes");
  const data = await res.json();
  if (!res.ok) return showAlert(data.error || "Unable to load quizzes.", "danger");
  $("quizList").innerHTML = data.length ? data.map(q => `
    <div class="border rounded p-3 mb-2 d-flex justify-content-between align-items-center gap-2">
      <div><strong>${escapeHtml(q.title)}</strong><div class="small-muted">${escapeHtml(q.description || "")} · ${q.question_count} question(s)</div></div>
      <button class="btn btn-primary btn-sm" onclick="startQuiz(${q.id})">Start</button>
    </div>`).join("") : `<p class="text-muted">No quizzes available. Ask the teacher to create one.</p>`;
}

async function loadAdmin() {
  const res = await fetch("/api/quizzes");
  const data = await res.json();
  $("adminContent").innerHTML = data.map(q => `
    <div class="card shadow-sm mb-3"><div class="card-body">
      <div class="d-flex justify-content-between gap-2">
        <div><h3 class="h5">${escapeHtml(q.title)}</h3><p class="small-muted">${escapeHtml(q.description || "")}</p></div>
        <button class="btn btn-outline-danger btn-sm" onclick="deleteQuiz(${q.id})">Delete Quiz</button>
      </div>
      <div id="quiz-${q.id}">Loading...</div>
    </div></div>`).join("") || `<p class="text-muted">No quizzes created.</p>`;

  for (const q of data) loadAdminQuiz(q.id);
}

async function loadAdminQuiz(id) {
  const res = await fetch(`/api/quizzes/${id}`);
  const q = await res.json();
  if (!res.ok) return;
  const box = $(`quiz-${id}`);
  box.innerHTML = `
    <hr>
    <h4 class="h6">Add Question</h4>
    <form onsubmit="addQuestion(event, ${id})" class="row g-2 mb-3">
      <div class="col-12"><textarea class="form-control" name="question_text" placeholder="Question" required maxlength="5000"></textarea></div>
      <div class="col-md-4">
        <select class="form-select" name="question_type" onchange="toggleQuestionType(this)" required>
          <option value="multiple_choice">Multiple Choice</option>
          <option value="true_false">True / False</option>
        </select>
      </div>
      <div class="col-md-2"><input class="form-control" type="number" name="points" min=".01" max="100" step=".01" value="1" required></div>
      <div class="col-md-6"></div>
      <div class="col-12 choice-area">
        ${choiceInputs()}
      </div>
      <div class="col-12"><button class="btn btn-success">Add Question</button></div>
    </form>
    <h4 class="h6">Questions (${q.questions.length})</h4>
    ${q.questions.map((question, i) => `
      <div class="question-card border rounded p-3 mb-2">
        <div><strong>${i+1}. ${escapeHtml(question.question_text)}</strong> <span class="badge text-bg-secondary">${question.points} pt</span></div>
        <ul class="mb-1">${question.choices.map(c => `<li>${escapeHtml(c.text)} ${c.is_correct ? "✓" : ""}</li>`).join("")}</ul>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteQuestion(${question.id})">Delete</button>
      </div>`).join("") || `<p class="text-muted">No questions yet.</p>`}
  `;
}

function choiceInputs() {
  return ["A","B","C","D"].map((k, i) => `
    <div class="input-group mb-2 choice-row">
      <span class="input-group-text">${k}</span>
      <input class="form-control" name="choice_${k}" placeholder="Choice ${k}" ${i < 2 ? "required" : ""} maxlength="500">
      <div class="input-group-text"><input type="radio" name="correct_choice" value="${k}" ${i===0 ? "checked" : ""}> Correct</div>
    </div>`).join("");
}

function toggleQuestionType(select) {
  const form = select.closest("form");
  const area = form.querySelector(".choice-area");
  if (select.value === "true_false") {
    area.innerHTML = `<div class="input-group"><span class="input-group-text">Correct answer</span>
      <select class="form-select" name="correct_choice"><option value="T">True</option><option value="F">False</option></select></div>`;
  } else {
    area.innerHTML = choiceInputs();
  }
}

$("quizForm").addEventListener("submit", async e => {
  e.preventDefault();
  const res = await fetch("/api/quizzes", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({title:$("quizTitle").value, description:$("quizDescription").value})
  });
  const data = await res.json();
  if (!res.ok) return showAlert(data.error || "Unable to create quiz.", "danger");
  e.target.reset();
  showAlert("Quiz created.");
  loadAdmin();
});

async function addQuestion(e, quizId) {
  e.preventDefault();
  const form = e.target;
  const type = form.question_type.value;
  const choices = [];
  if (type === "multiple_choice") {
    ["A","B","C","D"].forEach(k => {
      const text = form[`choice_${k}`].value.trim();
      if (text) choices.push({key:k, text, is_correct: form.correct_choice.value === k});
    });
  }
  const body = {
    question_text: form.question_text.value,
    question_type: type,
    points: form.points.value,
    correct_answer: type === "true_false" ? form.correct_choice.value : undefined,
    choices
  };
  const res = await fetch(`/api/quizzes/${quizId}/questions`, {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) return showAlert(data.error || "Unable to add question.", "danger");
  showAlert("Question added.");
  loadAdminQuiz(quizId);
}

async function deleteQuestion(id) {
  if (!confirm("Delete this question?")) return;
  const res = await fetch(`/api/questions/${id}`, {method:"DELETE"});
  const data = await res.json();
  if (!res.ok) return showAlert(data.error || "Unable to delete question.", "danger");
  showAlert("Question deleted.");
  loadAdmin();
}

async function deleteQuiz(id) {
  if (!confirm("Delete this quiz and all its questions/results?")) return;
  const res = await fetch(`/api/quizzes/${id}`, {method:"DELETE"});
  const data = await res.json();
  if (!res.ok) return showAlert(data.error || "Unable to delete quiz.", "danger");
  showAlert("Quiz deleted.");
  loadAdmin();
}

async function startQuiz(id) {
  const res = await fetch(`/api/quizzes/${id}`);
  const quiz = await res.json();
  if (!res.ok) return showAlert(quiz.error || "Unable to load quiz.", "danger");
  selectedQuizId = id;
  hideSections();
  $("quizArea").classList.remove("d-none");
  $("quizArea").innerHTML = `
    <div class="card shadow-sm"><div class="card-body">
      <h1 class="h4">${escapeHtml(quiz.title)}</h1>
      <p class="text-muted">${escapeHtml(quiz.description || "")}</p>
      <div class="mb-3"><input id="studentName" class="form-control" placeholder="Enter your name" maxlength="150" required></div>
      <form id="takeQuizForm">
        ${quiz.questions.map((q, i) => `
          <div class="question-card border rounded p-3 mb-3">
            <div class="fw-bold mb-2">${i+1}. ${escapeHtml(q.question_text)} <span class="badge text-bg-secondary">${q.points} pt</span></div>
            ${q.choices.map(c => `<label class="choice-label">
              <input type="radio" name="q_${q.id}" value="${c.key}" class="me-2"> ${escapeHtml(c.text)}
            </label>`).join("")}
          </div>`).join("")}
        <button class="btn btn-success" type="submit">Submit Quiz</button>
        <button class="btn btn-secondary" type="button" onclick="showStudent()">Cancel</button>
      </form>
    </div></div>`;
  $("takeQuizForm").addEventListener("submit", e => submitQuiz(e, quiz));
}

async function submitQuiz(e, quiz) {
  e.preventDefault();
  const name = $("studentName").value.trim();
  if (!name) return showAlert("Please enter your name.", "warning");

  const answers = quiz.questions.map(q => {
    const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
    return {question_id:q.id, selected_choice_key:selected ? selected.value : null};
  });

  if (!confirm("Submit your answers now?")) return;

  const res = await fetch(`/api/quizzes/${quiz.id}/submit`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({student_name:name, answers})
  });
  const result = await res.json();
  if (!res.ok) return showAlert(result.error || "Unable to submit quiz.", "danger");

  $("quizArea").innerHTML = `
    <div class="card shadow-sm"><div class="card-body text-center">
      <h2 class="h4">Quiz Submitted</h2>
      <p class="lead">${escapeHtml(result.student_name)}</p>
      <h3>${result.score} / ${result.total_points}</h3>
      <p class="fs-4">${result.percentage}%</p>
      <p class="${result.passed ? "correct" : "incorrect"}">${result.passed ? "PASSED" : "FAILED"} (75% passing score)</p>
      <button class="btn btn-primary" onclick="showStudent()">Take Another Quiz</button>
      <button class="btn btn-outline-secondary" onclick="showResults()">View Results</button>
    </div></div>`;
}
