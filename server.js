require("dotenv").config();

const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "quiz_maker",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function cleanText(value, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function validQuestionType(type) {
  return type === "multiple_choice" || type === "true_false";
}

function normalizeChoices(question) {
  if (question.question_type === "true_false") {
    return [
      { key: "T", text: "True", is_correct: question.correct_answer === "T" },
      { key: "F", text: "False", is_correct: question.correct_answer === "F" }
    ];
  }

  const choices = Array.isArray(question.choices) ? question.choices : [];
  return choices.map((c, i) => ({
    key: String(c.key || String.fromCharCode(65 + i)).toUpperCase().slice(0, 1),
    text: cleanText(c.text, 500),
    is_correct: Boolean(c.is_correct)
  })).filter(c => c.text);
}

async function getQuizWithQuestions(quizId, includeAnswers = true) {
  const [quizzes] = await pool.execute(
    "SELECT id, title, description, created_at FROM quizzes WHERE id = ?",
    [quizId]
  );
  if (!quizzes.length) return null;

  const [questions] = await pool.execute(
    `SELECT id, question_text, question_type, points, sort_order
     FROM questions WHERE quiz_id = ? ORDER BY sort_order, id`,
    [quizId]
  );

  for (const q of questions) {
    const [choices] = await pool.execute(
      `SELECT choice_key AS \`key\`, choice_text AS text, is_correct
       FROM choices WHERE question_id = ? ORDER BY id`,
      [q.id]
    );
    q.points = Number(q.points);
    q.choices = choices.map(c => ({
      key: c.key,
      text: c.text,
      ...(includeAnswers ? { is_correct: Boolean(c.is_correct) } : {})
    }));
  }

  return { ...quizzes[0], questions };
}

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Database connection failed." });
  }
});

app.get("/api/quizzes", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT q.id, q.title, q.description, q.created_at,
              COUNT(DISTINCT qu.id) AS question_count
       FROM quizzes q
       LEFT JOIN questions qu ON qu.quiz_id = q.id
       GROUP BY q.id
       ORDER BY q.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load quizzes." });
  }
});

app.get("/api/quizzes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid quiz ID." });
    }
    const quiz = await getQuizWithQuestions(id, true);
    if (!quiz) return res.status(404).json({ error: "Quiz not found." });
    res.json(quiz);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load quiz." });
  }
});

app.post("/api/quizzes", async (req, res) => {
  try {
    const title = cleanText(req.body.title, 200);
    const description = cleanText(req.body.description, 2000);
    if (!title) return res.status(400).json({ error: "Quiz title is required." });

    const [result] = await pool.execute(
      "INSERT INTO quizzes (title, description) VALUES (?, ?)",
      [title, description || null]
    );
    res.status(201).json({ id: result.insertId, message: "Quiz created." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to create quiz." });
  }
});

app.delete("/api/quizzes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid quiz ID." });
    }
    const [result] = await pool.execute("DELETE FROM quizzes WHERE id = ?", [id]);
    if (!result.affectedRows) return res.status(404).json({ error: "Quiz not found." });
    res.json({ message: "Quiz deleted." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to delete quiz." });
  }
});

app.post("/api/quizzes/:id/questions", async (req, res) => {
  const quizId = Number(req.params.id);
  if (!Number.isInteger(quizId) || quizId < 1) {
    return res.status(400).json({ error: "Invalid quiz ID." });
  }

  const questionText = cleanText(req.body.question_text, 5000);
  const type = req.body.question_type;
  const points = Number(req.body.points);

  if (!questionText || !validQuestionType(type)) {
    return res.status(400).json({ error: "Question text and valid question type are required." });
  }
  if (!Number.isFinite(points) || points <= 0 || points > 100) {
    return res.status(400).json({ error: "Points must be between 0.01 and 100." });
  }

  const [quizRows] = await pool.execute("SELECT id FROM quizzes WHERE id = ?", [quizId]);
  if (!quizRows.length) return res.status(404).json({ error: "Quiz not found." });

  const choices = normalizeChoices({
    question_type: type,
    correct_answer: String(req.body.correct_answer || "").toUpperCase(),
    choices: req.body.choices
  });

  if (type === "multiple_choice") {
    if (choices.length < 2 || choices.length > 6) {
      return res.status(400).json({ error: "Multiple choice questions need 2 to 6 choices." });
    }
    if (choices.filter(c => c.is_correct).length !== 1) {
      return res.status(400).json({ error: "Select exactly one correct answer." });
    }
  } else if (!["T", "F"].includes(String(req.body.correct_answer || "").toUpperCase())) {
    return res.status(400).json({ error: "True/False needs a correct answer." });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [maxRows] = await conn.execute(
      "SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM questions WHERE quiz_id = ?",
      [quizId]
    );
    const sortOrder = Number(maxRows[0].max_order) + 1;

    const [result] = await conn.execute(
      `INSERT INTO questions
       (quiz_id, question_text, question_type, points, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [quizId, questionText, type, points, sortOrder]
    );

    for (const choice of choices) {
      await conn.execute(
        `INSERT INTO choices (question_id, choice_text, choice_key, is_correct)
         VALUES (?, ?, ?, ?)`,
        [result.insertId, choice.text, choice.key, choice.is_correct ? 1 : 0]
      );
    }

    await conn.commit();
    res.status(201).json({ id: result.insertId, message: "Question added." });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ error: "Unable to add question." });
  } finally {
    conn.release();
  }
});

app.delete("/api/questions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid question ID." });
    }
    const [result] = await pool.execute("DELETE FROM questions WHERE id = ?", [id]);
    if (!result.affectedRows) return res.status(404).json({ error: "Question not found." });
    res.json({ message: "Question deleted." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to delete question." });
  }
});

app.post("/api/quizzes/:id/submit", async (req, res) => {
  const quizId = Number(req.params.id);
  const studentName = cleanText(req.body.student_name, 150);
  const answers = req.body.answers;

  if (!Number.isInteger(quizId) || quizId < 1 || !studentName || !Array.isArray(answers)) {
    return res.status(400).json({ error: "Quiz ID, student name, and answers are required." });
  }

  try {
    const quiz = await getQuizWithQuestions(quizId, true);
    if (!quiz) return res.status(404).json({ error: "Quiz not found." });
    if (!quiz.questions.length) return res.status(400).json({ error: "This quiz has no questions." });

    const answerMap = new Map();
    for (const item of answers) {
      const questionId = Number(item.question_id);
      const key = String(item.selected_choice_key || "").toUpperCase().slice(0, 1);
      if (Number.isInteger(questionId) && key) answerMap.set(questionId, key);
    }

    let score = 0;
    let totalPoints = 0;
    const graded = quiz.questions.map(q => {
      const selected = answerMap.get(q.id) || null;
      const correctChoice = q.choices.find(c => c.is_correct);
      const isCorrect = Boolean(selected && correctChoice && selected === correctChoice.key);
      const awarded = isCorrect ? q.points : 0;
      totalPoints += q.points;
      score += awarded;
      return {
        question_id: q.id,
        selected_choice_key: selected,
        correct_choice_key: correctChoice ? correctChoice.key : null,
        is_correct: isCorrect,
        awarded_points: awarded
      };
    });

    const percentage = totalPoints > 0 ? Number(((score / totalPoints) * 100).toFixed(2)) : 0;
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const [attemptResult] = await conn.execute(
        `INSERT INTO attempts
         (quiz_id, student_name, score, total_points, percentage)
         VALUES (?, ?, ?, ?, ?)`,
        [quizId, studentName, score, totalPoints, percentage]
      );

      for (const item of graded) {
        await conn.execute(
          `INSERT INTO attempt_answers
           (attempt_id, question_id, selected_choice_key, is_correct, awarded_points)
           VALUES (?, ?, ?, ?, ?)`,
          [
            attemptResult.insertId,
            item.question_id,
            item.selected_choice_key,
            item.is_correct ? 1 : 0,
            item.awarded_points
          ]
        );
      }

      await conn.commit();

      res.status(201).json({
        attempt_id: attemptResult.insertId,
        student_name: studentName,
        quiz_title: quiz.title,
        score,
        total_points: totalPoints,
        percentage,
        passed: percentage >= 75,
        answers: graded
      });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to submit quiz." });
  }
});

app.get("/api/results", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT a.id, a.student_name, q.title AS quiz_title,
              a.score, a.total_points, a.percentage, a.submitted_at
       FROM attempts a
       INNER JOIN quizzes q ON q.id = a.quiz_id
       ORDER BY a.submitted_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load results." });
  }
});

app.get("/api/results/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid result ID." });
    }

    const [attempts] = await pool.execute(
      `SELECT a.id, a.student_name, q.title AS quiz_title,
              a.score, a.total_points, a.percentage, a.submitted_at
       FROM attempts a INNER JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.id = ?`,
      [id]
    );
    if (!attempts.length) return res.status(404).json({ error: "Result not found." });

    const [answers] = await pool.execute(
      `SELECT aa.question_id, qu.question_text,
              aa.selected_choice_key, c.choice_text AS selected_answer,
              aa.is_correct, aa.awarded_points
       FROM attempt_answers aa
       INNER JOIN questions qu ON qu.id = aa.question_id
       LEFT JOIN choices c
         ON c.question_id = aa.question_id
        AND c.choice_key = aa.selected_choice_key
       WHERE aa.attempt_id = ?
       ORDER BY qu.sort_order, qu.id`,
      [id]
    );

    res.json({ ...attempts[0], answers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load result." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  try {
    await pool.query("SELECT 1");
    console.log("MySQL connection OK.");
    app.listen(PORT, () => {
      console.log(`Quiz Maker running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    console.error("Check your .env values and make sure MySQL/MariaDB is running.");
    process.exit(1);
  }
}

start();
