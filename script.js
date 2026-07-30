let allData = [];
let currentLesson = [];
let currentQuestionIndex = 0;
let score = 0;
let currentSubject = ""; 
let isSpeedRun = false;
let timerInterval;

// Screen & Container Elements
const menuScreen = document.getElementById('menu-screen');
const submenuScreen = document.getElementById('submenu-screen');
const quizScreen = document.getElementById('quiz-screen');
const resultScreen = document.getElementById('result-screen');
const subjectButtonsContainer = document.getElementById('subject-buttons');
const submenuButtonsContainer = document.getElementById('submenu-buttons');
const optionsContainer = document.getElementById('options-container');
const feedbackCard = document.getElementById('feedback-card');
const factsList = document.getElementById('facts-list');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');
const progressFill = document.getElementById('progress-fill');
const searchInput = document.getElementById('fact-search');
const searchResults = document.getElementById('search-results-container');

// --- 1. INITIALIZATION & GLOBAL STATS ---
async function loadGameData() {
    try {
        const response = await fetch('game_data.json');
        allData = await response.json();
        updatePlayerLevel();
        updateTopBarStats();
        setupMenu();
    } catch (error) {
        console.error("Data error:", error);
    }
}

function updateTopBarStats() {
    let stats = JSON.parse(localStorage.getItem('ssc_stats')) || { totalCorrect: 0, currentLevel: 1, streak: 0, lastLogin: null };
    let progress = JSON.parse(localStorage.getItem('ssc_progress')) || {};
    
    // Streak Logic
    let now = new Date();
    let today = now.toDateString();
    let yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    
    if (stats.lastLogin !== today) {
        if (stats.lastLogin === yesterday.toDateString()) {
            stats.streak += 1;
        } else {
            stats.streak = 1; // Reset streak if a day is missed
        }
        stats.lastLogin = today;
        localStorage.setItem('ssc_stats', JSON.stringify(stats));
    }
    
    document.getElementById('streak-display').innerText = `🔥 Streak: ${stats.streak}`;

    // Due Today Logic
    let dueCount = 0;
    let currentTime = Date.now();
    for (let id in progress) {
        if (progress[id].nextReview <= currentTime) dueCount++;
    }
    document.getElementById('due-today-display').innerText = `📅 Due: ${dueCount}`;
}

function updatePlayerLevel(addXP = false) {
    let stats = JSON.parse(localStorage.getItem('ssc_stats')) || { totalCorrect: 0, currentLevel: 1 };
    if (addXP) {
        stats.totalCorrect += 1;
        stats.currentLevel = Math.floor(stats.totalCorrect / 30) + 1;
        localStorage.setItem('ssc_stats', JSON.stringify(stats));
    }
    document.getElementById('menu-level-badge').innerText = `LEVEL ${stats.currentLevel}`;
    document.getElementById('submenu-level-badge').innerText = `LEVEL ${stats.currentLevel}`;
}

// --- 2. FOCUS MODE & FACT SEARCH ---
document.getElementById('focus-toggle-btn').onclick = () => {
    document.body.classList.toggle('focus-mode');
};

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    if (query.length < 3) {
        searchResults.classList.add('hidden');
        return;
    }
    
    searchResults.innerHTML = "";
    let matches = 0;
    
    for (let q of allData) {
        if (!q.facts) continue;
        for (let fact of q.facts) {
            if (fact.toLowerCase().includes(query)) {
                let div = document.createElement('div');
                div.className = 'search-result-item';
                let highlighted = fact.replace(new RegExp(query, 'gi'), match => `<span class="search-highlight">${match}</span>`);
                let cleanSubject = q.subject.replace(/\.pdf$/i, '').trim();
                div.innerHTML = `<strong>${cleanSubject}</strong>: ${highlighted}`;
                searchResults.appendChild(div);
                matches++;
                if (matches >= 10) break; // Limit results to 10 for performance
            }
        }
        if (matches >= 10) break;
    }
    
    if (matches > 0) searchResults.classList.remove('hidden');
    else searchResults.classList.add('hidden');
});

// Hide search dropdown when clicking outside
document.addEventListener('click', (e) => { 
    if (e.target !== searchInput) searchResults.classList.add('hidden'); 
});

// --- 3. MENU & SUB-MENU LOGIC ---
function setupMenu() {
    const subjects = [...new Set(allData.map(q => q.subject))];
    subjectButtonsContainer.innerHTML = "";
    subjects.forEach(subject => {
        const btn = document.createElement('button');
        const cleanName = subject.replace(/\.pdf$/i, '').trim();
        btn.innerText = cleanName;
        btn.onclick = () => showSubmenu(subject, cleanName);
        subjectButtonsContainer.appendChild(btn);
    });
}

function showSubmenu(originalSubject, cleanName) {
    currentSubject = originalSubject; 
    menuScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    submenuScreen.classList.remove('hidden');
    
    document.getElementById('submenu-title').innerText = cleanName;
    submenuButtonsContainer.innerHTML = "";

    const modes = [
        { name: "⚡ Quick Quiz (15 Qs)", count: 15, type: "standard" },
        { name: "🎯 Standard Session (30 Qs)", count: 30, type: "standard" },
        { name: "🔥 Deep Dive (50 Qs)", count: 50, type: "standard" },
        { name: "⏱️ Exam Speed Run (15s/Q)", count: 30, type: "speed" },
        { name: "☠️ Weakness Realm (Mistakes)", count: 30, type: "mistakes" }
    ];

    modes.forEach(mode => {
        const btn = document.createElement('button');
        btn.innerText = mode.name;
        // Style specific modes slightly differently
        if(mode.type === "mistakes") btn.style.borderLeft = "4px solid #ff0055";
        if(mode.type === "speed") btn.style.borderLeft = "4px solid #ff8c00";
        
        btn.onclick = () => startLesson(originalSubject, mode.count, mode.type);
        submenuButtonsContainer.appendChild(btn);
    });
}

document.getElementById('back-to-menu-btn').onclick = () => {
    submenuScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
};

// --- 4. GAMEPLAY LOGIC ---
function startLesson(subject, totalQuestions, modeType) {
    let subjectData = allData.filter(q => q.subject === subject);
    const progress = JSON.parse(localStorage.getItem('ssc_progress')) || {};
    const now = Date.now();
    
    isSpeedRun = (modeType === "speed");
    document.getElementById('timer-display').classList.toggle('hidden', !isSpeedRun);
    
    let reviews = [];
    let newQuestions = [];
    let mistakes = [];
    
    subjectData.forEach(q => {
        q.userSelected = null; // Reset for new session
        let p = progress[q.id];
        
        if (!p) {
            newQuestions.push(q);
        } else {
            if (p.streak === 0) mistakes.push(q);
            if (p.nextReview <= now) {
                q.priority = now - p.nextReview; 
                reviews.push(q);
            }
        }
    });
    
    if (modeType === "mistakes") {
        if (mistakes.length === 0) {
            alert("No mistakes logged for this subject! Your accuracy is perfect here.");
            return;
        }
        currentLesson = mistakes.sort(() => Math.random() - 0.5).slice(0, totalQuestions);
    } else {
        reviews.sort((a, b) => b.priority - a.priority);
        let reviewQuota = Math.floor(totalQuestions / 2);
        let selectedReviews = reviews.slice(0, reviewQuota); 
        let neededNew = totalQuestions - selectedReviews.length; 
        let selectedNew = newQuestions.slice(0, neededNew);
        currentLesson = [...selectedReviews, ...selectedNew].sort(() => Math.random() - 0.5);
    }
    
    if (currentLesson.length === 0) {
        alert("You have mastered all available questions for this subject! Come back tomorrow.");
        location.reload();
        return;
    }
    
    currentQuestionIndex = 0;
    score = 0;
    document.getElementById('subject-title').innerText = subject.replace(/\.pdf$/i, '').trim();
    
    submenuScreen.classList.add('hidden');
    quizScreen.classList.remove('hidden');
    
    loadQuestion();
}

function parseOptions(rawString) {
    const options = { A: "N/A", B: "N/A", C: "N/A", D: "N/A" };
    const cleanStr = rawString.replace(/\n/g, ' '); 
    const regex = /\(([A-D])\)\s*([^()]+)/g;
    let match;
    while ((match = regex.exec(cleanStr)) !== null) options[match[1]] = match[2].trim();
    return options;
}

function startSpeedTimer() {
    clearInterval(timerInterval);
    let timeLeft = 15;
    const timerDisplay = document.getElementById('timer-display');
    timerDisplay.innerText = `⏱️ ${timeLeft}s`;
    timerDisplay.classList.remove('timer-warning');
    
    timerInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.innerText = `⏱️ ${timeLeft}s`;
        if (timeLeft <= 5) timerDisplay.classList.add('timer-warning');
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            let q = currentLesson[currentQuestionIndex];
            handleAnswer(null, q.correct_answer, null, q, true); // Trigger timeout failure
        }
    }, 1000);
}

function loadQuestion() {
    feedbackCard.classList.add('hidden'); 
    optionsContainer.innerHTML = ""; 
    
    const q = currentLesson[currentQuestionIndex];
    const totalQ = currentLesson.length;
    
    document.getElementById('question-counter').innerText = `${currentQuestionIndex + 1} / ${totalQ}`;
    progressFill.style.width = `${(currentQuestionIndex / totalQ) * 100}%`;
    document.getElementById('question-text').innerText = q.question;
    
    prevBtn.classList.toggle('hidden', currentQuestionIndex === 0);
    
    const optionsObj = parseOptions(q.raw_options_text);
    ['A', 'B', 'C', 'D'].forEach(letter => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = `${letter}) ${optionsObj[letter]}`;
        
        if (q.userSelected || q.timedOut) {
            btn.disabled = true;
            if (letter === q.correct_answer) btn.classList.add('correct');
            if (letter === q.userSelected && letter !== q.correct_answer) btn.classList.add('wrong');
        } else {
            btn.onclick = () => handleAnswer(letter, q.correct_answer, btn, q, false);
        }
        
        optionsContainer.appendChild(btn);
    });

    if (q.userSelected || q.timedOut) {
        showFeedback((q.userSelected === q.correct_answer) && !q.timedOut, q.correct_answer, q);
        document.getElementById('standard-nav').classList.remove('hidden');
        document.getElementById('anki-nav').classList.add('hidden');
    } else if (isSpeedRun) {
        startSpeedTimer();
    }
}

function handleAnswer(selected, correct, btnElement, questionData, isTimeout) {
    clearInterval(timerInterval);
    const isCorrect = (selected === correct) && !isTimeout;
    
    questionData.userSelected = selected; 
    if (isTimeout) questionData.timedOut = true;
    
    optionsContainer.querySelectorAll('.option-btn').forEach(b => {
        b.disabled = true;
        if (b.innerText.startsWith(correct)) b.classList.add('correct');
    });

    if (isCorrect) {
        btnElement.classList.add('correct');
        score++;
        updatePlayerLevel(true);
        // Show Anki Rating for correct answers
        document.getElementById('standard-nav').classList.add('hidden');
        document.getElementById('anki-nav').classList.remove('hidden');
    } else {
        if (btnElement) btnElement.classList.add('wrong');
        // Standard Next for wrong answers
        document.getElementById('standard-nav').classList.remove('hidden');
        document.getElementById('anki-nav').classList.add('hidden');
        saveProgress(questionData.id, 0); // Immediately save wrong answer (Streak 0)
    }
    
    showFeedback(isCorrect, correct, questionData, isTimeout);
}

function showFeedback(isCorrect, correct, questionData, isTimeout = false) {
    if (isTimeout) {
        document.getElementById('feedback-title').innerHTML = `<span style='color:#ff8c00;'>⏳ TIME'S UP!</span> <span style="font-size:1rem; color:#ccc;">(Answer: ${correct})</span>`;
        feedbackCard.className = "error-border"; 
    } else if (isCorrect) {
        document.getElementById('feedback-title').innerHTML = "<span style='color:#00ffcc;'>✅ CORRECT</span>";
        feedbackCard.className = "success-border"; 
    } else {
        document.getElementById('feedback-title').innerHTML = `<span style='color:#ff0055;'>❌ INCORRECT</span> <span style="font-size:1rem; color:#ccc;">(Answer: ${correct})</span>`;
        feedbackCard.className = "error-border"; 
    }
    
    factsList.innerHTML = "";
    if (questionData.facts && questionData.facts.length > 0) {
        questionData.facts.forEach(fact => {
            const li = document.createElement('li');
            li.innerHTML = fact.replace('→', '<strong style="color:#00ffcc;">→</strong>');
            factsList.appendChild(li);
        });
    } else {
        factsList.innerHTML = "<li>No important one-liners available.</li>";
    }
    
    feedbackCard.classList.remove('hidden');
}

// --- 5. PROGRESS SAVING & ANKI LOGIC ---
function saveProgress(questionId, daysToAdd) {
    let progress = JSON.parse(localStorage.getItem('ssc_progress')) || {};
    let now = Date.now();
    let oneDay = 24 * 60 * 60 * 1000;
    
    if (!progress[questionId]) progress[questionId] = { streak: 0 };
    
    if (daysToAdd > 0) {
        progress[questionId].streak += 1;
        progress[questionId].nextReview = now + (daysToAdd * oneDay);
    } else {
        progress[questionId].streak = 0; // Wrong answer resets streak
        progress[questionId].nextReview = now + oneDay; // Review tomorrow
    }
    localStorage.setItem('ssc_progress', JSON.stringify(progress));
    updateTopBarStats();
}

// Anki Buttons (Correct Answers Only)
document.querySelectorAll('.anki-btn').forEach(btn => {
    btn.onclick = (e) => {
        let days = parseInt(e.target.getAttribute('data-days'));
        let currentQ = currentLesson[currentQuestionIndex];
        saveProgress(currentQ.id, days);
        document.getElementById('next-btn').click();
    };
});

// --- 6. NAVIGATION & SHORTCUTS ---
nextBtn.onclick = () => {
    currentQuestionIndex++;
    if (currentQuestionIndex < currentLesson.length) {
        loadQuestion();
    } else {
        quizScreen.classList.add('hidden');
        resultScreen.classList.remove('hidden');
        document.getElementById('final-score').innerText = `Score: ${score}/${currentLesson.length}`;
        progressFill.style.width = "100%";
        
        let stats = JSON.parse(localStorage.getItem('ssc_stats')) || { totalCorrect: 0 };
        document.getElementById('level-up-msg').classList.toggle('hidden', !(score > 0 && stats.totalCorrect % 30 < score));
    }
};

prevBtn.onclick = () => {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        loadQuestion();
    }
};

document.getElementById('next-set-btn').onclick = () => {
    const cleanName = currentSubject.replace(/\.pdf$/i, '').trim();
    showSubmenu(currentSubject, cleanName);
};

document.getElementById('review-btn').onclick = () => {
    currentQuestionIndex = 0;
    resultScreen.classList.add('hidden');
    quizScreen.classList.remove('hidden');
    loadQuestion();
};

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    if (document.activeElement === searchInput) return; // Don't trigger if typing in search bar
    
    if (!quizScreen.classList.contains('hidden')) {
        const optionMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', 'a': 'A', 'b': 'B', 'c': 'C', 'd': 'D' };
        
        if (optionMap[e.key.toLowerCase()]) {
            let btns = optionsContainer.querySelectorAll('.option-btn');
            btns.forEach(btn => {
                if (btn.innerText.startsWith(optionMap[e.key.toLowerCase()]) && !btn.disabled) {
                    btn.click();
                }
            });
        }
        
        if (e.key === ' ' && !feedbackCard.classList.contains('hidden')) {
            e.preventDefault();
            // If Anki nav is shown, default to "Good" via spacebar
            if (!document.getElementById('anki-nav').classList.contains('hidden')) {
                document.getElementById('anki-good-btn').click();
            } else if (!document.getElementById('standard-nav').classList.contains('hidden')) {
                nextBtn.click();
            }
        }
        
        if (e.key === 'Backspace' && !prevBtn.classList.contains('hidden')) {
            prevBtn.click();
        }
    }
});

// Boot up
loadGameData();