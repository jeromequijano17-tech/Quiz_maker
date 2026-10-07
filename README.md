# Simple Quiz Maker — Node.js + MySQL

A simple local quiz maker for teachers and students.

## Included features

- Teacher/admin quiz creation
- Multiple quizzes
- Multiple-choice questions
- True/False questions
- Answer key stored in MySQL
- Custom points per question
- Automatic checking
- Percentage score
- 75% pass/fail result
- Student name without account
- Results saved in MySQL
- Delete quizzes/questions
- Responsive Bootstrap interface

## Requirements

- Node.js 18+ recommended
- MySQL 8+ or MariaDB 10.4+
- A web browser

## Installation

1. Install Node.js.
2. Make sure MySQL/MariaDB is running.
3. Create the database:

```bash
mysql -u root -p < database.sql
```

If the `mysql` command is not available, open MySQL Workbench/phpMyAdmin and run `database.sql`.

4. Copy `.env.example` to `.env`.
5. Edit `.env` with your MySQL credentials.
6. Install packages:

```bash
npm install
```

7. Start:

```bash
npm start
```

8. Open:

http://localhost:3000

## Example .env

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=quiz_maker
PORT=3000
```

## Important

Do not put your real `.env` file into GitHub. Add `.env` to `.gitignore`.

This version is intended as a simple local teaching/project application. It does not yet include teacher authentication, timed exams, randomization, Excel import/export, or anti-cheating controls.
